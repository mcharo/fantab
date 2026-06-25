import {
  clampTabTitleFontSize,
  normalizeDensity,
  normalizeTheme,
  type DensityPreference,
  type Preferences,
  type ThemePreference,
} from './preferences';
import { normalizeSpaceIcon } from './spaceIcons';
import { normalizeState } from './storage';
import {
  type FantabGroup,
  type HomePin,
  type Space,
  type SpaceIcon,
  type StoredStateV7,
} from './types';

/**
 * Cross-device sync layer.
 *
 * fantab keeps its authoritative, full state (including machine-specific data
 * such as live tab ids and window ids) in {@link chrome.storage.local}. This
 * module mirrors only the *logical* subset — spaces, home pins, pinned folders,
 * and appearance preferences — to {@link chrome.storage.sync} so it follows the
 * user across machines whenever Chrome Sync is enabled.
 *
 * `chrome.storage.sync` caps items at 8 KB each (100 KB total), so the payload
 * is serialized and split into byte-bounded chunks alongside a small metadata
 * record. Conflicts between machines resolve last-write-wins by `updatedAt`.
 */

export const SYNC_SCHEMA_VERSION = 1;

/** `chrome.storage.sync` keys. */
export const SYNC_META_KEY = 'fantab_sync_meta';
export const SYNC_CHUNK_PREFIX = 'fantab_sync_c';

/** Machine-local bookkeeping key in `chrome.storage.local`. */
export const SYNC_STATE_KEY = 'fantab_sync_state';

/**
 * Per-item quota is 8192 bytes (key + value). Keep each chunk comfortably
 * below it to leave room for the key name and JSON quoting.
 */
const CHUNK_BYTE_LIMIT = 7000;
/** Total sync quota is 102400 bytes; refuse to write payloads near the cap. */
const MAX_PAYLOAD_BYTES = 90000;
const MAX_CHUNKS = Math.ceil(MAX_PAYLOAD_BYTES / CHUNK_BYTE_LIMIT) + 1;

export interface SyncHomePin {
  id: string;
  homeUrl: string;
  alias: string;
  lastKnownUrl: string | null;
  lastKnownTitle: string | null;
  createdAt: number;
  order: number;
  /** Id of the pinned folder this pin belongs to, or null when loose. */
  groupId: string | null;
}

/**
 * A synced folder. Only pinned folders sync — their members are stable home
 * pins. Unpinned folders hold live tabs (machine-specific) and stay local. The
 * `collapsed`/`peek` view state is also machine-local and intentionally omitted.
 */
export interface SyncGroup {
  id: string;
  title: string;
  createdAt: number;
  order: number;
}

export interface SyncSpace {
  id: string;
  name: string;
  icon: SpaceIcon;
  createdAt: number;
  order: number;
  homePins: SyncHomePin[];
  groups: SyncGroup[];
}

export interface SyncPreferences {
  tabTitleFontSize: number;
  theme: ThemePreference;
  density: DensityPreference;
}

export interface SyncPayload {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  spaces: SyncSpace[];
  preferences: SyncPreferences;
}

export interface SyncMeta {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  updatedAt: number;
  deviceId: string;
  chunkCount: number;
  hash: string;
}

/** Machine-local record used for diff-guarding and last-write-wins. */
export interface SyncState {
  /** Stable id for this machine; lets us ignore our own sync writes. */
  deviceId: string;
  /** Hash of the logical projection as last observed locally. */
  logicalHash: string | null;
  /** When the logical projection last changed on this machine. */
  logicalUpdatedAt: number;
  /** Hash last pushed to / pulled from sync; guards against redundant writes. */
  lastSyncedHash: string | null;
}

function chunkKey(index: number): string {
  return `${SYNC_CHUNK_PREFIX}${index}`;
}

/**
 * Builds the canonical logical projection of the current state + preferences.
 * Machine-specific fields (tab ids, window ids, tab/space assignments,
 * favicons, folder collapsed/peek view state) are intentionally omitted. Spaces,
 * pins, and pinned folders are sorted and their `order` reindexed so two
 * machines holding equal data produce identical output (and therefore identical
 * {@link hashPayload}).
 */
