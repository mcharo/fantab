import { describe, expect, it } from 'vitest';
import {
  buildActiveMedia,
  MediaRegistry,
  pickActiveMediaTabId,
  type MediaTabRecord,
} from './mediaRegistry';
import type { TabMediaState } from './types';

function mediaState(overrides: Partial<TabMediaState> = {}): TabMediaState {
  return {
    hasMedia: true,
    isPlaying: true,
    isPlayingVideo: false,
    hasVideo: false,
    canNext: false,
    canPrev: false,
    volume: 1,
    muted: false,
    title: '',
    artist: '',
    ...overrides,
  };
}

function record(overrides: Partial<MediaTabRecord> = {}): MediaTabRecord {
  return {
    windowId: 1,
    seq: 1,
    state: mediaState(),
    ...overrides,
  };
}

describe('pickActiveMediaTabId', () => {
  it('returns null when nothing has media', () => {
    const records = new Map<number, MediaTabRecord>([
      [1, record({ state: mediaState({ hasMedia: false }) })],
    ]);

    expect(pickActiveMediaTabId(records, 1)).toBeNull();
  });

  it('picks the only media tab', () => {
    const records = new Map<number, MediaTabRecord>([[7, record()]]);

    expect(pickActiveMediaTabId(records, 1)).toBe(7);
  });

  it('prefers a currently-playing tab over a more recent paused one', () => {
    const records = new Map<number, MediaTabRecord>([
      [1, record({ seq: 1, state: mediaState({ isPlaying: true }) })],
      [2, record({ seq: 5, state: mediaState({ isPlaying: false }) })],
    ]);

    expect(pickActiveMediaTabId(records, 1)).toBe(1);
  });

  it('picks the most recently started among playing tabs', () => {
    const records = new Map<number, MediaTabRecord>([
      [1, record({ seq: 3, state: mediaState({ isPlaying: true }) })],
      [2, record({ seq: 8, state: mediaState({ isPlaying: true }) })],
    ]);

    expect(pickActiveMediaTabId(records, 1)).toBe(2);
  });

  it('picks the most recently played among paused tabs', () => {
    const records = new Map<number, MediaTabRecord>([
      [1, record({ seq: 2, state: mediaState({ isPlaying: false }) })],
      [2, record({ seq: 9, state: mediaState({ isPlaying: false }) })],
    ]);

    expect(pickActiveMediaTabId(records, 1)).toBe(2);
  });

  it('only considers tabs in the target window', () => {
    const records = new Map<number, MediaTabRecord>([
      [1, record({ windowId: 2, seq: 9 })],
      [2, record({ windowId: 1, seq: 1 })],
    ]);

    expect(pickActiveMediaTabId(records, 1)).toBe(2);
  });

  it('considers every window when windowId is null', () => {
    const records = new Map<number, MediaTabRecord>([
      [1, record({ windowId: 2, seq: 9 })],
      [2, record({ windowId: 1, seq: 1 })],
    ]);

    expect(pickActiveMediaTabId(records, null)).toBe(1);
  });
});

