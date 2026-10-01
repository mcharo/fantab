// Runs in the page's MAIN world at document_start. The isolated content script
// can read DOM media properties (volume, paused) but not the page's
// `navigator.mediaSession`, which lives in the main world. This bridge patches
// `setActionHandler` so we can both observe which transport actions a site
// supports (next/previous track, play, pause) and invoke them on demand, and it
// relays the session's metadata/playback state to the content script via
// `window.postMessage`. MAIN-world scripts have no access to chrome.* APIs, so
// postMessage is the only channel to and from the extension: snapshots go out on
// CHANNEL, and the content script sends transport commands on COMMAND_CHANNEL.

(() => {
  const CHANNEL = 'fantab-media-bridge';
  // Mirror of MEDIA_COMMAND_CHANNEL in ./contentScript. Update both together.
  const COMMAND_CHANNEL = 'fantab-media-command';

  interface MediaBridgeSnapshot {
    hasSession: boolean;
    playbackState: MediaSessionPlaybackState;
    canNext: boolean;
    canPrev: boolean;
    canPlay: boolean;
    canPause: boolean;
    title: string;
    artist: string;
  }

  interface FantabMediaBridge {
    installed: true;
    invoke: (action: string) => boolean;
    postSnapshot: () => void;
  }

  const scope = window as Window &
    typeof globalThis & {
      __fantabMedia?: FantabMediaBridge;
      __fantabMediaCommands?: true;
    };

  const session = navigator.mediaSession;
  if (!session || typeof session.setActionHandler !== 'function') return;

  // Run commands the content script posts. Installed once per page, and also
  // on re-injection, since a bridge left by an older version may predate it.
  function listenForCommands(bridge: FantabMediaBridge): void {
    if (scope.__fantabMediaCommands) return;
    scope.__fantabMediaCommands = true;

    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { source?: unknown; action?: unknown } | null;
      if (!data || data.source !== COMMAND_CHANNEL) return;
      if (typeof data.action !== 'string') return;
      bridge.invoke(data.action);
    });
  }

  // Re-injection after an extension update: keep the existing capture (it may
  // already hold handlers the page registered before this run) and just refresh.
  if (scope.__fantabMedia?.installed) {
    listenForCommands(scope.__fantabMedia);
    scope.__fantabMedia.postSnapshot();
    return;
  }

  const handlers: Record<string, MediaSessionActionHandler | null> =
    Object.create(null) as Record<string, MediaSessionActionHandler | null>;
  const originalSetActionHandler = session.setActionHandler.bind(session);

  let lastSerialized = '';

  function buildSnapshot(): MediaBridgeSnapshot {
    const metadata = session.metadata;
    const hasAction = (action: string): boolean =>
      typeof handlers[action] === 'function';

    return {
      hasSession: hasAction('play') || hasAction('pause') || !!metadata,
      playbackState: session.playbackState ?? 'none',
      canNext: hasAction('nexttrack'),
      canPrev: hasAction('previoustrack'),
      canPlay: hasAction('play'),
      canPause: hasAction('pause'),
      title: metadata?.title ?? '',
      artist: metadata?.artist ?? '',
    };
  }

  function postSnapshot(): void {
    const snapshot = buildSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    window.postMessage({ source: CHANNEL, snapshot }, '*');
  }

  // Forward to the native implementation so OS/media-key controls keep working,
  // while recording the handler so we can replay it from the side panel.
  try {
    Object.defineProperty(session, 'setActionHandler', {
      configurable: true,
      writable: true,
      value(
        action: MediaSessionAction,
        handler: MediaSessionActionHandler | null,
      ): void {
        handlers[action] = handler;
        originalSetActionHandler(action, handler);
        postSnapshot();
      },
    });
  } catch {
    // Some hardened pages freeze navigator.mediaSession; without the patch we
    // simply can't offer next/previous, but metadata polling still works.
  }

  function invoke(action: string): boolean {
    const handler = handlers[action];
    if (typeof handler !== 'function') return false;
    try {
      handler({ action } as MediaSessionActionDetails);
      return true;
    } catch {
      return false;
    }
  }

  scope.__fantabMedia = { installed: true, invoke, postSnapshot };
  listenForCommands(scope.__fantabMedia);

  // Sites update metadata/playbackState without calling setActionHandler (and
  // there's no event we can observe for it here), so poll lightly and post only
  // on change.
  const pollId = window.setInterval(postSnapshot, 1000);
  window.addEventListener(
    'pagehide',
    () => window.clearInterval(pollId),
    { once: true },
  );

  postSnapshot();
})();