export function projectSyncable(
  state: StoredStateV7,
  preferences: Preferences,
): SyncPayload {
  const spaces = [...state.spaces]
    .sort((a, b) => a.order - b.order)
    .map((space, spaceIndex) => {
      // Only pinned folders sync; unpinned folders hold live tabs and are
      // inherently machine-local. Reindex order so equal data hashes equally.
      const groups = [...(space.groups ?? [])]
        .filter((group) => group.pinned)
        .sort((a, b) => a.order - b.order)
        .map((group, groupIndex) => ({
          id: group.id,
          title: group.title,
          createdAt: group.createdAt,
          order: groupIndex,
        }));
      const pinnedGroupIds = new Set(groups.map((group) => group.id));

      return {
        id: space.id,
        name: space.name,
        icon: space.icon,
        createdAt: space.createdAt,
        order: spaceIndex,
        groups,
        homePins: [...space.homePins]
          .sort((a, b) => a.order - b.order)
          .map((pin, pinIndex) => ({
            id: pin.id,
            homeUrl: pin.homeUrl,
            alias: pin.alias,
            lastKnownUrl: pin.lastKnownUrl,
            lastKnownTitle: pin.lastKnownTitle,
            createdAt: pin.createdAt,
            order: pinIndex,
            groupId:
              pin.groupId && pinnedGroupIds.has(pin.groupId) ? pin.groupId : null,
          })),
      };
    });

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    spaces,
    preferences: {
      tabTitleFontSize: preferences.tabTitleFontSize,
      theme: preferences.theme,
      density: preferences.density,
    },
  };
}

/** Stable 32-bit FNV-1a hash; used only to detect changes, not for security. */
export function hashPayload(payload: SyncPayload): string {
  const input = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/** Splits a string into pieces whose UTF-8 size stays under the chunk limit. */
function chunkString(value: string): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  // Iterating with for...of walks code points, so multi-byte characters are
  // never split across a chunk boundary.
  for (const char of value) {
    const charBytes = encoder.encode(char).length;
    if (current && currentBytes + charBytes > CHUNK_BYTE_LIMIT) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }

  if (current) chunks.push(current);
  return chunks;
}

export type WriteSyncResult =
  | { ok: true; meta: SyncMeta }
  | { ok: false; reason: 'too-large' };

/**
 * Serializes the payload, chunks it, and writes the chunks plus a metadata
 * record to `chrome.storage.sync`. Stale higher-index chunks from a previous,
 * larger payload are removed. Oversized payloads are skipped (never thrown).
 */
export async function writeSync(
  payload: SyncPayload,
  options: { deviceId: string; updatedAt: number; hash?: string },
): Promise<WriteSyncResult> {
  const serialized = JSON.stringify(payload);
  const totalBytes = new TextEncoder().encode(serialized).length;
  const chunks = chunkString(serialized);

  if (totalBytes > MAX_PAYLOAD_BYTES || chunks.length > MAX_CHUNKS) {
    console.warn(
      `fantab: skipping sync — payload too large (${totalBytes} bytes, ${chunks.length} chunks).`,
    );
    return { ok: false, reason: 'too-large' };
  }

  const meta: SyncMeta = {
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt: options.updatedAt,
    deviceId: options.deviceId,
    chunkCount: chunks.length,
    hash: options.hash ?? hashPayload(payload),
  };

  const items: Record<string, unknown> = { [SYNC_META_KEY]: meta };
  chunks.forEach((chunk, index) => {
    items[chunkKey(index)] = chunk;
  });

  await chrome.storage.sync.set(items);
  await removeStaleChunks(chunks.length);

  return { ok: true, meta };
}

async function removeStaleChunks(chunkCount: number): Promise<void> {
  const all = await chrome.storage.sync.get(null);
  const stale = Object.keys(all).filter((key) => {
    if (!key.startsWith(SYNC_CHUNK_PREFIX)) return false;
    const index = Number(key.slice(SYNC_CHUNK_PREFIX.length));
    return Number.isInteger(index) && index >= chunkCount;
  });

  if (stale.length > 0) {
    await chrome.storage.sync.remove(stale);
  }
}

