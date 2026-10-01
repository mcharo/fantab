import {
  hasPlayedAudibly,
  rejectMediaReason,
  rejectVideoReason,
  trustMediaSession,
  type MediaCandidate,
  type VideoCandidate,
} from './mediaEligibility';
import type { MediaStateChangedMessage } from './messaging';
import type { MediaCommand, TabMediaState } from './types';
import type { VideoMirrorSignal } from './videoMirror';

(() => {
  const CONTENT_SCRIPT_GLOBAL = '__fantabContentScript';
  const MEDIA_DEBUG_GLOBAL = '__fantabMediaDebug';
  // The side panel reaches these through chrome.scripting.executeScript in this
  // (isolated) world rather than by message, so the click's user activation
  // carries into the page for play() and requestPictureInPicture(). See the
  // *InPage helpers in src/sidepanel/App.svelte, which mirror this shape.
  interface ContentScriptHandle {
    teardown: () => void;
    runMediaCommand: (command: MediaCommand) => boolean;
    setMediaVolume: (volume: number, muted: boolean) => boolean;
    pictureInPictureTarget: () => HTMLVideoElement | null;
  }
  const globalScope = window as typeof window & {
    [CONTENT_SCRIPT_GLOBAL]?: ContentScriptHandle;
    [MEDIA_DEBUG_GLOBAL]?: () => MediaDiagnostic[];
  };

  // A prior instance can still be live on this page: orphaned after an
  // extension reload, or a duplicate programmatic injection on top of the
  // manifest-injected one. Tear it down so only this fresh instance handles
  // events (otherwise listeners stack up and report duplicates).
  globalScope[CONTENT_SCRIPT_GLOBAL]?.teardown();

  interface LinkRoutingPolicy {
    isHomePin: boolean;
    homeUrl: string | null;
  }

  interface PolicyUpdatedMessage {
    action: 'LINK_ROUTING_POLICY_UPDATED';
    payload: LinkRoutingPolicy;
  }

  interface OpenExternalLinkResponse {
    opened: boolean;
  }

  interface CopyTextToClipboardMessage {
    action: 'COPY_TEXT_TO_CLIPBOARD';
    payload: {
      text: string;
    };
  }

  interface CopyTextToClipboardResponse {
    copied: boolean;
    error?: string;
  }

  interface SwitchSpaceByIndexMessage {
    action: 'SWITCH_SPACE_BY_INDEX';
    payload: {
      index: number;
    };
  }

  const emptyPolicy: LinkRoutingPolicy = {
    isHomePin: false,
    homeUrl: null,
  };

  let policy: LinkRoutingPolicy | null = null;
  let pendingPolicyRefresh: Promise<void> | null = null;
  let contextInvalidated = false;

  // After the extension is reloaded/updated, this already-injected content
  // script is orphaned: chrome.runtime.id becomes undefined and any
  // sendMessage call throws "Extension context invalidated". Detect that and
  // stop reaching for the runtime.
  function extensionContextValid(): boolean {
    if (contextInvalidated) return false;

    let valid = false;
    try {
      valid = Boolean(chrome.runtime?.id);
    } catch {
      valid = false;
    }

    if (!valid) {
      contextInvalidated = true;
      teardown();
    }

    return valid;
  }

  // Mirror of getRegistrableDomain in src/lib/url.ts. Kept inline so the content
  // script stays a self-contained bundle (no shared chunk imports). Update both
  // copies together.
  const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
    'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'net.uk', 'sch.uk', 'ltd.uk',
    'plc.uk',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
    'co.nz', 'net.nz', 'org.nz', 'govt.nz',
    'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
    'co.kr', 'or.kr',
    'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in',
    'co.za', 'org.za',
    'com.br', 'net.br', 'org.br', 'gov.br',
    'com.cn', 'net.cn', 'org.cn', 'gov.cn',
    'com.mx', 'com.sg', 'com.hk', 'com.tw', 'com.tr', 'com.ar', 'com.pl',
    'co.id', 'co.il', 'co.th',
  ]);

  function getRegistrableDomain(hostname: string): string {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    const labels = host.split('.');
    if (labels.length <= 2) return host;

    const lastTwo = labels.slice(-2).join('.');
    if (MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
      return labels.slice(-3).join('.');
    }
    return lastTwo;
  }

  function isSupportedWebUrl(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  // Compare by registrable (base) domain so cross-subdomain redirects (e.g.
  // play.hbomax.com -> www.hbomax.com) are treated as the same site and don't
  // spill into new tabs.
  function isSameSiteAsHomeUrl(targetUrl: string, homeUrl: string): boolean {
    try {
      const target = new URL(targetUrl);
      const home = new URL(homeUrl);

      if (!isSupportedWebUrl(target) || !isSupportedWebUrl(home)) {
        return false;
      }

      const targetDomain = getRegistrableDomain(target.hostname);
      const homeDomain = getRegistrableDomain(home.hostname);

      return targetDomain !== '' && targetDomain === homeDomain;
    } catch {
      return false;
    }
  }

  function isPolicy(value: unknown): value is LinkRoutingPolicy {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<LinkRoutingPolicy>;
    return (
      typeof candidate.isHomePin === 'boolean' &&
      (candidate.homeUrl === null || typeof candidate.homeUrl === 'string')
    );
  }

  function isPolicyUpdatedMessage(
    message: unknown,
  ): message is PolicyUpdatedMessage {
    if (!message || typeof message !== 'object') return false;

    const candidate = message as Partial<PolicyUpdatedMessage>;
    return (
      candidate.action === 'LINK_ROUTING_POLICY_UPDATED' &&
      isPolicy(candidate.payload)
    );
  }

  function isMediaReportRequest(message: unknown): boolean {
    return (
      !!message &&
      typeof message === 'object' &&
      (message as { action?: unknown }).action === 'REQUEST_MEDIA_REPORT'
    );
  }

  function isCopyTextToClipboardMessage(
    message: unknown,
  ): message is CopyTextToClipboardMessage {
    if (!message || typeof message !== 'object') return false;

    const candidate = message as Partial<CopyTextToClipboardMessage>;
    return (
      candidate.action === 'COPY_TEXT_TO_CLIPBOARD' &&
      !!candidate.payload &&
      typeof candidate.payload.text === 'string'
    );
  }

  function fallbackCopyText(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';

    document.body.append(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }

  async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Content scripts can still sometimes copy through execCommand when
        // navigator.clipboard rejects the write.
      }
    }

    if (!fallbackCopyText(text)) {
      throw new Error('Clipboard write failed');
    }
  }

  function refreshPolicy(): Promise<void> {
    if (!extensionContextValid()) {
      policy = emptyPolicy;
      return Promise.resolve();
    }

    pendingPolicyRefresh ??= requestPolicy();
    return pendingPolicyRefresh;
  }

  async function requestPolicy(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GET_LINK_ROUTING_POLICY',
        payload: {},
      });
      policy = isPolicy(response) ? response : emptyPolicy;
    } catch {
      // The extension was likely reloaded/updated; fall back to a no-op policy
      // and re-check so listeners get torn down if the context is gone.
      policy = emptyPolicy;
      extensionContextValid();
    } finally {
      pendingPolicyRefresh = null;
    }
  }

  function getAnchor(target: EventTarget | null): HTMLAnchorElement | null {
    if (!(target instanceof Element)) return null;

    const anchor = target.closest('a[href]');
    return anchor instanceof HTMLAnchorElement ? anchor : null;
  }

  function getWebUrl(anchor: HTMLAnchorElement): string | null {
    if (anchor.download) return null;

    try {
      const url = new URL(anchor.href);
      return isSupportedWebUrl(url) ? url.href : null;
    } catch {
      return null;
    }
  }

  function isPlainPrimaryClick(event: MouseEvent): boolean {
    return (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    );
  }

  function shouldStayInPinnedTab(
    anchor: HTMLAnchorElement,
    targetUrl: string,
    homeUrl: string,
  ): boolean {
    return (
      isSameSiteAsHomeUrl(targetUrl, homeUrl) &&
      !!anchor.target &&
      anchor.target.toLowerCase() !== '_self'
    );
  }

  function openInCurrentTab(url: string): void {
    window.location.assign(url);
  }

  async function openExternalLink(url: string): Promise<void> {
    if (!extensionContextValid()) {
      openInCurrentTab(url);
      return;
    }

    try {
      const response = (await chrome.runtime.sendMessage({
        action: 'OPEN_EXTERNAL_LINK_FROM_HOME_PIN',
        payload: { url },
      })) as OpenExternalLinkResponse | undefined;

      if (!response?.opened) {
        openInCurrentTab(url);
      }
    } catch {
      openInCurrentTab(url);
    }
  }

  function spaceShortcutIndex(event: KeyboardEvent): number | null {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return null;
    }

    const codeMatch = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    const digit =
      codeMatch?.[1] ?? (/^[1-9]$/.test(event.key) ? event.key : null);
    return digit ? Number(digit) - 1 : null;
  }

  async function switchSpaceByIndex(index: number): Promise<void> {
    if (!extensionContextValid()) return;

    const message: SwitchSpaceByIndexMessage = {
      action: 'SWITCH_SPACE_BY_INDEX',
      payload: { index },
    };

    try {
      await chrome.runtime.sendMessage(message);
    } catch {
      extensionContextValid();
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    lastPointerDown = {
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
    };
    if (!getAnchor(event.target)) return;

    void refreshPolicy();
  }

  function handleKeydown(event: KeyboardEvent): void {
    const index = spaceShortcutIndex(event);
    if (index === null) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void switchSpaceByIndex(index);
  }

  function handlePageShow(): void {
    void refreshPolicy();
  }

  function handleFocus(): void {
    void refreshPolicy();
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      void refreshPolicy();
    }
    scheduleMediaReport();
  }

  // --- Media detection -------------------------------------------------------
  // Chrome surfaces tab audio but not video or fine-grained playback state, so
  // we watch media events (they don't bubble, but reach the document in the
  // capture phase) and report a snapshot the side panel uses for the player bar
  // and the rows' play/pause and picture-in-picture buttons. The media bridge
  // (main world) relays the page's MediaSession capabilities and metadata, which
  // we merge in here.
  //
  // Only media the user is consuming counts (rules in ./mediaEligibility). The
  // two facts a snapshot can't show are latched here per element: whether it has
  // been heard, and whether the user deliberately started it.

  const MEDIA_BRIDGE_CHANNEL = 'fantab-media-bridge';
  // Mirror of COMMAND_CHANNEL in ./mediaBridge. Kept inline so the content
  // script stays a self-contained bundle. Update both copies together.
  const MEDIA_COMMAND_CHANNEL = 'fantab-media-command';
  /** A play/(un)mute this soon after a click inside the element is the user's. */
  const USER_GESTURE_WINDOW_MS = 1000;
  /** Steady playback fires only timeupdate; re-evaluate at most this often. */
  const PLAYBACK_RECHECK_MS = 2000;

  interface MediaBridgeSnapshot {
    hasSession: boolean;
    playbackState: 'none' | 'paused' | 'playing';
    canNext: boolean;
    canPrev: boolean;
    canPlay: boolean;
    canPause: boolean;
    title: string;
    artist: string;
  }

  let bridgeSnapshot: MediaBridgeSnapshot | null = null;
  let lastReportedMedia: string | null = null;
  let lastMediaReportAt = 0;
  let mediaReportTimer: number | null = null;
  let lastPointerDown: { x: number; y: number; at: number } | null = null;
  /** What the panel's last pause stopped, so its play resumes the same media. */
  let pausedByPanel: HTMLMediaElement[] = [];

  const heardMedia = new WeakSet<HTMLMediaElement>();
  const engagedMedia = new WeakSet<HTMLMediaElement>();

  function isPlayingVideoEl(video: HTMLVideoElement): boolean {
    return (
      !video.paused &&
      !video.ended &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    );
  }

  function isPlayingMediaEl(el: HTMLMediaElement): boolean {
    if (el instanceof HTMLVideoElement) return isPlayingVideoEl(el);
    return !el.paused && !el.ended && el.readyState >= 2;
  }

  function mediaElements(): HTMLMediaElement[] {
    return [...document.querySelectorAll<HTMLMediaElement>('video, audio')];
  }

  function isPresentedByUser(el: HTMLMediaElement): boolean {
    if (document.pictureInPictureElement === el) return true;
    const fullscreen = document.fullscreenElement;
    return !!fullscreen && (fullscreen === el || fullscreen.contains(el));
  }

  // A play or (un)mute right after a click inside the element's box is the user
  // working its controls (or the site's overlay on top of it), as opposed to
  // autoplay or a hover preview starting on its own.
  function noteUserGesture(el: HTMLMediaElement): void {
    const pointer = lastPointerDown;
    if (!pointer || performance.now() - pointer.at > USER_GESTURE_WINDOW_MS) {
      return;
    }

    const rect = el.getBoundingClientRect();
    if (
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom
    ) {
      engagedMedia.add(el);
    }
  }

  // Snapshot an element for ./mediaEligibility, updating its latches on the way.
  function describeMedia(el: HTMLMediaElement): MediaCandidate {
    const audioCounterSupported = 'webkitAudioDecodedByteCount' in el;
    const decodedAudioBytes = audioCounterSupported
      ? ((el as HTMLMediaElement & { webkitAudioDecodedByteCount?: number })
          .webkitAudioDecodedByteCount ?? 0)
      : 0;

    const candidate: MediaCandidate = {
      readyState: el.readyState,
      paused: el.paused,
      ended: el.ended,
      hasPlayed: el.played.length > 0,
      duration: el.duration,
      muted: el.muted,
      volume: el.volume,
      hasAudioBytes: decodedAudioBytes > 0,
      audioCounterSupported,
      encrypted: el.mediaKeys != null,
      heard: false,
      engaged: false,
    };

    if (hasPlayedAudibly(candidate)) heardMedia.add(el);
    if (isPresentedByUser(el)) engagedMedia.add(el);
    candidate.heard = heardMedia.has(el);
    candidate.engaged = engagedMedia.has(el);
    return candidate;
  }

  function describeVideo(video: HTMLVideoElement): VideoCandidate {
    const rect = video.getBoundingClientRect();
    const style = window.getComputedStyle(video);

    return {
      ...describeMedia(video),
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      rectWidth: rect.width,
      rectHeight: rect.height,
      hidden:
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0,
    };
  }

  interface PageMedia {
    /** Elements the user is consuming (rejectMediaReason passed). */
    significant: HTMLMediaElement[];
    /** Of those, the videos that can be shown: picture-in-picture, the mirror. */
    videos: HTMLVideoElement[];
    /** Something played but was rejected as incidental (see trustMediaSession). */
    hasPlayedIncidental: boolean;
  }

  function classifyPageMedia(): PageMedia {
    const page: PageMedia = {
      significant: [],
      videos: [],
      hasPlayedIncidental: false,
    };

    for (const el of mediaElements()) {
      const isVideo = el instanceof HTMLVideoElement;
      const candidate = isVideo ? describeVideo(el) : describeMedia(el);
      const rejection = rejectMediaReason(candidate);
      if (rejection === 'incidental') page.hasPlayedIncidental = true;
      if (rejection) continue;

      page.significant.push(el);
      if (isVideo && rejectVideoReason(candidate as VideoCandidate) === null) {
        page.videos.push(el);
      }
    }

    return page;
  }

  // The bridge's session, when it counts as this page's media.
  function trustedSession(page: PageMedia): MediaBridgeSnapshot | null {
    const snapshot = bridgeSnapshot;
    const trusted = trustMediaSession(snapshot, {
      hasSignificant: page.significant.length > 0,
      hasPlayedIncidental: page.hasPlayedIncidental,
    });
    return trusted ? snapshot : null;
  }

  // --- Detection diagnostics -------------------------------------------------
  // Opt-in (Settings > "Log media detection"): dumps what every media element on
  // the page looks like and which rule rejected it, so the thresholds in
  // ./mediaEligibility can be tuned against sites that misbehave. Logs land in
  // the page's own console. Also reachable as __fantabMediaDebug() once DevTools
  // is switched to the extension's isolated world.
  //
  // Mirror of PREFERENCES_KEY in src/preferences.ts. Kept inline so the content
  // script stays a self-contained bundle. Update both copies together.
  const PREFERENCES_KEY = 'fantab_preferences';

  type MediaDiagnostic = (MediaCandidate | VideoCandidate) & {
    element: 'video' | 'audio';
    src: string;
    /** rejectMediaReason: whether it counts as the tab's media. */
    media: string;
    /** rejectVideoReason: whether it can be shown (PiP, mirror). */
    video: string;
  };

  let mediaDebugEnabled = false;
  let lastDiagnosticsKey = '';

  function mediaDiagnostics(): MediaDiagnostic[] {
    return mediaElements().map((el) => {
      const isVideo = el instanceof HTMLVideoElement;
      const candidate = isVideo ? describeVideo(el) : describeMedia(el);
      return {
        ...candidate,
        element: isVideo ? 'video' : 'audio',
        src: el.currentSrc || el.src || '(none)',
        media: rejectMediaReason(candidate) ?? 'counts',
        video: isVideo
          ? (rejectVideoReason(candidate as VideoCandidate) ?? 'eligible')
          : '-',
      };
    });
  }

  // Logs only when an element's verdict changes, since steady playback
  // re-evaluates every couple of seconds.
  function logMediaDiagnostics(): void {
    if (!mediaDebugEnabled) return;

    const rows = mediaDiagnostics();
    const session = bridgeSnapshot?.hasSession ? bridgeSnapshot : null;
    const key = JSON.stringify([
      rows.map((row) => [row.src, row.media, row.video]),
      session,
    ]);
    if (key === lastDiagnosticsKey) return;
    lastDiagnosticsKey = key;
    if (rows.length === 0 && !session) return;

    console.groupCollapsed(
      `[fantab] media detection (${rows.length} element${rows.length === 1 ? '' : 's'})`,
    );
    if (rows.length > 0) console.table(rows);
    if (session) {
      const page = classifyPageMedia();
      console.log(
        `media session (${trustedSession(page) ? 'trusted' : 'ignored'})`,
        session,
      );
    }
    console.groupEnd();
  }

  function applyDebugPreference(stored: unknown): void {
    mediaDebugEnabled =
      (stored as { mediaDebugLogging?: unknown } | undefined)
        ?.mediaDebugLogging === true;
    lastDiagnosticsKey = '';
  }

  function handleStorageChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void {
    if (areaName !== 'local' || !(PREFERENCES_KEY in changes)) return;
    applyDebugPreference(changes[PREFERENCES_KEY].newValue);
  }

  function refreshDebugPreference(): void {
    if (!extensionContextValid()) return;

    try {
      void chrome.storage.local
        .get(PREFERENCES_KEY)
        .then((stored) => applyDebugPreference(stored[PREFERENCES_KEY]))
        .catch(() => {
          // Storage unavailable; leave logging off.
        });
    } catch {
      extensionContextValid();
    }
  }

  function renderedArea(el: HTMLMediaElement): number {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0) return area;
    if (el instanceof HTMLVideoElement) return el.videoWidth * el.videoHeight;
    return 0;
  }

  // The element the volume readout reflects and "play" falls back to: the
  // largest playing element (videos rank above audio by rendered area), else
  // the largest ready one.
  function primaryMediaElement(
    elements: HTMLMediaElement[],
  ): HTMLMediaElement | null {
    const ready = elements.filter((el) => el.readyState >= 2);
    const playing = ready.filter((el) => !el.paused && !el.ended);
    const pool =
      playing.length > 0 ? playing : ready.length > 0 ? ready : elements;
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => renderedArea(b) - renderedArea(a))[0];
  }

  // The video picture-in-picture and the mirror act on: the largest eligible
  // one, preferring what's playing.
  function primaryVideoElement(): HTMLVideoElement | null {
    const { videos } = classifyPageMedia();
    const playing = videos.filter((video) => !video.paused && !video.ended);
    const pool = playing.length > 0 ? playing : videos;
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => renderedArea(b) - renderedArea(a))[0];
  }

  function buildMediaState(): TabMediaState {
    const page = classifyPageMedia();
    const session = trustedSession(page);
    const primary = primaryMediaElement(page.significant);

    const hasMedia = page.significant.length > 0 || session !== null;
    const isPlaying =
      page.significant.some(isPlayingMediaEl) ||
      session?.playbackState === 'playing';
    const title =
      (session?.title ?? '').trim() || (hasMedia ? document.title : '');

    return {
      hasMedia,
      isPlaying,
      hasVideo: page.videos.length > 0,
      canNext: !!session?.canNext,
      canPrev: !!session?.canPrev,
      volume: primary ? primary.volume : 1,
      muted: primary ? primary.muted : false,
      title,
      artist: (session?.artist ?? '').trim(),
    };
  }

  // Run a transport action from the side panel. The site's own MediaSession
  // handler wins (it knows its playlist and keeps its UI in sync); otherwise
  // play/pause drive the elements directly. Returns whether anything was tried.
  function runMediaCommand(command: MediaCommand): boolean {
    const page = classifyPageMedia();
    const session = trustedSession(page);
    const sessionHandles = {
      play: session?.canPlay,
      pause: session?.canPause,
      nexttrack: session?.canNext,
      previoustrack: session?.canPrev,
    }[command];

    if (sessionHandles) {
      window.postMessage({ source: MEDIA_COMMAND_CHANNEL, action: command }, '*');
      return true;
    }

    if (command === 'pause') {
      pausedByPanel = page.significant.filter((el) => !el.paused && !el.ended);
      for (const el of pausedByPanel) el.pause();
      return pausedByPanel.length > 0;
    }

    if (command === 'play') {
      const resumable = pausedByPanel.filter(
        (el) => el.paused && page.significant.includes(el),
      );
      const primary = primaryMediaElement(page.significant);
      const targets = resumable.length > 0 ? resumable : primary ? [primary] : [];
      pausedByPanel = [];
      for (const el of targets) void el.play().catch(() => {});
      return targets.length > 0;
    }

    return false;
  }

  // Volume/mute from the player bar, applied only to the media that counts:
  // unmuting a hover preview or background loop would make it audible.
  function setMediaVolume(volume: number, muted: boolean): boolean {
    const { significant } = classifyPageMedia();
    const clamped = Math.min(1, Math.max(0, volume));
    for (const el of significant) {
      el.volume = clamped;
      el.muted = muted;
    }
    return significant.length > 0;
  }

  function reportMediaState(): void {
    if (!extensionContextValid()) return;

    lastMediaReportAt = performance.now();
    logMediaDiagnostics();

    const state = buildMediaState();
    const serialized = JSON.stringify(state);
    if (serialized === lastReportedMedia) return;
    lastReportedMedia = serialized;

    const message: MediaStateChangedMessage = {
      action: 'MEDIA_STATE_CHANGED',
      payload: { state },
    };

    try {
      void chrome.runtime.sendMessage(message);
    } catch {
      extensionContextValid();
    }
  }

  function scheduleMediaReport(): void {
    if (mediaReportTimer !== null) return;
    mediaReportTimer = window.setTimeout(() => {
      mediaReportTimer = null;
      reportMediaState();
    }, 250);
  }

  function handleMediaEvent(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLMediaElement) {
      if (event.type === 'play' || event.type === 'volumechange') {
        noteUserGesture(target);
      }
      if (
        event.type === 'timeupdate' &&
        performance.now() - lastMediaReportAt < PLAYBACK_RECHECK_MS
      ) {
        return;
      }
    }
    scheduleMediaReport();
  }

  function handleBridgeMessage(event: MessageEvent): void {
    if (event.source !== window) return;
    const data = event.data as {
      source?: string;
      snapshot?: MediaBridgeSnapshot;
    } | null;
    if (!data || data.source !== MEDIA_BRIDGE_CHANNEL || !data.snapshot) return;
    bridgeSnapshot = data.snapshot;
    scheduleMediaReport();
  }

  const MEDIA_EVENTS = [
    'play',
    'playing',
    'pause',
    'ended',
    'emptied',
    'loadeddata',
    'loadedmetadata',
    'volumechange',
    'timeupdate',
    'enterpictureinpicture',
    'leavepictureinpicture',
    // Not a media event, but it bubbles to the document and latches the
    // fullscreened player as engaged.
    'fullscreenchange',
  ];

  // --- Video mirror (WebRTC producer) ----------------------------------------
  // The side panel can't reference this tab's <video>, so when it opens a port
  // we capture the primary video and stream it over a loopback peer connection.
  // We send video only; the page keeps playing its own audio.
  //
  // Kept as a local literal (matching VIDEO_MIRROR_PORT in ./videoMirror) so the
  // content script bundle stays a single self-contained classic script with no
  // import statements, which manifest content scripts require.
  const VIDEO_MIRROR_PORT = 'fantab-video-mirror';

  let mirrorPort: chrome.runtime.Port | null = null;
  let mirrorPc: RTCPeerConnection | null = null;
  let mirrorStream: MediaStream | null = null;
  let mirrorRemoteReady = false;
  let mirrorPendingIce: RTCIceCandidateInit[] = [];

  function stopVideoMirror(): void {
    mirrorRemoteReady = false;
    mirrorPendingIce = [];
    if (mirrorPc) {
      try {
        mirrorPc.close();
      } catch {
        // already closed
      }
      mirrorPc = null;
    }
    if (mirrorStream) {
      for (const track of mirrorStream.getTracks()) track.stop();
      mirrorStream = null;
    }
    if (mirrorPort) {
      try {
        mirrorPort.disconnect();
      } catch {
        // already disconnected
      }
      mirrorPort = null;
    }
  }

  function postMirror(signal: VideoMirrorSignal): void {
    try {
      mirrorPort?.postMessage(signal);
    } catch {
      // Port closed mid-negotiation.
    }
  }

  async function startVideoMirror(): Promise<void> {
    const video = primaryVideoElement();
    if (!video) {
      postMirror({ type: 'error', message: 'No video is playing' });
      return;
    }

    try {
      const capturable = video as HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const captured =
        capturable.captureStream?.() ?? capturable.mozCaptureStream?.();
      const videoTracks = captured?.getVideoTracks() ?? [];
      if (videoTracks.length === 0) throw new Error('no video track');
      mirrorStream = new MediaStream(videoTracks);
    } catch {
      postMirror({ type: 'error', message: 'This video can’t be mirrored' });
      return;
    }

    const pc = new RTCPeerConnection();
    mirrorPc = pc;

    for (const track of mirrorStream.getVideoTracks()) {
      pc.addTrack(track, mirrorStream);
      track.addEventListener('ended', () => {
        postMirror({ type: 'ended' });
        stopVideoMirror();
      });
    }

    pc.addEventListener('icecandidate', (event) => {
      postMirror({
        type: 'ice',
        candidate: event.candidate ? event.candidate.toJSON() : null,
      });
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') stopVideoMirror();
    });

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Best-effort cap so the loopback encode stays light; ignored if unsupported.
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        const params = sender.getParameters();
        params.encodings = [{ maxBitrate: 2_500_000 }];
        void sender.setParameters(params).catch(() => {});
      }
      postMirror({
        type: 'offer',
        description: { type: offer.type, sdp: offer.sdp },
      });
    } catch {
      postMirror({ type: 'error', message: 'Could not start mirror' });
      stopVideoMirror();
    }
  }

  async function handleMirrorSignal(message: VideoMirrorSignal): Promise<void> {
    const pc = mirrorPc;
    if (!pc) return;
    try {
      if (message.type === 'answer') {
        await pc.setRemoteDescription(message.description);
        mirrorRemoteReady = true;
        for (const candidate of mirrorPendingIce) {
          await pc.addIceCandidate(candidate).catch(() => {});
        }
        mirrorPendingIce = [];
      } else if (message.type === 'ice' && message.candidate) {
        if (mirrorRemoteReady) await pc.addIceCandidate(message.candidate);
        else mirrorPendingIce.push(message.candidate);
      } else if (message.type === 'stop') {
        stopVideoMirror();
      }
    } catch {
      // Negotiation race or stale candidate; safe to ignore.
    }
  }

  function handleMirrorConnect(port: chrome.runtime.Port): void {
    if (port.name !== VIDEO_MIRROR_PORT) return;

    // One mirror at a time; a new request replaces any prior one.
    stopVideoMirror();
    mirrorPort = port;

    port.onMessage.addListener((message: VideoMirrorSignal) => {
      void handleMirrorSignal(message);
    });
    port.onDisconnect.addListener(() => {
      if (mirrorPort === port) stopVideoMirror();
    });

    void startVideoMirror();
  }

  function teardown(): void {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('message', handleBridgeMessage);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    chrome.runtime.onConnect.removeListener(handleMirrorConnect);
    chrome.storage.onChanged.removeListener(handleStorageChanged);
    stopVideoMirror();
    for (const type of MEDIA_EVENTS) {
      document.removeEventListener(type, handleMediaEvent, true);
    }
    if (mediaReportTimer !== null) {
      window.clearTimeout(mediaReportTimer);
      mediaReportTimer = null;
    }
    delete globalScope[MEDIA_DEBUG_GLOBAL];
  }

  function handleClick(event: MouseEvent): void {
    if (!isPlainPrimaryClick(event)) return;

    const anchor = getAnchor(event.target);
    if (!anchor) return;

    const targetUrl = getWebUrl(anchor);
    if (!targetUrl) return;

    void refreshPolicy();

    if (!policy?.isHomePin || !policy.homeUrl) return;

    if (shouldStayInPinnedTab(anchor, targetUrl, policy.homeUrl)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openInCurrentTab(targetUrl);
      return;
    }

    if (isSameSiteAsHomeUrl(targetUrl, policy.homeUrl)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    void openExternalLink(targetUrl);
  }

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isPolicyUpdatedMessage(message)) {
      policy = message.payload;
      return false;
    }

    // The background dropped this tab's media record (its URL changed) and
    // needs the current state, even if it matches what was last sent.
    if (isMediaReportRequest(message)) {
      lastReportedMedia = null;
      scheduleMediaReport();
      return false;
    }

    if (isCopyTextToClipboardMessage(message)) {
      copyText(message.payload.text)
        .then(() => {
          const response: CopyTextToClipboardResponse = { copied: true };
          sendResponse(response);
        })
        .catch((error: unknown) => {
          const response: CopyTextToClipboardResponse = {
            copied: false,
            error:
              error instanceof Error ? error.message : 'Clipboard write failed',
          };
          sendResponse(response);
        });

      return true;
    }

    return false;
  });

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('message', handleBridgeMessage);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  chrome.runtime.onConnect.addListener(handleMirrorConnect);
  chrome.storage.onChanged.addListener(handleStorageChanged);
  for (const type of MEDIA_EVENTS) {
    document.addEventListener(type, handleMediaEvent, true);
  }

  globalScope[CONTENT_SCRIPT_GLOBAL] = {
    teardown,
    runMediaCommand,
    setMediaVolume,
    pictureInPictureTarget: primaryVideoElement,
  };
  globalScope[MEDIA_DEBUG_GLOBAL] = mediaDiagnostics;

  void refreshPolicy();
  refreshDebugPreference();
  scheduleMediaReport();
})();
