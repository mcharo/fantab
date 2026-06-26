import {
  DEFAULT_SPACE_ID,
  STORAGE_VERSION,
  type FantabGroup,
  type HomePin,
  type SectionUnitRef,
  type Space,
  type StoredStateV7,
} from './types';
import { iconForSpaceIndex, normalizeSpaceIcon } from './spaceIcons';
import { isAtHome } from './lib/url';

export const STORAGE_KEY = 'fantab_state';

const DEFAULT_WINDOW_KEY = 'default';

export const DEFAULT_GROUP_TITLE = 'New Folder';

interface LegacyStoredStateV3 {
  version: 3;
  activeSpaceId: string;
  spaces: LegacySpace[];
  tabAliases: Record<string, string>;
}

interface LegacySpace {
  id: string;
  name: string;
  icon?: unknown;
  homePins: HomePin[];
  createdAt: number;
  order: number;
}

interface LegacyStoredStateV4 {
  version: 4;
  activeSpaceByWindowId: Record<string, string>;
  spaces: LegacySpace[];
  tabAliases: Record<string, string>;
}

interface LegacyStoredStateV5 {
  version: 5;
  activeSpaceByWindowId: Record<string, string>;
  spaces: LegacySpace[];
  tabAliases: Record<string, string>;
}

/** V6: the last schema before fantab-owned tab groups (groups, membership). */
interface LegacyStoredStateV6 {
  version: 6;
  activeSpaceByWindowId: Record<string, string>;
  lastActiveTabBySpace?: Record<string, number>;
  spaces: LegacySpace[];
  tabAliases: Record<string, string>;
  tabSpaces: Record<string, string>;
}

export function createDefaultSpace(): Space {
  return {
    id: DEFAULT_SPACE_ID,
    name: 'Default',
    icon: iconForSpaceIndex(0),
    homePins: [],
    groups: [],
    createdAt: Date.now(),
    order: 0,
  };
}

export function createDefaultState(): StoredStateV7 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: {
      [DEFAULT_WINDOW_KEY]: DEFAULT_SPACE_ID,
    },
    lastActiveTabBySpace: {},
    spaces: [createDefaultSpace()],
    tabAliases: {},
    tabSpaces: {},
    tabGroupMembership: {},
  };
}

export const DEFAULT_STATE: StoredStateV7 = createDefaultState();

export function windowKey(windowId: number | null | undefined): string {
  return typeof windowId === 'number' ? String(windowId) : DEFAULT_WINDOW_KEY;
}

function tabKey(tabId: number): string {
  return String(tabId);
}

function activeTabSpaceKey(
  windowId: number | null | undefined,
  spaceId: string,
): string {
  return `${windowKey(windowId)}:${spaceId}`;
}

function spaceIdFromActiveTabSpaceKey(key: string): string | null {
  const separatorIndex = key.indexOf(':');
  if (separatorIndex === -1) return null;
  return key.slice(separatorIndex + 1);
}

export function isStoredStateV7(value: unknown): value is StoredStateV7 {
  if (!value || typeof value !== 'object') return false;

  const state = value as Partial<StoredStateV7>;
  return (
    state.version === STORAGE_VERSION &&
    !!state.activeSpaceByWindowId &&
    typeof state.activeSpaceByWindowId === 'object' &&
    Array.isArray(state.spaces) &&
    state.spaces.length > 0 &&
    !!state.tabAliases &&
    typeof state.tabAliases === 'object' &&
    !!state.tabSpaces &&
    typeof state.tabSpaces === 'object' &&
    (state.lastActiveTabBySpace === undefined ||
      typeof state.lastActiveTabBySpace === 'object')
  );
}

function isLegacyStoredStateV3(value: unknown): value is LegacyStoredStateV3 {
  if (!value || typeof value !== 'object') return false;

  const state = value as Partial<LegacyStoredStateV3>;
  return (
    state.version === 3 &&
    typeof state.activeSpaceId === 'string' &&
    Array.isArray(state.spaces) &&
    state.spaces.length > 0 &&
    !!state.tabAliases &&
    typeof state.tabAliases === 'object'
  );
}

function isLegacyStoredStateV4(value: unknown): value is LegacyStoredStateV4 {
  if (!value || typeof value !== 'object') return false;

  const state = value as Partial<LegacyStoredStateV4>;
  return (
    state.version === 4 &&
    !!state.activeSpaceByWindowId &&
    typeof state.activeSpaceByWindowId === 'object' &&
    Array.isArray(state.spaces) &&
    state.spaces.length > 0 &&
    !!state.tabAliases &&
    typeof state.tabAliases === 'object'
  );
}

function isLegacyStoredStateV5(value: unknown): value is LegacyStoredStateV5 {
  if (!value || typeof value !== 'object') return false;

  const state = value as Partial<LegacyStoredStateV5>;
  return (
    state.version === 5 &&
    !!state.activeSpaceByWindowId &&
    typeof state.activeSpaceByWindowId === 'object' &&
    Array.isArray(state.spaces) &&
    state.spaces.length > 0 &&
    !!state.tabAliases &&
    typeof state.tabAliases === 'object'
  );
}

function isLegacyStoredStateV6(value: unknown): value is LegacyStoredStateV6 {
  if (!value || typeof value !== 'object') return false;

  const state = value as Partial<LegacyStoredStateV6>;
  return (
    state.version === 6 &&
    !!state.activeSpaceByWindowId &&
    typeof state.activeSpaceByWindowId === 'object' &&
    Array.isArray(state.spaces) &&
    state.spaces.length > 0 &&
    !!state.tabAliases &&
    typeof state.tabAliases === 'object' &&
    !!state.tabSpaces &&
    typeof state.tabSpaces === 'object'
  );
}

function normalizeSpace(space: LegacySpace, index: number): Space {
  return {
    ...space,
    icon:
      typeof space.icon === 'string'
        ? normalizeSpaceIcon(space.icon)
        : iconForSpaceIndex(index),
  };
}

function migrateV3State(state: LegacyStoredStateV3): StoredStateV7 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: {
      [DEFAULT_WINDOW_KEY]: state.activeSpaceId,
    },
    spaces: state.spaces.map(normalizeSpace),
    lastActiveTabBySpace: {},
    tabAliases: state.tabAliases,
    tabSpaces: {},
  };
}

function migrateV4State(state: LegacyStoredStateV4): StoredStateV7 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: state.activeSpaceByWindowId,
    spaces: state.spaces.map(normalizeSpace),
    lastActiveTabBySpace: {},
    tabAliases: state.tabAliases,
    tabSpaces: {},
  };
}