/** Reads and reassembles the synced payload, or null if absent/corrupt. */
export async function readSync(): Promise<{
  payload: SyncPayload;
  meta: SyncMeta;
} | null> {
  const metaResult = await chrome.storage.sync.get(SYNC_META_KEY);
  const meta = metaResult[SYNC_META_KEY] as unknown;
  if (!isSyncMeta(meta)) return null;

  const keys = Array.from({ length: meta.chunkCount }, (_, i) => chunkKey(i));
  const chunkResult = await chrome.storage.sync.get(keys);

  let serialized = '';
  for (let i = 0; i < meta.chunkCount; i += 1) {
    const chunk = chunkResult[chunkKey(i)];
    if (typeof chunk !== 'string') return null; // incomplete write
    serialized += chunk;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }

  if (!isSyncPayload(parsed)) return null;
  return { payload: parsed, meta };
}

/**
 * Applies a synced payload onto the local state (whole-payload last-write-wins).
 * Logical space/pin/folder data is replaced by the payload, while machine-local
 * fields are preserved across the merge by id: pins keep their live `tabId` and
 * `faviconUrl`; pinned folders keep their `collapsed`/`peek` view state; and
 * each space's unpinned folders (whose members are live tabs) are kept as-is.
 *
 * A pre–folder-sync payload omits `groups`/`groupId` entirely; that case falls
 * back to preserving local folders and membership so an older device can't strip
 * folders off a newer one during a mixed-version rollout. The result is run
 * through {@link normalizeState} to drop dangling references; callers should
 * follow with `reconcileStateForTabs` to re-bind live tabs.
 */
export function mergeSyncIntoState(
  localState: StoredStateV7,
  payload: SyncPayload,
): StoredStateV7 {
  const localPinById = new Map<string, HomePin>();
  for (const space of localState.spaces) {
    for (const pin of space.homePins) {
      localPinById.set(pin.id, pin);
    }
  }
  const localGroupsBySpaceId = new Map<string, FantabGroup[]>(
    localState.spaces.map((space) => [space.id, space.groups ?? []] as const),
  );
  const localGroupById = new Map<string, FantabGroup>();
  for (const groups of localGroupsBySpaceId.values()) {
    for (const group of groups) localGroupById.set(group.id, group);
  }

  const spaces: Space[] = [...payload.spaces]
    .filter((space) => isNonEmptyString(space?.id) && isNonEmptyString(space?.name))
    .sort((a, b) => a.order - b.order)
    .map((syncSpace, spaceIndex) => {
      const localGroups = localGroupsBySpaceId.get(syncSpace.id) ?? [];
      // Rebuild pinned folders from the payload (carrying over machine-local
      // collapsed/peek view state) plus this device's own unpinned folders.
      // A payload without `groups` predates folder sync — keep local folders.
      const groups: FantabGroup[] = Array.isArray(syncSpace.groups)
        ? [
            ...syncSpace.groups
              .filter((group) => isNonEmptyString(group?.id))
              .sort((a, b) => a.order - b.order)
              .map((group): FantabGroup => {
                const local = localGroupById.get(group.id);
                return {
                  id: group.id,
                  title: isNonEmptyString(group.title)
                    ? group.title
                    : local?.title ?? 'New Folder',
                  pinned: true,
                  collapsed: local?.collapsed ?? false,
                  peek: local?.peek ?? false,
                  order: numberOr(group.order, 0),
                  createdAt: numberOr(
                    group.createdAt,
                    local?.createdAt ?? Date.now(),
                  ),
                };
              }),
            ...localGroups.filter((group) => !group.pinned),
          ]
        : localGroups;

      return {
        id: syncSpace.id,
        name: syncSpace.name,
        icon: normalizeSpaceIcon(syncSpace.icon),
        groups,
        createdAt: numberOr(syncSpace.createdAt, Date.now()),
        order: spaceIndex,
        homePins: (Array.isArray(syncSpace.homePins) ? syncSpace.homePins : [])
          .filter((pin) => isNonEmptyString(pin?.id) && isNonEmptyString(pin?.homeUrl))
          .sort((a, b) => a.order - b.order)
          .map((syncPin, pinIndex): HomePin => {
            const local = localPinById.get(syncPin.id);
            return {
              id: syncPin.id,
              homeUrl: syncPin.homeUrl,
              alias: syncPin.alias || syncPin.homeUrl,
              faviconUrl: local?.faviconUrl ?? '',
              tabId: local?.tabId ?? null,
              lastKnownUrl: syncPin.lastKnownUrl ?? null,
              lastKnownTitle: syncPin.lastKnownTitle ?? null,
              createdAt: numberOr(syncPin.createdAt, Date.now()),
              order: pinIndex,
              // Honor synced membership (including an explicit null); fall back to
              // local only for pre–folder-sync payloads that omit the field.
              groupId:
                syncPin.groupId !== undefined
                  ? syncPin.groupId
                  : local?.groupId ?? null,
            };
          }),
      };
    });

  return normalizeState({
    ...localState,
    // Never collapse to zero spaces — keep local if the payload is unusable.
    spaces: spaces.length > 0 ? spaces : localState.spaces,
  });
}

