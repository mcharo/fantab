import type { MediaStateChangedMessage } from './messaging';
import type { TabMediaState } from './types';
import type { VideoMirrorSignal } from './videoMirror';

(() => {
  const CONTENT_SCRIPT_GLOBAL = '__fantabContentScript';
  interface ContentScriptHandle {
    teardown: () => void;
  }
  const globalScope = window as typeof window & {
    [CONTENT_SCRIPT_GLOBAL]?: ContentScriptHandle;
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

  function normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^www\./, '');
  }

  function isSupportedWebUrl(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  function isSameSiteAsHomeUrl(targetUrl: string, homeUrl: string): boolean {
    try {
      const target = new URL(targetUrl);
      const home = new URL(homeUrl);

      if (!isSupportedWebUrl(target) || !isSupportedWebUrl(home)) {
        return false;
      }

      const targetHost = normalizeHostname(target.hostname);
      const homeHost = normalizeHostname(home.hostname);

      return targetHost === homeHost || targetHost.endsWith(`.${homeHost}`);
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
  // and picture-in-picture. The media bridge (main world) relays the page's
  // MediaSession capabilities and metadata, which we merge in here.

  const MEDIA_BRIDGE_CHANNEL = 'fantab-media-bridge';

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
  let mediaReportTimer: number | null = null;

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
    return [
      ...document.querySelectorAll('video'),
      ...document.querySelectorAll('audio'),
    ] as HTMLMediaElement[];
  }

  function renderedArea(el: HTMLMediaElement): number {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0) return area;
    if (el instanceof HTMLVideoElement) return el.videoWidth * el.videoHeight;
    return 0;
  }

  // The element the volume/mute controls act on: the largest playing media
  // element (videos rank above audio by rendered area), falling back to the
  // largest ready one. Mirrors the picture-in-picture target selection.
  function primaryMediaElement(): HTMLMediaElement | null {
    const elements = mediaElements();
    const ready = elements.filter((el) => el.readyState >= 2);
    const playing = ready.filter((el) => !el.paused && !el.ended);
    const pool = playing.length > 0 ? playing : ready;
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => renderedArea(b) - renderedArea(a))[0];
  }

  function buildMediaState(): TabMediaState {
    const elements = mediaElements();
    const videos = elements.filter(
      (el): el is HTMLVideoElement => el instanceof HTMLVideoElement,
    );
    const hasVideo = videos.some(
      (video) => video.readyState >= 2 && video.videoWidth > 0,
    );
    const primary = primaryMediaElement();
    const snapshot = bridgeSnapshot;

    const domPlaying = elements.some(isPlayingMediaEl);
    const isPlaying = domPlaying || snapshot?.playbackState === 'playing';
    const hasMedia = elements.length > 0 || !!snapshot?.hasSession;
    const title =
      (snapshot?.title ?? '').trim() || (hasMedia ? document.title : '');

    return {
      hasMedia,
      isPlaying,
      isPlayingVideo: videos.some(isPlayingVideoEl),
      hasVideo,
      canNext: !!snapshot?.canNext,
      canPrev: !!snapshot?.canPrev,
      volume: primary ? primary.volume : 1,
      muted: primary ? primary.muted : false,
      title,
      artist: (snapshot?.artist ?? '').trim(),
    };
  }

  function reportMediaState(): void {
    if (!extensionContextValid()) return;

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

  function handleMediaEvent(): void {
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
    'enterpictureinpicture',
    'leavepictureinpicture',
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

  function primaryVideoElement(): HTMLVideoElement | null {
    const videos = [...document.querySelectorAll('video')] as HTMLVideoElement[];
    const ready = videos.filter(
      (video) => video.readyState >= 2 && video.videoWidth > 0,
    );
    const playing = ready.filter((video) => !video.paused && !video.ended);
    const pool = playing.length > 0 ? playing : ready;
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => renderedArea(b) - renderedArea(a))[0];
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
    stopVideoMirror();
    for (const type of MEDIA_EVENTS) {
      document.removeEventListener(type, handleMediaEvent, true);
    }
    if (mediaReportTimer !== null) {
      window.clearTimeout(mediaReportTimer);
      mediaReportTimer = null;
    }
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
  for (const type of MEDIA_EVENTS) {
    document.addEventListener(type, handleMediaEvent, true);
  }

  globalScope[CONTENT_SCRIPT_GLOBAL] = { teardown };

  void refreshPolicy();
  scheduleMediaReport();
})();