function migrateV5State(state: LegacyStoredStateV5): StoredStateV7 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: state.activeSpaceByWindowId,
    spaces: state.spaces.map(normalizeSpace),
    lastActiveTabBySpace: {},
    tabAliases: state.tabAliases,
    tabSpaces: {},
    tabGroupMembership: {},
  };
}

// V6 -> V7: introduce fantab-owned tab groups. Existing spaces gain an empty
// group list, pins stay loose, and there is no unpinned-group membership yet.
function migrateV6State(state: LegacyStoredStateV6): StoredStateV7 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: state.activeSpaceByWindowId,
    spaces: state.spaces.map((space, index) => ({
      ...normalizeSpace(space, index),
      groups: [],
    })),
    lastActiveTabBySpace: state.lastActiveTabBySpace ?? {},
    tabAliases: state.tabAliases,
    tabSpaces: state.tabSpaces,
    tabGroupMembership: {},
  };
}

export function normalizeState(state: StoredStateV7): StoredStateV7 {
  const sortedSpaces = [...state.spaces].sort((a, b) => a.order - b.order);
  const spaceIds = new Set(sortedSpaces.map((space) => space.id));
  const activeSpaceByWindowId: Record<string, string> = {};

  for (const [key, spaceId] of Object.entries(state.activeSpaceByWindowId)) {
    if (spaceIds.has(spaceId)) {
      activeSpaceByWindowId[key] = spaceId;
    }
  }

  if (!spaceIds.has(activeSpaceByWindowId[DEFAULT_WINDOW_KEY])) {
    activeSpaceByWindowId[DEFAULT_WINDOW_KEY] = sortedSpaces[0].id;
  }

  const tabSpaces = Object.fromEntries(
    Object.entries(state.tabSpaces).filter(([, spaceId]) =>
      spaceIds.has(spaceId),
    ),
  );
  const lastActiveTabBySpace: Record<string, number> = {};

  for (const [key, tabId] of Object.entries(
    state.lastActiveTabBySpace ?? {},
  )) {
    const spaceId = spaceIdFromActiveTabSpaceKey(key);
    if (spaceId && spaceIds.has(spaceId) && typeof tabId === 'number') {
      lastActiveTabBySpace[key] = tabId;
    }
  }

  // Catalog every group (across spaces) so membership and pin references can be
  // validated by id.
  const groupPinnedById = new Map<string, boolean>();
  for (const space of sortedSpaces) {
    for (const group of space.groups ?? []) {
      if (typeof group?.id === 'string' && !groupPinnedById.has(group.id)) {
        groupPinnedById.set(group.id, !!group.pinned);
      }
    }
  }

  // Unpinned-group membership only survives for an existing unpinned group.
  const tabGroupMembership: Record<string, string> = {};
  for (const [tabId, groupId] of Object.entries(
    state.tabGroupMembership ?? {},
  )) {
    if (groupPinnedById.get(groupId) === false) {
      tabGroupMembership[tabId] = groupId;
    }
  }
  const referencedUnpinnedGroupIds = new Set(Object.values(tabGroupMembership));

  // Reindex pins and validate each pin's pinned-group reference up front so we
  // know which pinned groups actually have members.
  const reindexedSpaces = sortedSpaces.map((space, index) => {
    const pinnedGroupIds = new Set(
      (space.groups ?? [])
        .filter((group) => typeof group?.id === 'string' && group.pinned)
        .map((group) => group.id),
    );

    const homePins = [...space.homePins]
      .sort((a, b) => a.order - b.order)
      .map((pin, pinIndex) => ({
        ...pin,
        order: pinIndex,
        groupId:
          pin.groupId && pinnedGroupIds.has(pin.groupId) ? pin.groupId : null,
      }));

    return { space, index, homePins };
  });

  const referencedPinnedGroupIds = new Set<string>();
  for (const { homePins } of reindexedSpaces) {
    for (const pin of homePins) {
      if (pin.groupId) referencedPinnedGroupIds.add(pin.groupId);
    }
  }

  const spaces = reindexedSpaces.map(({ space, index, homePins }) => {
    const groups: FantabGroup[] = (space.groups ?? [])
      .filter((group) => typeof group?.id === 'string')
      .filter((group) =>
        group.pinned
          ? referencedPinnedGroupIds.has(group.id)
          : referencedUnpinnedGroupIds.has(group.id),
      )
      .sort((a, b) => a.order - b.order)
      .map((group, groupIndex) => ({
        id: group.id,
        title: group.title,
        pinned: !!group.pinned,
        collapsed: !!group.collapsed,
        peek: !!group.peek,
        order: groupIndex,
        createdAt:
          typeof group.createdAt === 'number' ? group.createdAt : Date.now(),
      }));

    return {
      ...space,
      icon: normalizeSpaceIcon(space.icon),
      order: index,
      homePins,
      groups,
    };
  });

  return {
    ...state,
    activeSpaceByWindowId,
    lastActiveTabBySpace,
    tabSpaces,
    tabGroupMembership,
    spaces,
  };
}

export async function loadState(): Promise<StoredStateV7> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY];

  if (isStoredStateV7(state)) return normalizeState(state);
  if (isLegacyStoredStateV6(state)) return normalizeState(migrateV6State(state));
  if (isLegacyStoredStateV5(state)) return normalizeState(migrateV5State(state));
  if (isLegacyStoredStateV4(state)) return normalizeState(migrateV4State(state));
  if (isLegacyStoredStateV3(state)) return normalizeState(migrateV3State(state));

  return createDefaultState();
}

export async function saveState(state: StoredStateV7): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeState(state) });
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function getActiveSpaceId(
  state: StoredStateV7,
  windowId?: number | null,
): string {
  const key = windowKey(windowId);
  return (
    state.activeSpaceByWindowId[key] ??
    state.activeSpaceByWindowId[DEFAULT_WINDOW_KEY] ??
    state.spaces[0].id
  );
}

export function getActiveSpace(
  state: StoredStateV7,
  windowId?: number | null,
): Space {
  const activeSpaceId = getActiveSpaceId(state, windowId);
  return (
    state.spaces.find((space) => space.id === activeSpaceId) ??
    state.spaces[0]
  );
}

