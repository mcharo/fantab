import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type Preferences } from './preferences';
import {
  decideSyncConvergence,
  getSyncState,
  hashPayload,
  mergeSyncedPreferences,
  mergeSyncIntoState,
  projectSyncable,
  readSync,
  SYNC_CHUNK_PREFIX,
  SYNC_META_KEY,
  SYNC_STATE_KEY,
  writeSync,
  type ConvergenceInputs,
  type SyncMeta,
  type SyncPayload,
} from './sync';
import {
  DEFAULT_SPACE_ID,
  type FantabGroup,
  type HomePin,
  type StoredStateV7,
} from './types';

function pin(overrides: Partial<HomePin>): HomePin {
  return {
    id: 'pin',
    homeUrl: 'https://example.com/',
    alias: 'Example',
    faviconUrl: 'https://example.com/favicon.ico',
    tabId: null,
    lastKnownUrl: 'https://example.com/',
    lastKnownTitle: 'Example',
    createdAt: 1,
    order: 0,
    ...overrides,
  };
}

function group(overrides: Partial<FantabGroup>): FantabGroup {
  return {
    id: 'group',
    title: 'Folder',
    pinned: true,
    collapsed: false,
    peek: false,
    order: 0,
    createdAt: 1,
    ...overrides,
  };
}

function baseState(): StoredStateV7 {
  return {
    version: 7,
    activeSpaceByWindowId: { default: DEFAULT_SPACE_ID, '7': DEFAULT_SPACE_ID },
    lastActiveTabBySpace: { '7:default': 42 },
    spaces: [
      {
        id: DEFAULT_SPACE_ID,
        name: 'Default',
        icon: 'circle',
        createdAt: 1,
        order: 0,
        homePins: [
          pin({ id: 'pin-a', homeUrl: 'https://a.com/', alias: 'A', tabId: 42 }),
          pin({ id: 'pin-b', homeUrl: 'https://b.com/', alias: 'B', order: 1 }),
        ],
      },
      {
        id: 'work',
        name: 'Work',
        icon: 'briefcase',
        createdAt: 2,
        order: 1,
        homePins: [],
      },
    ],
    tabAliases: { '42': 'A' },
    tabSpaces: { '42': DEFAULT_SPACE_ID },
  };
}

function makeArea() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys === null || keys === undefined) return { ...data };
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of list) if (key in data) out[key] = data[key];
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) delete data[key];
    }),
  };
}

let syncArea: ReturnType<typeof makeArea>;
let localArea: ReturnType<typeof makeArea>;

beforeEach(() => {
  syncArea = makeArea();
  localArea = makeArea();
  vi.stubGlobal('chrome', {
    storage: { sync: syncArea, local: localArea },
  });
});

describe('projectSyncable', () => {
  it('keeps only logical fields and drops machine-specific data', () => {
    const payload = projectSyncable(baseState(), DEFAULT_PREFERENCES);

    expect(payload.spaces).toHaveLength(2);
    const [first, second] = payload.spaces;
    expect(first).toEqual({
      id: DEFAULT_SPACE_ID,
      name: 'Default',
      icon: 'circle',
      createdAt: 1,
      order: 0,
      groups: [],
      homePins: [
        {
          id: 'pin-a',
          homeUrl: 'https://a.com/',
          alias: 'A',
          lastKnownUrl: 'https://example.com/',
          lastKnownTitle: 'Example',
          createdAt: 1,
          order: 0,
          groupId: null,
        },
        {
          id: 'pin-b',
          homeUrl: 'https://b.com/',
          alias: 'B',
          lastKnownUrl: 'https://example.com/',
          lastKnownTitle: 'Example',
          createdAt: 1,
          order: 1,
          groupId: null,
        },
      ],
    });
    expect(second.id).toBe('work');

    // No tabId / faviconUrl / tab assignments leak through.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('faviconUrl');
    expect(serialized).not.toContain('tabId');
    expect(serialized).not.toContain('tabSpaces');
  });

  it('only carries the three synced preferences', () => {
    const payload = projectSyncable(baseState(), {
      ...DEFAULT_PREFERENCES,
      tabTitleFontSize: 17,
      theme: 'dark',
      syncEnabled: true,
    });

    expect(payload.preferences).toEqual({
      tabTitleFontSize: 17,
      theme: 'dark',
      density: 'comfortable',
    });
    expect(JSON.stringify(payload.preferences)).not.toContain('syncEnabled');
  });

  it('produces order-independent output (canonical ordering)', () => {
    const a = baseState();
    const b = baseState();
    b.spaces.reverse();
    b.spaces[1].homePins.reverse();

    expect(hashPayload(projectSyncable(a, DEFAULT_PREFERENCES))).toBe(
      hashPayload(projectSyncable(b, DEFAULT_PREFERENCES)),
    );
  });

  it('syncs pinned folders + membership but not unpinned folders or view state', () => {
    const state = baseState();
    state.spaces[0].groups = [
      group({ id: 'g1', title: 'Reading', collapsed: true, peek: true, order: 0 }),
      group({ id: 'live', title: 'Live tabs', pinned: false, order: 1 }),
    ];
    state.spaces[0].homePins[1].groupId = 'g1';

    const first = projectSyncable(state, DEFAULT_PREFERENCES).spaces[0];

    expect(first.groups).toEqual([
      { id: 'g1', title: 'Reading', createdAt: 1, order: 0 },
    ]);
    // Machine-local view state and unpinned folders never leak into sync.
    const serialized = JSON.stringify(first.groups);
    expect(serialized).not.toContain('collapsed');
    expect(serialized).not.toContain('peek');
    expect(serialized).not.toContain('live');

    expect(first.homePins.find((p) => p.id === 'pin-a')?.groupId).toBeNull();
    expect(first.homePins.find((p) => p.id === 'pin-b')?.groupId).toBe('g1');
  });
});

