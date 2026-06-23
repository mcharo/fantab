import type { ActiveMedia, TabMediaState } from './types';

export interface MediaTabRecord {
  windowId: number | null;
  state: TabMediaState;
  /**
   * Monotonic marker bumped each time the tab transitions into playing; a higher
   * value means the tab started playing more recently.
   */
  seq: number;
}

/** Plain-object snapshot of the registry, for persisting across worker restarts. */
export interface SerializedMediaRegistry {
  records: Array<[number, MediaTabRecord]>;
  seq: number;
}

/**
 * Choose the media tab the player bar should control for a window: prefer a
 * currently-playing tab (the audible one), then fall back to the most recently
 * played tab that still has media. Returns null when nothing in the window has
 * media. Pure so it can be unit tested.
 */
export function pickActiveMediaTabId(
  records: ReadonlyMap<number, MediaTabRecord>,
  windowId: number | null,
): number | null {
  let bestId: number | null = null;
  let best: MediaTabRecord | null = null;

  for (const [tabId, record] of records) {
    if (!record.state.hasMedia) continue;
    if (windowId !== null && record.windowId !== windowId) continue;

    if (!best) {
      bestId = tabId;
      best = record;
      continue;
    }

    const candidatePlaying = record.state.isPlaying ? 1 : 0;
    const bestPlaying = best.state.isPlaying ? 1 : 0;
    if (
      candidatePlaying > bestPlaying ||
      (candidatePlaying === bestPlaying && record.seq > best.seq)
    ) {
      bestId = tabId;
      best = record;
    }
  }

  return bestId;
}

/** Resolve a tab's media state into the shape the player bar renders. */
export function buildActiveMedia(
  tabId: number,
  state: TabMediaState,
  faviconUrl: string,
  fallbackTitle: string,
): ActiveMedia {
  return {
    tabId,
    title: state.title.trim() || fallbackTitle,
    artist: state.artist,
    faviconUrl,
    isPlaying: state.isPlaying,
    hasVideo: state.hasVideo,
    canNext: state.canNext,
    canPrev: state.canPrev,
    volume: state.volume,
    muted: state.muted,
  };
}

function mediaStateEqual(a: TabMediaState, b: TabMediaState): boolean {
  return (
    a.hasMedia === b.hasMedia &&
    a.isPlaying === b.isPlaying &&
    a.isPlayingVideo === b.isPlayingVideo &&
    a.hasVideo === b.hasVideo &&
    a.canNext === b.canNext &&
    a.canPrev === b.canPrev &&
    a.volume === b.volume &&
    a.muted === b.muted &&
    a.title === b.title &&
    a.artist === b.artist
  );
}

/**
 * In-memory registry of per-tab media state. Lost on service-worker restart;
 * content scripts re-report when their pages resume. Tracks recency so the
 * player bar can follow the most recently played tab.
 */
export class MediaRegistry {
  private readonly records = new Map<number, MediaTabRecord>();
  private seqCounter = 0;

  /**
   * Record a tab's latest media state, dropping tabs that no longer have media.
   * Returns true when the stored state changed (so the caller can broadcast).
   */
  update(
    tabId: number,
    windowId: number | null,
    state: TabMediaState,
  ): boolean {
    if (!state.hasMedia) return this.remove(tabId);

    const previous = this.records.get(tabId);
    const startedPlaying = state.isPlaying && !previous?.state.isPlaying;
    const seq = startedPlaying
      ? ++this.seqCounter
      : previous?.seq ?? ++this.seqCounter;

    const changed =
      !previous ||
      previous.windowId !== windowId ||
      !mediaStateEqual(previous.state, state);

    this.records.set(tabId, { windowId, state, seq });
    return changed;
  }

  remove(tabId: number): boolean {
    return this.records.delete(tabId);
  }

  get(tabId: number): MediaTabRecord | undefined {
    return this.records.get(tabId);
  }

  getRecords(): ReadonlyMap<number, MediaTabRecord> {
    return this.records;
  }

  /** Tab ids with a currently-playing video, for the per-row picture-in-picture button. */
  playingVideoTabIds(): Set<number> {
    const ids = new Set<number>();
    for (const [tabId, record] of this.records) {
      if (record.state.isPlayingVideo) ids.add(tabId);
    }
    return ids;
  }

  /**
   * Snapshot for persistence. The MV3 service worker is torn down after idle, so
   * a steadily-playing tab (which fires no media events) would otherwise leave
   * the rebuilt worker with an empty registry until the user interacts again.
   */
  serialize(): SerializedMediaRegistry {
    return { records: [...this.records.entries()], seq: this.seqCounter };
  }

  /** Restore a snapshot produced by {@link serialize}. Ignores malformed input. */
  hydrate(data: SerializedMediaRegistry | undefined | null): void {
    if (!data || !Array.isArray(data.records)) return;
    this.records.clear();
    for (const [tabId, record] of data.records) {
      this.records.set(tabId, record);
    }
    if (typeof data.seq === 'number') this.seqCounter = data.seq;
  }
}