function updateSpace(
  state: StoredStateV7,
  spaceId: string,
  updater: (space: Space) => Space,
): StoredStateV7 {
  return {
    ...state,
    spaces: state.spaces.map((space) =>
      space.id === spaceId ? updater(space) : space,
    ),
  };
}

export function findHomePinById(
  state: StoredStateV7,
  id: string,
  spaceId = getActiveSpaceId(state),
): HomePin | undefined {
  return state.spaces
    .find((space) => space.id === spaceId)
    ?.homePins.find((pin) => pin.id === id);
}

export function findHomePinByTabId(
  state: StoredStateV7,
  tabId: number,
  spaceId = getActiveSpaceId(state),
): HomePin | undefined {
  return state.spaces
    .find((space) => space.id === spaceId)
    ?.homePins.find((pin) => pin.tabId === tabId);
}

export function updateHomePin(
  state: StoredStateV7,
  id: string,
  updates: Partial<HomePin>,
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  return updateSpace(state, spaceId, (space) => ({
    ...space,
    homePins: space.homePins.map((pin) =>
      pin.id === id ? { ...pin, ...updates } : pin,
    ),
  }));
}

export function addHomePin(
  state: StoredStateV7,
  homePin: HomePin,
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  return updateSpace(state, spaceId, (space) => ({
    ...space,
    homePins: [...space.homePins, homePin],
  }));
}

export function removeHomePin(
  state: StoredStateV7,
  id: string,
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  return updateSpace(state, spaceId, (space) => ({
    ...space,
    homePins: space.homePins.filter((pin) => pin.id !== id),
  }));
}

export function moveHomePin(
  state: StoredStateV7,
  id: string,
  toIndex: number,
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  const space = state.spaces.find((candidate) => candidate.id === spaceId);
  if (!space) return state;

  const sortedPins = [...space.homePins].sort((a, b) => a.order - b.order);
  const currentIndex = sortedPins.findIndex((pin) => pin.id === id);
  if (currentIndex === -1) return state;

  const [pin] = sortedPins.splice(currentIndex, 1);
  const boundedIndex = Math.max(0, Math.min(toIndex, sortedPins.length));
  sortedPins.splice(boundedIndex, 0, pin);

  return updateSpace(state, spaceId, (nextSpace) => ({
    ...nextSpace,
    homePins: sortedPins.map((nextPin, index) => ({
      ...nextPin,
      order: index,
    })),
  }));
}

/**
 * Reorder a home pin so it sits immediately before or after a target pin. The
 * index is resolved within the space's full pin list, so reordering works for
 * pins inside folders (which aren't contiguous in the overall pin order).
 */
export function moveHomePinRelativeTo(
  state: StoredStateV7,
  homePinId: string,
  targetHomePinId: string,
  position: 'before' | 'after',
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  if (homePinId === targetHomePinId) return state;

  const space = state.spaces.find((candidate) => candidate.id === spaceId);
  if (!space) return state;

  const withoutDragged = [...space.homePins]
    .sort((a, b) => a.order - b.order)
    .filter((pin) => pin.id !== homePinId);
  const targetIndex = withoutDragged.findIndex(
    (pin) => pin.id === targetHomePinId,
  );
  if (targetIndex === -1) return state;

  return moveHomePin(
    state,
    homePinId,
    position === 'after' ? targetIndex + 1 : targetIndex,
    spaceId,
  );
}

export function moveHomePinToSpace(
  state: StoredStateV7,
  id: string,
  targetSpaceId: string,
): StoredStateV7 {
  const targetSpace = state.spaces.find((space) => space.id === targetSpaceId);
  if (!targetSpace) return state;

  const sourceSpace = state.spaces.find((space) =>
    space.homePins.some((pin) => pin.id === id),
  );
  if (!sourceSpace || sourceSpace.id === targetSpace.id) return state;

  const homePin = sourceSpace.homePins.find((pin) => pin.id === id);
  if (!homePin) return state;

  const nextTargetOrder = targetSpace.homePins.reduce(
    (max, pin) => Math.max(max, pin.order),
    -1,
  ) + 1;

  let nextState = {
    ...state,
    spaces: state.spaces.map((space) => {
      if (space.id === sourceSpace.id) {
        return {
          ...space,
          homePins: space.homePins
            .filter((pin) => pin.id !== id)
            .sort((a, b) => a.order - b.order)
            .map((pin, index) => ({ ...pin, order: index })),
        };
      }

      if (space.id === targetSpace.id) {
        return {
          ...space,
          homePins: [
            ...space.homePins,
            { ...homePin, order: nextTargetOrder },
          ],
        };
      }

      return space;
    }),
  };

  if (typeof homePin.tabId === 'number') {
    nextState = assignTabToSpace(nextState, homePin.tabId, targetSpace.id);
  }

  return nextState;
}

export function createSpace(
  state: StoredStateV7,
  name: string,
  windowId?: number | null,
  icon?: unknown,
): StoredStateV7 {
  const trimmed = name.trim() || `Space ${state.spaces.length + 1}`;
  const nextOrder = state.spaces.reduce(
    (max, space) => Math.max(max, space.order),
    -1,
  ) + 1;
  const space: Space = {
    id: generateId(),
    name: trimmed,
    icon:
      icon === undefined
        ? iconForSpaceIndex(nextOrder)
        : normalizeSpaceIcon(icon),
    homePins: [],
    createdAt: Date.now(),
    order: nextOrder,
  };

  return {
    ...state,
    activeSpaceByWindowId: {
      ...state.activeSpaceByWindowId,
      [windowKey(windowId)]: space.id,
    },
    spaces: [...state.spaces, space],
  };
}

export function renameSpace(
  state: StoredStateV7,
  spaceId: string,
  name: string,
): StoredStateV7 {
  const trimmed = name.trim();
  if (!trimmed) return state;

  return updateSpace(state, spaceId, (space) => ({ ...space, name: trimmed }));
}

export function updateSpaceDetails(
  state: StoredStateV7,
  spaceId: string,
  updates: { name?: string; icon?: unknown },
): StoredStateV7 {
  return updateSpace(state, spaceId, (space) => {
    const name = updates.name?.trim();

    return {
      ...space,
      name: name || space.name,
      icon:
        updates.icon === undefined
          ? space.icon
          : normalizeSpaceIcon(updates.icon),
    };
  });
}

export function switchSpace(
  state: StoredStateV7,
  spaceId: string,
  windowId?: number | null,
): StoredStateV7 {
  if (!state.spaces.some((space) => space.id === spaceId)) return state;

  return {
    ...state,
    activeSpaceByWindowId: {
      ...state.activeSpaceByWindowId,
      [windowKey(windowId)]: spaceId,
    },
  };
}

