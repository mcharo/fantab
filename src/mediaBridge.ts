// Runs in the page's MAIN world at document_start. The isolated content script
// can read DOM media properties (volume, paused) but not the page's
// `navigator.mediaSession`, which lives in the main world. This bridge patches
// `setActionHandler` so we can both observe which transport actions a site
// supports (next/previous track, play, pause) and invoke them on demand, and it
// relays the session's metadata/playback state to the content script via
// `window.postMessage`. MAIN-world scripts have no access to chrome.* APIs, so
// postMessage is the only channel back to the extension.

(() => {
  const CHANNEL = 'fantab-media-bridge';

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
    typeof globalThis & { __fantabMedia?: FantabMediaBridge };

  const session = navigator.mediaSession;
  if (!session || typeof session.setActionHandler !== 'function') return;

  // Re-injection after an extension update: keep the existing capture (it may
  // already hold handlers the page registered before this run) and just refresh.
  if (scope.__fantabMedia?.installed) {
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