describe('hashPayload', () => {
  it('changes when logical data changes but not for equal data', () => {
    const base = projectSyncable(baseState(), DEFAULT_PREFERENCES);
    const same = projectSyncable(baseState(), DEFAULT_PREFERENCES);
    expect(hashPayload(base)).toBe(hashPayload(same));

    const renamed = baseState();
    renamed.spaces[0].name = 'Home';
    expect(hashPayload(projectSyncable(renamed, DEFAULT_PREFERENCES))).not.toBe(
      hashPayload(base),
    );
  });
});

describe('writeSync / readSync', () => {
  it('round-trips a payload through chunked storage', async () => {
    const payload = projectSyncable(baseState(), DEFAULT_PREFERENCES);
    const result = await writeSync(payload, {
      deviceId: 'device-1',
      updatedAt: 100,
    });

    expect(result.ok).toBe(true);
    expect(syncArea.data[SYNC_META_KEY]).toBeDefined();

    const read = await readSync();
    expect(read?.payload).toEqual(payload);
    expect(read?.meta.deviceId).toBe('device-1');
    expect(read?.meta.updatedAt).toBe(100);
    expect(read?.meta.hash).toBe(hashPayload(payload));
  });

  it('splits large payloads across multiple chunks', async () => {
    const big = baseState();
    big.spaces[0].homePins = Array.from({ length: 150 }, (_, index) =>
      pin({
        id: `pin-${index}`,
        homeUrl: `https://example.com/path/${index}/${'x'.repeat(20)}`,
        alias: `Pin number ${index}`,
        order: index,
      }),
    );

    const payload = projectSyncable(big, DEFAULT_PREFERENCES);
    const result = await writeSync(payload, {
      deviceId: 'device-1',
      updatedAt: 1,
    });

    expect(result.ok).toBe(true);
    const chunkKeys = Object.keys(syncArea.data).filter((key) =>
      key.startsWith(SYNC_CHUNK_PREFIX),
    );
    expect(chunkKeys.length).toBeGreaterThan(1);

    const read = await readSync();
    expect(read?.payload).toEqual(payload);
  });

  it('removes stale chunks when a later payload is smaller', async () => {
    const big = baseState();
    big.spaces[0].homePins = Array.from({ length: 400 }, (_, index) =>
      pin({ id: `pin-${index}`, homeUrl: `https://x/${index}`, order: index }),
    );
    await writeSync(projectSyncable(big, DEFAULT_PREFERENCES), {
      deviceId: 'd',
      updatedAt: 1,
    });
    const wideChunkCount = Object.keys(syncArea.data).filter((key) =>
      key.startsWith(SYNC_CHUNK_PREFIX),
    ).length;

    await writeSync(projectSyncable(baseState(), DEFAULT_PREFERENCES), {
      deviceId: 'd',
      updatedAt: 2,
    });
    const narrowChunkCount = Object.keys(syncArea.data).filter((key) =>
      key.startsWith(SYNC_CHUNK_PREFIX),
    ).length;

    expect(narrowChunkCount).toBeLessThan(wideChunkCount);
    // No orphaned chunks remain — readSync reassembles cleanly.
    expect((await readSync())?.payload).toEqual(
      projectSyncable(baseState(), DEFAULT_PREFERENCES),
    );
  });

  it('skips oversized payloads instead of throwing', async () => {
    const huge = baseState();
    huge.spaces[0].homePins = Array.from({ length: 6000 }, (_, index) =>
      pin({
        id: `pin-${index}`,
        homeUrl: `https://example.com/${index}/${'z'.repeat(30)}`,
        order: index,
      }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await writeSync(projectSyncable(huge, DEFAULT_PREFERENCES), {
      deviceId: 'd',
      updatedAt: 1,
    });

    expect(result.ok).toBe(false);
    expect(syncArea.set).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('returns null when no synced data exists', async () => {
    expect(await readSync()).toBeNull();
  });

  it('returns null when a chunk is missing', async () => {
    const meta: SyncMeta = {
      schemaVersion: 1,
      updatedAt: 1,
      deviceId: 'd',
      chunkCount: 2,
      hash: 'abc',
    };
    syncArea.data[SYNC_META_KEY] = meta;
    syncArea.data[`${SYNC_CHUNK_PREFIX}0`] = '{"partial":';
    expect(await readSync()).toBeNull();
  });
});

describe('mergeSyncIntoState', () => {
  const prefs: Preferences = DEFAULT_PREFERENCES;

  it('applies remote logical data while preserving local tab bindings', () => {
    const local = baseState();

    // Remote: renamed default space, dropped pin-b, kept pin-a, removed "work".
    const remote = baseState();
    remote.spaces[0].name = 'Home';
    remote.spaces[0].homePins = [
      pin({ id: 'pin-a', homeUrl: 'https://a.com/', alias: 'Alpha' }),
    ];
    remote.spaces = [remote.spaces[0]];
    const payload = projectSyncable(remote, prefs);

    const merged = mergeSyncIntoState(local, payload);

    expect(merged.spaces).toHaveLength(1);
    expect(merged.spaces[0].name).toBe('Home');
    const [survivingPin] = merged.spaces[0].homePins;
    expect(survivingPin.id).toBe('pin-a');
    expect(survivingPin.alias).toBe('Alpha');
    // Machine-local fields preserved from the local pin with the same id.
    expect(survivingPin.tabId).toBe(42);
    expect(survivingPin.faviconUrl).toBe('https://example.com/favicon.ico');
  });

  it('drops machine references to spaces removed by the merge', () => {
    const local = baseState();
    const remote = baseState();
    remote.spaces = [remote.spaces[0]]; // remove "work"
    const merged = mergeSyncIntoState(local, projectSyncable(remote, prefs));

    expect(merged.spaces.some((space) => space.id === 'work')).toBe(false);
    expect(Object.values(merged.activeSpaceByWindowId)).not.toContain('work');
  });

  it('round-trips so a merged state reprojects to the same payload (no echo)', () => {
    const local = baseState();
    const remote = baseState();
    remote.spaces[0].name = 'Renamed';
    const payload = projectSyncable(remote, prefs);

    const merged = mergeSyncIntoState(local, payload);
    expect(hashPayload(projectSyncable(merged, prefs))).toBe(
      hashPayload(payload),
    );
  });

  it('keeps local spaces if the payload has none usable', () => {
    const local = baseState();
    const merged = mergeSyncIntoState(local, {
      schemaVersion: 1,
      spaces: [],
      preferences: { tabTitleFontSize: 15, theme: 'system', density: 'comfortable' },
    });
    expect(merged.spaces).toHaveLength(2);
  });

  it('applies synced folders + membership, keeping local view state and unpinned folders', () => {
    const local = baseState();
    // Local knows folder g1 with collapsed/peek view state, plus an unpinned
    // folder backed by a live tab. pin-b is loose locally.
    local.spaces[0].groups = [
      group({ id: 'g1', title: 'Stale title', collapsed: true, peek: true }),
      group({ id: 'live', title: 'Live tabs', pinned: false, order: 1 }),
    ];
    local.tabGroupMembership = { '99': 'live' };

    // Remote places pin-b inside g1 and renames it.
    const remote = baseState();
    remote.spaces[0].groups = [group({ id: 'g1', title: 'Reading' })];
    remote.spaces[0].homePins[1].groupId = 'g1';

    const merged = mergeSyncIntoState(local, projectSyncable(remote, prefs));
    const space = merged.spaces[0];

    expect(space.homePins.find((p) => p.id === 'pin-b')?.groupId).toBe('g1');

    const g1 = space.groups?.find((grp) => grp.id === 'g1');
    expect(g1?.title).toBe('Reading');
    expect(g1?.pinned).toBe(true);
    // collapsed/peek are machine-local and preserved from the local folder.
    expect(g1?.collapsed).toBe(true);
    expect(g1?.peek).toBe(true);

    // The device's own unpinned folder survives the pull untouched.
    expect(space.groups?.some((grp) => grp.id === 'live' && !grp.pinned)).toBe(true);
  });

  it('preserves local folders + membership when the payload predates folder sync', () => {
    const local = baseState();
    local.spaces[0].groups = [group({ id: 'g1', title: 'Reading', collapsed: true })];
    local.spaces[0].homePins[1].groupId = 'g1';

    // A pre–folder-sync payload omits `groups` and pin `groupId` entirely.
    const legacyPayload = {
      schemaVersion: 1,
      preferences: { tabTitleFontSize: 15, theme: 'system', density: 'comfortable' },
      spaces: [
        {
          id: DEFAULT_SPACE_ID,
          name: 'Default',
          icon: 'circle',
          createdAt: 1,
          order: 0,
          homePins: [
            { id: 'pin-a', homeUrl: 'https://a.com/', alias: 'A', lastKnownUrl: null, lastKnownTitle: null, createdAt: 1, order: 0 },
            { id: 'pin-b', homeUrl: 'https://b.com/', alias: 'B', lastKnownUrl: null, lastKnownTitle: null, createdAt: 1, order: 1 },
          ],
        },
      ],
    } as unknown as SyncPayload;

    const merged = mergeSyncIntoState(local, legacyPayload);
    const space = merged.spaces[0];

    expect(space.groups?.find((grp) => grp.id === 'g1')?.collapsed).toBe(true);
    expect(space.homePins.find((p) => p.id === 'pin-b')?.groupId).toBe('g1');
  });

  it('round-trips folder structure so a merged state reprojects identically (no echo)', () => {
    const local = baseState();
    const remote = baseState();
    remote.spaces[0].groups = [group({ id: 'g1', title: 'Reading' })];
    remote.spaces[0].homePins[1].groupId = 'g1';
    const payload = projectSyncable(remote, prefs);

    const merged = mergeSyncIntoState(local, payload);
    expect(hashPayload(projectSyncable(merged, prefs))).toBe(hashPayload(payload));
  });
});

describe('mergeSyncedPreferences', () => {
  it('overwrites synced fields but keeps local-only preferences', () => {
    const local: Preferences = {
      tabTitleFontSize: 12,
      theme: 'light',
      density: 'compact',
      syncEnabled: true,
      closeAllRestoreSeconds: 8,
      closeAllHoldToConfirm: false,
      enableVideoPreview: true,
      showPlayerControls: false,
    };
    const payload = projectSyncable(baseState(), {
      ...DEFAULT_PREFERENCES,
      tabTitleFontSize: 19,
      theme: 'dark',
      density: 'comfortable',
    });

    // Non-appearance preferences are machine-local and must survive.
    expect(mergeSyncedPreferences(local, payload)).toEqual({
      tabTitleFontSize: 19,
      theme: 'dark',
      density: 'comfortable',
      syncEnabled: true,
      closeAllRestoreSeconds: 8,
      closeAllHoldToConfirm: false,
      enableVideoPreview: true,
      showPlayerControls: false,
    });
  });
});

describe('getSyncState', () => {
  it('creates and persists a record with a device id on first use', async () => {
    const created = await getSyncState();
    expect(typeof created.deviceId).toBe('string');
    expect(created.deviceId.length).toBeGreaterThan(0);
    expect(created.logicalHash).toBeNull();
    expect(created.logicalUpdatedAt).toBe(0);
    expect(localArea.data[SYNC_STATE_KEY]).toBeDefined();

    // Returns the same persisted record next time.
    const again = await getSyncState();
    expect(again.deviceId).toBe(created.deviceId);
  });
});

describe('decideSyncConvergence', () => {
  function inputs(overrides: Partial<ConvergenceInputs> = {}): ConvergenceInputs {
    return {
      optIn: false,
      localHash: 'local',
      deviceId: 'this-device',
      logicalUpdatedAt: 0,
      remote: null,
      remotePending: false,
      localSeedable: true,
      now: 1000,
      ...overrides,
    };
  }

  it('only records the hash when remote already equals local', () => {
    expect(
      decideSyncConvergence(
        inputs({
          remote: { hash: 'local', deviceId: 'other', updatedAt: 5000 },
        }),
      ),
    ).toEqual({ kind: 'mark-synced' });
  });

  describe('opt-in (sync just enabled)', () => {
    it('adopts existing cloud data instead of pushing the local projection', () => {
      // The onboarding bug: a blank new device must not overwrite the synced set.
      expect(
        decideSyncConvergence(
          inputs({
            optIn: true,
            localHash: 'blank',
            remote: { hash: 'good-data', deviceId: 'other', updatedAt: 9000 },
          }),
        ),
      ).toEqual({ kind: 'pull' });
    });

    it('pulls even when this device claims a newer local change', () => {
      // Without the opt-in bias, last-write-wins here would push and clobber.
      expect(
        decideSyncConvergence(
          inputs({
            optIn: true,
            localHash: 'blank',
            logicalUpdatedAt: 50_000,
            remote: { hash: 'good-data', deviceId: 'other', updatedAt: 1 },
          }),
        ),
      ).toEqual({ kind: 'pull' });
    });

    it('adopts the cloud even when the remote is this device’s own prior write', () => {
      expect(
        decideSyncConvergence(
          inputs({
            optIn: true,
            localHash: 'blank',
            remote: { hash: 'good-data', deviceId: 'this-device', updatedAt: 9000 },
          }),
        ),
      ).toEqual({ kind: 'pull' });
    });

    it('seeds the cloud when opting in with real local data and an empty cloud', () => {
      expect(
        decideSyncConvergence(
          inputs({ optIn: true, remote: null, localSeedable: true }),
        ),
      ).toEqual({ kind: 'push', updatedAt: 1000 });
    });

    it('waits instead of seeding a blank device when the cloud looks empty', () => {
      // The real-world data loss: the new device sees the cloud mid-propagation
      // (no readable payload yet) and must not write its blank state up.
      expect(
        decideSyncConvergence(
          inputs({ optIn: true, remote: null, localSeedable: false }),
        ),
      ).toEqual({ kind: 'wait' });
    });

    it('waits when the cloud holds a partial / in-flight remote', () => {
      expect(
        decideSyncConvergence(
          inputs({
            optIn: true,
            remote: null,
            remotePending: true,
            localSeedable: true,
          }),
        ),
      ).toEqual({ kind: 'wait' });
    });

    it('does not redundantly pull when cloud already matches local', () => {
      expect(
        decideSyncConvergence(
          inputs({
            optIn: true,
            remote: { hash: 'local', deviceId: 'other', updatedAt: 9000 },
          }),
        ),
      ).toEqual({ kind: 'mark-synced' });
    });
  });

  describe('no readable remote (seeding safety)', () => {
    it('seeds an empty cloud from a device that has real data', () => {
      expect(
        decideSyncConvergence(
          inputs({ remote: null, remotePending: false, localSeedable: true }),
        ),
      ).toEqual({ kind: 'push', updatedAt: 1000 });
    });

    it('waits when sync keys are present but unreadable (mid-propagation)', () => {
      expect(
        decideSyncConvergence(
          inputs({ remote: null, remotePending: true, localSeedable: true }),
        ),
      ).toEqual({ kind: 'wait' });
    });

    it('waits rather than seed a blank projection over an empty-looking cloud', () => {
      expect(
        decideSyncConvergence(
          inputs({ remote: null, remotePending: false, localSeedable: false }),
        ),
      ).toEqual({ kind: 'wait' });
    });
  });

  describe('steady state (last-write-wins)', () => {
    it('pulls a fresh device with no local changes (logicalUpdatedAt 0)', () => {
      expect(
        decideSyncConvergence(
          inputs({
            remote: { hash: 'good-data', deviceId: 'other', updatedAt: 9000 },
          }),
        ),
      ).toEqual({ kind: 'pull' });
    });

    it('republishes our own stale remote when local has moved on', () => {
      expect(
        decideSyncConvergence(
          inputs({
            logicalUpdatedAt: 200,
            remote: { hash: 'older', deviceId: 'this-device', updatedAt: 100 },
          }),
        ),
      ).toEqual({ kind: 'push', updatedAt: 1000 });
    });

    it('pulls when another device wrote more recently than our last change', () => {
      expect(
        decideSyncConvergence(
          inputs({
            logicalUpdatedAt: 100,
            remote: { hash: 'newer', deviceId: 'other', updatedAt: 200 },
          }),
        ),
      ).toEqual({ kind: 'pull' });
    });

    it('pushes when our local change is newer than another device’s remote', () => {
      expect(
        decideSyncConvergence(
          inputs({
            logicalUpdatedAt: 300,
            remote: { hash: 'older', deviceId: 'other', updatedAt: 200 },
          }),
        ),
      ).toEqual({ kind: 'push', updatedAt: 300 });
    });
  });
});