export function deleteSpace(
  state: StoredStateV7,
  spaceId: string,
): StoredStateV7 {
  if (state.spaces.length <= 1) return state;

  const spaces = state.spaces
    .filter((space) => space.id !== spaceId)
    .sort((a, b) => a.order - b.order)
    .map((space, index) => ({ ...space, order: index }));
  const remainingSpaceIds = new Set(spaces.map((space) => space.id));
  const fallbackSpaceId = spaces[0].id;
  const activeSpaceByWindowId: Record<string, string> = {};

  for (const [key, activeSpaceId] of Object.entries(
    state.activeSpaceByWindowId,
  )) {
    activeSpaceByWindowId[key] = remainingSpaceIds.has(activeSpaceId)
      ? activeSpaceId
      : fallbackSpaceId;
  }

  activeSpaceByWindowId[DEFAULT_WINDOW_KEY] ??= fallbackSpaceId;

  const tabSpaces = Object.fromEntries(
    Object.entries(state.tabSpaces).map(([tabId, assignedSpaceId]) => [
      tabId,
      remainingSpaceIds.has(assignedSpaceId) ? assignedSpaceId : fallbackSpaceId,
    ]),
  );
  const lastActiveTabBySpace = Object.fromEntries(
    Object.entries(state.lastActiveTabBySpace).filter(([key]) => {
      const rememberedSpaceId = spaceIdFromActiveTabSpaceKey(key);
      return rememberedSpaceId && remainingSpaceIds.has(rememberedSpaceId);
    }),
  );

  return {
    ...state,
    activeSpaceByWindowId,
    lastActiveTabBySpace,
    spaces,
    tabSpaces,
  };
}

export function renameTabAlias(
  state: StoredStateV7,
  tabId: number,
  alias: string,
): StoredStateV7 {
  const tabAliases = { ...state.tabAliases };
  const trimmed = alias.trim();

  if (trimmed) tabAliases[String(tabId)] = trimmed;
  else delete tabAliases[String(tabId)];

  return { ...state, tabAliases };
}

export function removeTabAlias(
  state: StoredStateV7,
  tabId: number,
): StoredStateV7 {
  const tabAliases = { ...state.tabAliases };
  delete tabAliases[String(tabId)];
  return { ...state, tabAliases };
}

export function pruneAliasesForTabs(
  state: StoredStateV7,
  liveTabIds: Set<number>,
): StoredStateV7 {
  const tabAliases: Record<string, string> = {};

  for (const [tabId, alias] of Object.entries(state.tabAliases)) {
    if (liveTabIds.has(Number(tabId))) {
      tabAliases[tabId] = alias;
    }
  }

  if (Object.keys(tabAliases).length === Object.keys(state.tabAliases).length) {
    return state;
  }

  return { ...state, tabAliases };
}

export function pruneTabSpacesForTabs(
  state: StoredStateV7,
  liveTabIds: Set<number>,
): StoredStateV7 {
  const tabSpaces: Record<string, string> = {};

  for (const [tabId, spaceId] of Object.entries(state.tabSpaces)) {
    if (liveTabIds.has(Number(tabId))) {
      tabSpaces[tabId] = spaceId;
    }
  }

  if (Object.keys(tabSpaces).length === Object.keys(state.tabSpaces).length) {
    return state;
  }

  return { ...state, tabSpaces };
}

export function pruneLastActiveTabsForTabs(
  state: StoredStateV7,
  liveTabIds: Set<number>,
): StoredStateV7 {
  const lastActiveTabBySpace: Record<string, number> = {};

  for (const [key, tabId] of Object.entries(state.lastActiveTabBySpace)) {
    if (liveTabIds.has(tabId)) {
      lastActiveTabBySpace[key] = tabId;
    }
  }

  if (
    Object.keys(lastActiveTabBySpace).length ===
    Object.keys(state.lastActiveTabBySpace).length
  ) {
    return state;
  }

  return { ...state, lastActiveTabBySpace };
}

export function rememberActiveTabForSpace(
  state: StoredStateV7,
  windowId: number | null | undefined,
  spaceId: string,
  tabId: number,
): StoredStateV7 {
  if (!state.spaces.some((space) => space.id === spaceId)) return state;

  const key = activeTabSpaceKey(windowId, spaceId);
  if (state.lastActiveTabBySpace[key] === tabId) return state;

  return {
    ...state,
    lastActiveTabBySpace: {
      ...state.lastActiveTabBySpace,
      [key]: tabId,
    },
  };
}

export function getRememberedActiveTabId(
  state: StoredStateV7,
  windowId: number | null | undefined,
  spaceId: string,
): number | null {
  return (
    state.lastActiveTabBySpace[activeTabSpaceKey(windowId, spaceId)] ?? null
  );
}

export function assignTabToSpace(
  state: StoredStateV7,
  tabId: number,
  spaceId: string,
): StoredStateV7 {
  if (!state.spaces.some((space) => space.id === spaceId)) return state;
  if (state.tabSpaces[tabKey(tabId)] === spaceId) return state;

  // Groups are scoped to a space, so a tab changing spaces leaves its
  // (now cross-space) unpinned group.
  const tabGroupMembership = { ...(state.tabGroupMembership ?? {}) };
  delete tabGroupMembership[tabKey(tabId)];

  return {
    ...state,
    tabSpaces: {
      ...state.tabSpaces,
      [tabKey(tabId)]: spaceId,
    },
    tabGroupMembership,
  };
}

export function assignTabsToActiveSpaces(
  state: StoredStateV7,
  liveTabs: chrome.tabs.Tab[],
): StoredStateV7 {
  const liveTabIds = new Set(
    liveTabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number'),
  );
  const tabSpaces = { ...state.tabSpaces };
  let changed = false;

  for (const space of state.spaces) {
    for (const pin of space.homePins) {
      if (typeof pin.tabId !== 'number' || !liveTabIds.has(pin.tabId)) {
        continue;
      }

      const key = tabKey(pin.tabId);
      if (tabSpaces[key]) continue;

      tabSpaces[key] = space.id;
      changed = true;
    }
  }

  for (const tab of liveTabs) {
    if (typeof tab.id !== 'number') continue;

    const key = tabKey(tab.id);
    if (tabSpaces[key]) continue;

    tabSpaces[key] = getActiveSpaceId(state, tab.windowId);
    changed = true;
  }

  return changed ? { ...state, tabSpaces } : state;
}