describe('MediaRegistry', () => {
  it('drops tabs that report no media and reports the removal', () => {
    const registry = new MediaRegistry();
    registry.update(1, 1, mediaState({ isPlaying: true }));

    expect(registry.update(1, 1, mediaState({ hasMedia: false }))).toBe(true);
    expect(registry.get(1)).toBeUndefined();
    // Already absent: no further change.
    expect(registry.update(2, 1, mediaState({ hasMedia: false }))).toBe(false);
  });

  it('follows the most recently started tab and falls back when it closes', () => {
    const registry = new MediaRegistry();
    registry.update(1, 1, mediaState({ isPlaying: true }));
    registry.update(2, 1, mediaState({ isPlaying: true }));

    // Newest playing tab wins.
    expect(pickActiveMediaTabId(registry.getRecords(), 1)).toBe(2);

    // It closes: fall back to the remaining playing tab.
    expect(registry.remove(2)).toBe(true);
    expect(pickActiveMediaTabId(registry.getRecords(), 1)).toBe(1);
  });

  it('hands control to the audible tab when the active one pauses', () => {
    const registry = new MediaRegistry();
    registry.update(1, 1, mediaState({ isPlaying: true }));
    registry.update(2, 1, mediaState({ isPlaying: true }));
    // Pause the newest; the still-playing older tab takes over.
    registry.update(2, 1, mediaState({ isPlaying: false }));

    expect(pickActiveMediaTabId(registry.getRecords(), 1)).toBe(1);
  });

  it('reports a change only when the stored state differs', () => {
    const registry = new MediaRegistry();
    expect(registry.update(1, 1, mediaState({ volume: 1 }))).toBe(true);
    expect(registry.update(1, 1, mediaState({ volume: 1 }))).toBe(false);
    expect(registry.update(1, 1, mediaState({ volume: 0.5 }))).toBe(true);
  });

  it('exposes tabs with a currently-playing video for the row buttons', () => {
    const registry = new MediaRegistry();
    registry.update(1, 1, mediaState({ isPlayingVideo: true }));
    registry.update(2, 1, mediaState({ isPlayingVideo: false }));
    registry.update(3, 1, mediaState({ isPlayingVideo: true }));

    expect(registry.playingVideoTabIds()).toEqual(new Set([1, 3]));
  });
});

describe('MediaRegistry serialize/hydrate', () => {
  it('round-trips records and keeps the active selection', () => {
    const source = new MediaRegistry();
    source.update(1, 1, mediaState({ isPlaying: true }));
    source.update(2, 1, mediaState({ isPlaying: true }));

    const restored = new MediaRegistry();
    restored.hydrate(source.serialize());

    expect(pickActiveMediaTabId(restored.getRecords(), 1)).toBe(
      pickActiveMediaTabId(source.getRecords(), 1),
    );
    expect(restored.get(1)?.state.isPlaying).toBe(true);
  });

  it('continues the recency sequence after hydrating, so new plays win', () => {
    const source = new MediaRegistry();
    source.update(1, 1, mediaState({ isPlaying: true }));
    source.update(2, 1, mediaState({ isPlaying: true }));

    const restored = new MediaRegistry();
    restored.hydrate(source.serialize());
    // A freshly playing tab should outrank the restored ones.
    restored.update(3, 1, mediaState({ isPlaying: true }));

    expect(pickActiveMediaTabId(restored.getRecords(), 1)).toBe(3);
  });

  it('ignores missing or malformed snapshots', () => {
    const registry = new MediaRegistry();
    registry.update(1, 1, mediaState({ isPlaying: true }));

    registry.hydrate(undefined);
    registry.hydrate(null);
    registry.hydrate({} as never);

    // Existing state is untouched by malformed input.
    expect(registry.get(1)?.state.isPlaying).toBe(true);
  });
});

describe('buildActiveMedia', () => {
  it('carries playback fields through and keeps the metadata title', () => {
    const media = buildActiveMedia(
      5,
      mediaState({
        title: 'Track name',
        artist: 'Artist',
        isPlaying: true,
        canNext: true,
        canPrev: false,
        volume: 0.4,
        muted: true,
        hasVideo: true,
      }),
      'https://example.com/favicon.ico',
      'Tab title',
    );

    expect(media).toEqual({
      tabId: 5,
      title: 'Track name',
      artist: 'Artist',
      faviconUrl: 'https://example.com/favicon.ico',
      isPlaying: true,
      hasVideo: true,
      canNext: true,
      canPrev: false,
      volume: 0.4,
      muted: true,
    });
  });

  it('falls back to the provided title when metadata is blank', () => {
    const media = buildActiveMedia(5, mediaState({ title: '   ' }), '', 'Tab title');

    expect(media.title).toBe('Tab title');
  });
});