/**
 * Merges synced appearance preferences onto the local preferences, preserving
 * the machine-local `syncEnabled` flag (which is never synced).
 */
export function mergeSyncedPreferences(
  local: Preferences,
  payload: SyncPayload,
): Preferences {
  return {
    ...local,
    tabTitleFontSize: clampTabTitleFontSize(payload.preferences?.tabTitleFontSize),
    theme: normalizeTheme(payload.preferences?.theme),
    density: normalizeDensity(payload.preferences?.density),
  };
}

/** The minimal view of a remote {@link SyncMeta} the convergence rule needs. */
export interface RemoteSyncSummary {
  hash: string;
  deviceId: string;
  updatedAt: number;
}

export interface ConvergenceInputs {
  /**
   * True when the user has just enabled sync on this device. Opt-in is
   * pull-biased: if any cloud data already exists it is adopted wholesale, so a
   * freshly onboarded (blank) device can never overwrite the synced set.
   */
  optIn: boolean;
  /** Hash of this device's current logical projection. */
  localHash: string;
  /** This device's stable sync id. */
  deviceId: string;
  /** When this device's logical projection last changed locally. */
  logicalUpdatedAt: number;
  /** Summary of the readable record in `chrome.storage.sync`, or null. */
  remote: RemoteSyncSummary | null;
  /**
   * True when `chrome.storage.sync` holds fantab keys we could *not* assemble
   * into a valid {@link SyncPayload} — i.e. a partial/in-flight write. Because
   * `chrome.storage.sync` is eventually consistent, a device that just enabled
   * sync often sees the cloud mid-propagation; we must not treat that as "empty"
   * and seed over it. Only consulted when {@link remote} is null.
   */
  remotePending: boolean;
  /**
   * True when this device's projection holds something worth seeding (any home
   * pin, or more than one space). A blank device must never seed the cloud — the
   * core cause of new-device data loss. Only consulted when {@link remote} is
   * null and the cloud looks genuinely empty.
   */
  localSeedable: boolean;
  /** Wall clock, injected for deterministic tests. */
  now: number;
}

export type SyncConvergence =
  | { kind: 'mark-synced' }
  | { kind: 'pull' }
  | { kind: 'push'; updatedAt: number }
  /** Do nothing now; the cloud is mid-propagation or there's nothing to seed. */
  | { kind: 'wait' };