export function updateHomePinsFromTabs(
  state: StoredStateV7,
  liveTabs: chrome.tabs.Tab[],
): StoredStateV7 {
  const tabMap = new Map(liveTabs.map((tab) => [tab.id, tab]));
  let changed = false;

  const spaces = state.spaces.map((space) => ({
    ...space,
    homePins: space.homePins.map((pin) => {
      if (pin.tabId === null) return pin;

      const tab = tabMap.get(pin.tabId);
      if (!tab) {
        changed = true;
        return { ...pin, tabId: null };
      }

      const nextPin = {
        ...pin,
        faviconUrl: tab.favIconUrl ?? pin.faviconUrl,
        lastKnownUrl: tab.url ?? tab.pendingUrl ?? pin.lastKnownUrl,
        lastKnownTitle: tab.title ?? pin.lastKnownTitle,
      };

      if (JSON.stringify(nextPin) !== JSON.stringify(pin)) {
        changed = true;
      }

      return nextPin;
    }),
  }));

  return changed ? { ...state, spaces } : state;
}

/**
 * Re-bind home pins whose live tab has disappeared to a matching restored tab,
 * matched by URL instead of the now-stale tab id. This recovers from a Chrome
 * restart, which restores the previous session's tabs with brand-new ids.
 *
 * A lost pin is matched to the first unclaimed live tab whose URL equals (by
 * origin + pathname, via {@link isAtHome}) the pin's `lastKnownUrl` and then,
 * failing that, its `homeUrl`. `lastKnownUrl` matches are resolved across all
 * pins first so an exact match wins over another pin's `homeUrl` match. Tabs
 * already held by a still-live pin are never reused, and each tab binds to at
 * most one pin. The matched tab is assigned to the pin's own space (correcting a
 * tab a prior reconcile may have parked in the active space as a loose tab).
 */
export function reattachHomePinsToRestoredTabs(
  state: StoredStateV7,
  liveTabs: chrome.tabs.Tab[],
): StoredStateV7 {
  const liveTabIds = new Set(
    liveTabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number'),
  );

  const lostPins = state.spaces.flatMap((space) =>
    space.homePins.filter(
      (pin) => typeof pin.tabId !== 'number' || !liveTabIds.has(pin.tabId),
    ),
  );
  if (lostPins.length === 0) return state;

  // Tabs still held by a live pin binding must not be reused.
  const claimed = new Set<number>();
  for (const space of state.spaces) {
    for (const pin of space.homePins) {
      if (typeof pin.tabId === 'number' && liveTabIds.has(pin.tabId)) {
        claimed.add(pin.tabId);
      }
    }
  }

  const candidates = liveTabs.filter(
    (tab): tab is chrome.tabs.Tab & { id: number } =>
      typeof tab.id === 'number' && !!(tab.url ?? tab.pendingUrl),
  );

  const matches = new Map<string, chrome.tabs.Tab & { id: number }>();
  const matchPass = (ref: (pin: HomePin) => string | null) => {
    for (const pin of lostPins) {
      if (matches.has(pin.id)) continue;

      const homeRef = ref(pin);
      if (!homeRef) continue;

      const match = candidates.find(
        (tab) =>
          !claimed.has(tab.id) &&
          isAtHome(tab.url ?? tab.pendingUrl ?? null, homeRef),
      );
      if (match) {
        matches.set(pin.id, match);
        claimed.add(match.id);
      }
    }
  };

  matchPass((pin) => pin.lastKnownUrl);
  matchPass((pin) => pin.homeUrl);

  if (matches.size === 0) return state;

  const tabSpaces = { ...state.tabSpaces };
  const spaces = state.spaces.map((space) => {
    let spaceChanged = false;
    const homePins = space.homePins.map((pin) => {
      const match = matches.get(pin.id);
      if (!match) return pin;

      tabSpaces[tabKey(match.id)] = space.id;
      spaceChanged = true;

      return {
        ...pin,
        tabId: match.id,
        faviconUrl: match.favIconUrl ?? pin.faviconUrl,
        lastKnownUrl: match.url ?? match.pendingUrl ?? pin.lastKnownUrl,
        lastKnownTitle: match.title ?? pin.lastKnownTitle,
      };
    });

    return spaceChanged ? { ...space, homePins } : space;
  });

  return { ...state, spaces, tabSpaces };
}

// --- Fantab-owned tab groups ------------------------------------------------

interface GroupLocation {
  space: Space;
  group: FantabGroup;
}

function findGroupEntry(
  state: StoredStateV7,
  groupId: string,
): GroupLocation | null {
  for (const space of state.spaces) {
    const group = (space.groups ?? []).find(
      (candidate) => candidate.id === groupId,
    );
    if (group) return { space, group };
  }
  return null;
}

export function findGroupById(
  state: StoredStateV7,
  groupId: string,
): FantabGroup | undefined {
  return findGroupEntry(state, groupId)?.group ?? undefined;
}

export function createGroup(
  state: StoredStateV7,
  options: {
    title?: string;
    pinned: boolean;
    id?: string;
  },
  spaceId = getActiveSpaceId(state),
): { state: StoredStateV7; groupId: string } {
  const space = state.spaces.find((candidate) => candidate.id === spaceId);
  if (!space) return { state, groupId: '' };

  const groupId = options.id ?? generateId();
  const nextOrder =
    (space.groups ?? []).reduce((max, group) => Math.max(max, group.order), -1) +
    1;
  const group: FantabGroup = {
    id: groupId,
    title: options.title?.trim() || DEFAULT_GROUP_TITLE,
    pinned: options.pinned,
    collapsed: false,
    peek: false,
    order: nextOrder,
    createdAt: Date.now(),
  };

  return {
    state: updateSpace(state, spaceId, (current) => ({
      ...current,
      groups: [...(current.groups ?? []), group],
    })),
    groupId,
  };
}

/**
 * Move a whole folder to another space, carrying its members along so the
 * folder stays intact (normalization drops a folder whose members live in a
 * different space). A pinned folder's home pins move with it (keeping their
 * `groupId`); an unpinned folder's live tabs are reassigned to the target space
 * while their `tabGroupMembership` is preserved.
 */
export function moveGroupToSpace(
  state: StoredStateV7,
  groupId: string,
  targetSpaceId: string,
): StoredStateV7 {
  const entry = findGroupEntry(state, groupId);
  if (!entry) return state;

  const { space: sourceSpace, group } = entry;
  if (sourceSpace.id === targetSpaceId) return state;

  const targetSpace = state.spaces.find((space) => space.id === targetSpaceId);
  if (!targetSpace) return state;

  const nextGroupOrder =
    (targetSpace.groups ?? []).reduce(
      (max, candidate) => Math.max(max, candidate.order),
      -1,
    ) + 1;
  const movedGroup: FantabGroup = { ...group, order: nextGroupOrder };

  if (group.pinned) {
    const members = sourceSpace.homePins
      .filter((pin) => pin.groupId === groupId)
      .sort((a, b) => a.order - b.order);
    const memberIds = new Set(members.map((pin) => pin.id));
    let nextTargetPinOrder =
      targetSpace.homePins.reduce((max, pin) => Math.max(max, pin.order), -1) + 1;

    let nextState: StoredStateV7 = {
      ...state,
      spaces: state.spaces.map((space) => {
        if (space.id === sourceSpace.id) {
          return {
            ...space,
            groups: (space.groups ?? []).filter((g) => g.id !== groupId),
            homePins: space.homePins
              .filter((pin) => !memberIds.has(pin.id))
              .sort((a, b) => a.order - b.order)
              .map((pin, index) => ({ ...pin, order: index })),
          };
        }
        if (space.id === targetSpace.id) {
          return {
            ...space,
            groups: [...(space.groups ?? []), movedGroup],
            homePins: [
              ...space.homePins,
              ...members.map((pin) => ({ ...pin, order: nextTargetPinOrder++ })),
            ],
          };
        }
        return space;
      }),
    };

    // Keep any open tabs backing these pins in the same space as the pin.
    for (const pin of members) {
      if (typeof pin.tabId === 'number') {
        nextState = assignTabToSpace(nextState, pin.tabId, targetSpace.id);
      }
    }

    return nextState;
  }

  // Unpinned folder: members are live tabs tracked by `tabGroupMembership`.
  const memberTabKeys = Object.entries(state.tabGroupMembership ?? {})
    .filter(([, memberGroupId]) => memberGroupId === groupId)
    .map(([key]) => key);

  const tabSpaces = { ...state.tabSpaces };
  for (const key of memberTabKeys) {
    tabSpaces[key] = targetSpace.id;
  }

  return {
    ...state,
    tabSpaces,
    spaces: state.spaces.map((space) => {
      if (space.id === sourceSpace.id) {
        return {
          ...space,
          groups: (space.groups ?? []).filter((g) => g.id !== groupId),
        };
      }
      if (space.id === targetSpace.id) {
        return { ...space, groups: [...(space.groups ?? []), movedGroup] };
      }
      return space;
    }),
  };
}

export function updateGroup(
  state: StoredStateV7,
  groupId: string,
  updates: { title?: string; collapsed?: boolean; peek?: boolean },
): StoredStateV7 {
  const entry = findGroupEntry(state, groupId);
  if (!entry) return state;

  return updateSpace(state, entry.space.id, (space) => ({
    ...space,
    groups: (space.groups ?? []).map((group) =>
      group.id === groupId
        ? {
            ...group,
            title:
              updates.title !== undefined
                ? updates.title.trim() || group.title
                : group.title,
            collapsed:
              updates.collapsed !== undefined
                ? updates.collapsed
                : group.collapsed,
            peek: updates.peek !== undefined ? updates.peek : group.peek,
          }
        : group,
    ),
  }));
}

export function setGroupPinned(
  state: StoredStateV7,
  groupId: string,
  pinned: boolean,
): StoredStateV7 {
  const entry = findGroupEntry(state, groupId);
  if (!entry) return state;

  return updateSpace(state, entry.space.id, (space) => ({
    ...space,
    groups: (space.groups ?? []).map((group) =>
      group.id === groupId ? { ...group, pinned } : group,
    ),
  }));
}

export function moveGroup(
  state: StoredStateV7,
  groupId: string,
  toIndex: number,
): StoredStateV7 {
  const entry = findGroupEntry(state, groupId);
  if (!entry) return state;

  const sorted = [...(entry.space.groups ?? [])].sort(
    (a, b) => a.order - b.order,
  );
  const currentIndex = sorted.findIndex((group) => group.id === groupId);
  if (currentIndex === -1) return state;

  const [group] = sorted.splice(currentIndex, 1);
  const boundedIndex = Math.max(0, Math.min(toIndex, sorted.length));
  sorted.splice(boundedIndex, 0, group);

  return updateSpace(state, entry.space.id, (space) => ({
    ...space,
    groups: sorted.map((next, index) => ({ ...next, order: index })),
  }));
}

/**
 * A draggable unit within the pinned section: a folder (its member home pins as
 * a contiguous block) or a single loose home pin.
 */
type PinnedUnit =
  | { kind: 'folder'; groupId: string; anchor: number; pinIds: string[] }
  | { kind: 'pin'; homePinId: string; anchor: number };

function buildPinnedUnits(space: Space): PinnedUnit[] {
  const pinnedGroupIds = new Set(
    (space.groups ?? []).filter((group) => group.pinned).map((group) => group.id),
  );
  const sortedPins = [...space.homePins].sort((a, b) => a.order - b.order);

  const membersByGroup = new Map<string, HomePin[]>();
  const loose: HomePin[] = [];
  for (const pin of sortedPins) {
    if (pin.groupId && pinnedGroupIds.has(pin.groupId)) {
      const list = membersByGroup.get(pin.groupId) ?? [];
      list.push(pin);
      membersByGroup.set(pin.groupId, list);
    } else {
      loose.push(pin);
    }
  }

  const units: PinnedUnit[] = [];
  for (const [groupId, members] of membersByGroup) {
    units.push({
      kind: 'folder',
      groupId,
      anchor: Math.min(...members.map((pin) => pin.order)),
      pinIds: members.map((pin) => pin.id),
    });
  }
  for (const pin of loose) {
    units.push({ kind: 'pin', homePinId: pin.id, anchor: pin.order });
  }
  return units.sort((a, b) => a.anchor - b.anchor);
}

function pinnedUnitMatches(unit: PinnedUnit, ref: SectionUnitRef): boolean {
  if (ref.kind === 'folder') {
    return unit.kind === 'folder' && unit.groupId === ref.groupId;
  }
  if (ref.kind === 'pin') {
    return unit.kind === 'pin' && unit.homePinId === ref.homePinId;
  }
  return false;
}