/**
 * Decides how a sync-enabled device should converge with the cloud. Pure so the
 * policy can be unit-tested in isolation from the `chrome.storage` plumbing in
 * the background worker.
 *
 * With a readable remote:
 * - equals local → just record it (`mark-synced`);
 * - opt-in → always adopt the cloud (`pull`) so a new device can't clobber it;
 * - otherwise last-write-wins by `updatedAt`, with our own prior write treated
 *   as a republish so a stale remote can't shadow newer local edits.
 *
 * With no readable remote, seeding is deliberately conservative — this is where
 * new devices used to overwrite good cloud data before it had propagated down:
 * - a partial/in-flight remote → `wait` (never seed over it);
 * - a blank local projection → `wait` (nothing worth seeding);
 * - genuinely empty cloud + real local data → `push` (this device founds the set).
 */
export function decideSyncConvergence(input: ConvergenceInputs): SyncConvergence {
  if (input.remote) {
    if (input.remote.hash === input.localHash) return { kind: 'mark-synced' };
    if (input.optIn) return { kind: 'pull' };

    if (input.remote.deviceId === input.deviceId) {
      // Our own earlier write, but local has changed since — republish.
      return {
        kind: 'push',
        updatedAt: Math.max(input.now, input.logicalUpdatedAt),
      };
    }

    if (input.remote.updatedAt >= input.logicalUpdatedAt) return { kind: 'pull' };
    return { kind: 'push', updatedAt: input.logicalUpdatedAt || input.now };
  }

  if (input.remotePending) return { kind: 'wait' };
  if (!input.localSeedable) return { kind: 'wait' };
  return { kind: 'push', updatedAt: input.now };
}

/** Loads the machine-local sync bookkeeping, creating it on first use. */
export async function getSyncState(): Promise<SyncState> {
  const result = await chrome.storage.local.get(SYNC_STATE_KEY);
  const stored = result[SYNC_STATE_KEY] as Partial<SyncState> | undefined;

  if (stored && typeof stored.deviceId === 'string') {
    return {
      deviceId: stored.deviceId,
      logicalHash:
        typeof stored.logicalHash === 'string' ? stored.logicalHash : null,
      logicalUpdatedAt:
        typeof stored.logicalUpdatedAt === 'number'
          ? stored.logicalUpdatedAt
          : 0,
      lastSyncedHash:
        typeof stored.lastSyncedHash === 'string' ? stored.lastSyncedHash : null,
    };
  }

  const created: SyncState = {
    deviceId: crypto.randomUUID(),
    logicalHash: null,
    logicalUpdatedAt: 0,
    lastSyncedHash: null,
  };
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: created });
  return created;
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
}

/** True if a changed `chrome.storage.sync` key belongs to this module. */
export function isSyncStorageKey(key: string): boolean {
  return key === SYNC_META_KEY || key.startsWith(SYNC_CHUNK_PREFIX);
}

/**
 * True if `chrome.storage.sync` currently holds any fantab key. Used to tell a
 * genuinely empty cloud apart from one that is mid-propagation (keys present but
 * not yet a readable payload), so a new device doesn't seed over pending data.
 */
export async function hasStoredSyncData(): Promise<boolean> {
  const all = await chrome.storage.sync.get(null);
  return Object.keys(all).some(isSyncStorageKey);
}

/**
 * True if a projection holds anything worth seeding the cloud with — any home
 * pin, or more than one space. A blank/default device returns false and is never
 * allowed to overwrite the synced set.
 */
export function isSeedableProjection(payload: SyncPayload): boolean {
  if (payload.spaces.length > 1) return true;
  return payload.spaces.some((space) => space.homePins.length > 0);
}

function isSyncMeta(value: unknown): value is SyncMeta {
  if (!value || typeof value !== 'object') return false;
  const meta = value as Partial<SyncMeta>;
  return (
    meta.schemaVersion === SYNC_SCHEMA_VERSION &&
    typeof meta.updatedAt === 'number' &&
    typeof meta.deviceId === 'string' &&
    typeof meta.chunkCount === 'number' &&
    meta.chunkCount >= 0 &&
    typeof meta.hash === 'string'
  );
}

function isSyncPayload(value: unknown): value is SyncPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SyncPayload>;
  return (
    payload.schemaVersion === SYNC_SCHEMA_VERSION &&
    Array.isArray(payload.spaces) &&
    !!payload.preferences &&
    typeof payload.preferences === 'object'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