/**
 * Reorder a unit within the pinned section so it lands immediately before/after
 * a target unit. Rewrites `homePin.order` for the whole section; a folder's
 * member pins move together as a contiguous block. Works for any combination of
 * dragged/target being a folder or a loose pin.
 */
export function reorderPinnedSection(
  state: StoredStateV7,
  dragged: SectionUnitRef,
  target: SectionUnitRef,
  position: 'before' | 'after',
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  const space = state.spaces.find((candidate) => candidate.id === spaceId);
  if (!space) return state;

  const units = buildPinnedUnits(space);
  const fromIndex = units.findIndex((unit) => pinnedUnitMatches(unit, dragged));
  const targetIndex = units.findIndex((unit) => pinnedUnitMatches(unit, target));
  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    return state;
  }

  const [moved] = units.splice(fromIndex, 1);
  let insertIndex = units.findIndex((unit) => pinnedUnitMatches(unit, target));
  if (position === 'after') insertIndex += 1;
  units.splice(insertIndex, 0, moved);

  const orderedPinIds: string[] = [];
  for (const unit of units) {
    if (unit.kind === 'folder') orderedPinIds.push(...unit.pinIds);
    else orderedPinIds.push(unit.homePinId);
  }
  const orderById = new Map(
    orderedPinIds.map((id, index) => [id, index] as const),
  );

  return updateSpace(state, spaceId, (current) => ({
    ...current,
    homePins: current.homePins.map((pin) => ({
      ...pin,
      order: orderById.get(pin.id) ?? pin.order,
    })),
  }));
}

interface UnpinnedTabInfo {
  tabId: number;
  /** Current Chrome tab-strip index. */
  index: number;
  /** Unpinned-group id, or null when loose. */
  groupId: string | null;
}

/**
 * Plan the `chrome.tabs.move` for reordering a unit within the unpinned section.
 * Returns the dragged tab ids (a folder's members, or a single loose tab) and
 * the strip index to move them to as a contiguous block, or null when the move
 * is a no-op (overlapping/unknown units). The index mirrors the single-tab
 * reorder math: it accounts for dragged tabs currently sitting before the
 * insertion point so the block lands adjacent to the target.
 */
export function planUnpinnedReorder(
  tabs: UnpinnedTabInfo[],
  dragged: SectionUnitRef,
  target: SectionUnitRef,
  position: 'before' | 'after',
): { tabIds: number[]; index: number } | null {
  const byId = new Map(tabs.map((tab) => [tab.tabId, tab] as const));

  const refTabIds = (ref: SectionUnitRef): number[] => {
    if (ref.kind === 'folder') {
      return tabs.filter((tab) => tab.groupId === ref.groupId).map((t) => t.tabId);
    }
    if (ref.kind === 'tab') {
      return byId.has(ref.tabId) ? [ref.tabId] : [];
    }
    return [];
  };

  const draggedIds = refTabIds(dragged);
  const targetIds = refTabIds(target);
  if (draggedIds.length === 0 || targetIds.length === 0) return null;

  const draggedSet = new Set(draggedIds);
  if (targetIds.some((id) => draggedSet.has(id))) return null;

  const targetIndices = targetIds.map((id) => byId.get(id)!.index);
  const desired =
    position === 'after'
      ? Math.max(...targetIndices) + 1
      : Math.min(...targetIndices);
  const draggedBefore = draggedIds.filter(
    (id) => byId.get(id)!.index < desired,
  ).length;

  const orderedDragged = [...draggedIds].sort(
    (a, b) => byId.get(a)!.index - byId.get(b)!.index,
  );
  return { tabIds: orderedDragged, index: Math.max(0, desired - draggedBefore) };
}

/** Remove a group definition only; member pins/tabs become loose. */
export function removeGroup(
  state: StoredStateV7,
  groupId: string,
): StoredStateV7 {
  const entry = findGroupEntry(state, groupId);
  if (!entry) return state;

  const withoutGroup = updateSpace(state, entry.space.id, (space) => ({
    ...space,
    groups: (space.groups ?? []).filter((group) => group.id !== groupId),
    homePins: space.homePins.map((pin) =>
      pin.groupId === groupId ? { ...pin, groupId: null } : pin,
    ),
  }));

  const tabGroupMembership: Record<string, string> = {};
  for (const [tabId, gid] of Object.entries(
    withoutGroup.tabGroupMembership ?? {},
  )) {
    if (gid !== groupId) tabGroupMembership[tabId] = gid;
  }

  return { ...withoutGroup, tabGroupMembership };
}

/** Assign a live tab to an unpinned group. */
export function setTabGroup(
  state: StoredStateV7,
  tabId: number,
  groupId: string,
): StoredStateV7 {
  return {
    ...state,
    tabGroupMembership: {
      ...(state.tabGroupMembership ?? {}),
      [tabKey(tabId)]: groupId,
    },
  };
}

/** Drop a live tab's unpinned-group membership. */
export function removeTabFromGroup(
  state: StoredStateV7,
  tabId: number,
): StoredStateV7 {
  const current = state.tabGroupMembership ?? {};
  if (!(tabKey(tabId) in current)) return state;

  const tabGroupMembership = { ...current };
  delete tabGroupMembership[tabKey(tabId)];
  return { ...state, tabGroupMembership };
}

/** Set or clear a home pin's pinned-group membership. */
export function setHomePinGroup(
  state: StoredStateV7,
  homePinId: string,
  groupId: string | null,
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  return updateHomePin(state, homePinId, { groupId }, spaceId);
}

/**
 * Add a home pin to a pinned folder, placing it at the end of the folder's
 * existing members so the folder keeps its position in the section instead of
 * jumping to wherever the pin happened to be.
 */
export function addHomePinToGroup(
  state: StoredStateV7,
  homePinId: string,
  groupId: string,
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  const withGroup = setHomePinGroup(state, homePinId, groupId, spaceId);
  const space = withGroup.spaces.find((candidate) => candidate.id === spaceId);
  if (!space) return withGroup;

  const otherMembers = space.homePins
    .filter((pin) => pin.groupId === groupId && pin.id !== homePinId)
    .sort((a, b) => a.order - b.order);
  if (otherMembers.length === 0) return withGroup;

  return moveHomePinRelativeTo(
    withGroup,
    homePinId,
    otherMembers[otherMembers.length - 1].id,
    'after',
    spaceId,
  );
}

/**
 * Convert a pinned group back into an unpinned group of its currently-open
 * tabs. Open member pins become loose live tabs in the group (membership +
 * preserved alias); closed pins are dropped. The group is left empty when no
 * member was open — {@link normalizeState} then prunes it.
 */
export function unpinGroup(
  state: StoredStateV7,
  groupId: string,
): StoredStateV7 {
  const entry = findGroupEntry(state, groupId);
  if (!entry || !entry.group.pinned) return state;

  const space = entry.space;
  const memberPins = space.homePins.filter((pin) => pin.groupId === groupId);

  const tabSpaces = { ...state.tabSpaces };
  const tabGroupMembership = { ...(state.tabGroupMembership ?? {}) };
  const tabAliases = { ...state.tabAliases };

  for (const pin of memberPins) {
    if (typeof pin.tabId !== 'number') continue; // closed pins are dropped
    const key = tabKey(pin.tabId);
    tabSpaces[key] = space.id;
    tabGroupMembership[key] = groupId;
    if (pin.alias) tabAliases[key] = pin.alias;
  }

  const spaces = state.spaces.map((candidate) =>
    candidate.id !== space.id
      ? candidate
      : {
          ...candidate,
          groups: (candidate.groups ?? []).map((group) =>
            group.id === groupId ? { ...group, pinned: false } : group,
          ),
          homePins: candidate.homePins.filter(
            (pin) => pin.groupId !== groupId,
          ),
        },
  );

  return { ...state, spaces, tabSpaces, tabGroupMembership, tabAliases };
}

/**
 * Demote a single open home pin to a loose live tab in its space: the live tab
 * is kept (carrying the pin's alias) and the home pin record is dropped. A
 * no-op for a closed pin (no live tab to keep) or an unknown pin. Used when an
 * open home pin is moved into an unpinned (live-tab) folder.
 */
export function demoteHomePinToTab(
  state: StoredStateV7,
  homePinId: string,
  spaceId = getActiveSpaceId(state),
): StoredStateV7 {
  const space = state.spaces.find((candidate) => candidate.id === spaceId);
  const pin = space?.homePins.find((candidate) => candidate.id === homePinId);
  if (!space || !pin || typeof pin.tabId !== 'number') return state;

  const key = tabKey(pin.tabId);
  const tabAliases = { ...state.tabAliases };
  if (pin.alias) tabAliases[key] = pin.alias;

  return {
    ...state,
    tabAliases,
    tabSpaces: { ...state.tabSpaces, [key]: space.id },
    spaces: state.spaces.map((candidate) =>
      candidate.id === space.id
        ? {
            ...candidate,
            homePins: candidate.homePins.filter((p) => p.id !== homePinId),
          }
        : candidate,
    ),
  };
}

export function pruneTabGroupMembershipForTabs(
  state: StoredStateV7,
  liveTabIds: Set<number>,
): StoredStateV7 {
  const current = state.tabGroupMembership ?? {};
  const tabGroupMembership: Record<string, string> = {};

  for (const [tabId, groupId] of Object.entries(current)) {
    if (liveTabIds.has(Number(tabId))) {
      tabGroupMembership[tabId] = groupId;
    }
  }

  if (Object.keys(tabGroupMembership).length === Object.keys(current).length) {
    return state;
  }

  return { ...state, tabGroupMembership };
}

/**
 * Re-key every id-keyed binding from `oldTabId` to `newTabId`. Chrome's Memory
 * Saver discards a background tab by replacing it with a fresh id (surfaced via
 * `chrome.tabs.onReplaced`); without re-keying, the next reconcile prunes the
 * stale id and re-parks the replacement as a loose tab in the active space —
 * dropping it (and any home-pin binding) out of its real space. Migrating here
 * keeps the tab, its space, its pin binding, its folder membership, and its
 * alias intact across the discard.
 *
 * Returns the same reference when `oldTabId` isn't referenced, so callers can
 * cheaply skip persisting.
 */
export function migrateTabId(
  state: StoredStateV7,
  oldTabId: number,
  newTabId: number,
): StoredStateV7 {
  if (oldTabId === newTabId) return state;

  const oldKey = tabKey(oldTabId);
  const newKey = tabKey(newTabId);

  let changed = false;

  const tabSpaces = { ...state.tabSpaces };
  if (oldKey in tabSpaces) {
    tabSpaces[newKey] = tabSpaces[oldKey];
    delete tabSpaces[oldKey];
    changed = true;
  }

  const tabAliases = { ...state.tabAliases };
  if (oldKey in tabAliases) {
    tabAliases[newKey] = tabAliases[oldKey];
    delete tabAliases[oldKey];
    changed = true;
  }

  const tabGroupMembership = { ...(state.tabGroupMembership ?? {}) };
  if (oldKey in tabGroupMembership) {
    tabGroupMembership[newKey] = tabGroupMembership[oldKey];
    delete tabGroupMembership[oldKey];
    changed = true;
  }

  const lastActiveTabBySpace = { ...state.lastActiveTabBySpace };
  for (const [key, tabId] of Object.entries(lastActiveTabBySpace)) {
    if (tabId === oldTabId) {
      lastActiveTabBySpace[key] = newTabId;
      changed = true;
    }
  }

  const spaces = state.spaces.map((space) => {
    let spaceChanged = false;
    const homePins = space.homePins.map((pin) => {
      if (pin.tabId !== oldTabId) return pin;
      spaceChanged = true;
      return { ...pin, tabId: newTabId };
    });
    return spaceChanged ? { ...space, homePins } : space;
  });
  if (spaces.some((space, index) => space !== state.spaces[index])) {
    changed = true;
  }

  if (!changed) return state;

  return {
    ...state,
    tabSpaces,
    tabAliases,
    tabGroupMembership,
    lastActiveTabBySpace,
    spaces,
  };
}

export function reconcileStateForTabs(
  state: StoredStateV7,
  liveTabs: chrome.tabs.Tab[],
): StoredStateV7 {
  const liveTabIds = new Set(
    liveTabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number'),
  );

  const prunedState = pruneTabGroupMembershipForTabs(
    pruneTabSpacesForTabs(
      pruneLastActiveTabsForTabs(
        pruneAliasesForTabs(state, liveTabIds),
        liveTabIds,
      ),
      liveTabIds,
    ),
    liveTabIds,
  );

  return updateHomePinsFromTabs(
    assignTabsToActiveSpaces(prunedState, liveTabs),
    liveTabs,
  );
}

export function statesEqual(
  left: StoredStateV7,
  right: StoredStateV7,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
