import {
  DEFAULT_SPACE_ID,
  STORAGE_VERSION,
  type HomePin,
  type Space,
  type StoredStateV6,
} from './types';
import { iconForSpaceIndex, normalizeSpaceIcon } from './spaceIcons';

export const STORAGE_KEY = 'fantab_state';

const DEFAULT_WINDOW_KEY = 'default';

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

export function createDefaultSpace(): Space {
  return {
    id: DEFAULT_SPACE_ID,
    name: 'Default',
    icon: iconForSpaceIndex(0),
    homePins: [],
    createdAt: Date.now(),
    order: 0,
  };
}

export function createDefaultState(): StoredStateV6 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: {
      [DEFAULT_WINDOW_KEY]: DEFAULT_SPACE_ID,
    },
    spaces: [createDefaultSpace()],
    tabAliases: {},
    tabSpaces: {},
  };
}

export const DEFAULT_STATE: StoredStateV6 = createDefaultState();

export function windowKey(windowId: number | null | undefined): string {
  return typeof windowId === 'number' ? String(windowId) : DEFAULT_WINDOW_KEY;
}

function tabKey(tabId: number): string {
  return String(tabId);
}

export function isStoredStateV6(value: unknown): value is StoredStateV6 {
  if (!value || typeof value !== 'object') return false;

  const state = value as Partial<StoredStateV6>;
  return (
    state.version === STORAGE_VERSION &&
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

function normalizeSpace(space: LegacySpace, index: number): Space {
  return {
    ...space,
    icon:
      typeof space.icon === 'string'
        ? normalizeSpaceIcon(space.icon)
        : iconForSpaceIndex(index),
  };
}

function migrateV3State(state: LegacyStoredStateV3): StoredStateV6 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: {
      [DEFAULT_WINDOW_KEY]: state.activeSpaceId,
    },
    spaces: state.spaces.map(normalizeSpace),
    tabAliases: state.tabAliases,
    tabSpaces: {},
  };
}

function migrateV4State(state: LegacyStoredStateV4): StoredStateV6 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: state.activeSpaceByWindowId,
    spaces: state.spaces.map(normalizeSpace),
    tabAliases: state.tabAliases,
    tabSpaces: {},
  };
}

function migrateV5State(state: LegacyStoredStateV5): StoredStateV6 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: state.activeSpaceByWindowId,
    spaces: state.spaces.map(normalizeSpace),
    tabAliases: state.tabAliases,
    tabSpaces: {},
  };
}

export function normalizeState(state: StoredStateV6): StoredStateV6 {
  const spaces = [...state.spaces].sort((a, b) => a.order - b.order);
  const spaceIds = new Set(spaces.map((space) => space.id));
  const activeSpaceByWindowId: Record<string, string> = {};

  for (const [key, spaceId] of Object.entries(state.activeSpaceByWindowId)) {
    if (spaceIds.has(spaceId)) {
      activeSpaceByWindowId[key] = spaceId;
    }
  }

  if (!spaceIds.has(activeSpaceByWindowId[DEFAULT_WINDOW_KEY])) {
    activeSpaceByWindowId[DEFAULT_WINDOW_KEY] = spaces[0].id;
  }

  const tabSpaces = Object.fromEntries(
    Object.entries(state.tabSpaces).filter(([, spaceId]) =>
      spaceIds.has(spaceId),
    ),
  );

  return {
    ...state,
    activeSpaceByWindowId,
    tabSpaces,
    spaces: spaces.map((space, index) => ({
      ...space,
      icon: normalizeSpaceIcon(space.icon),
      order: index,
      homePins: [...space.homePins]
        .sort((a, b) => a.order - b.order)
        .map((pin, pinIndex) => ({ ...pin, order: pinIndex })),
    })),
  };
}

export async function loadState(): Promise<StoredStateV6> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY];

  if (isStoredStateV6(state)) return normalizeState(state);
  if (isLegacyStoredStateV5(state)) return normalizeState(migrateV5State(state));
  if (isLegacyStoredStateV4(state)) return normalizeState(migrateV4State(state));
  if (isLegacyStoredStateV3(state)) return normalizeState(migrateV3State(state));

  return createDefaultState();
}

export async function saveState(state: StoredStateV6): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeState(state) });
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function getActiveSpaceId(
  state: StoredStateV6,
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
  state: StoredStateV6,
  windowId?: number | null,
): Space {
  const activeSpaceId = getActiveSpaceId(state, windowId);
  return (
    state.spaces.find((space) => space.id === activeSpaceId) ??
    state.spaces[0]
  );
}

function updateSpace(
  state: StoredStateV6,
  spaceId: string,
  updater: (space: Space) => Space,
): StoredStateV6 {
  return {
    ...state,
    spaces: state.spaces.map((space) =>
      space.id === spaceId ? updater(space) : space,
    ),
  };
}

export function findHomePinById(
  state: StoredStateV6,
  id: string,
  spaceId = getActiveSpaceId(state),
): HomePin | undefined {
  return state.spaces
    .find((space) => space.id === spaceId)
    ?.homePins.find((pin) => pin.id === id);
}

export function findHomePinByTabId(
  state: StoredStateV6,
  tabId: number,
  spaceId = getActiveSpaceId(state),
): HomePin | undefined {
  return state.spaces
    .find((space) => space.id === spaceId)
    ?.homePins.find((pin) => pin.tabId === tabId);
}

export function updateHomePin(
  state: StoredStateV6,
  id: string,
  updates: Partial<HomePin>,
  spaceId = getActiveSpaceId(state),
): StoredStateV6 {
  return updateSpace(state, spaceId, (space) => ({
    ...space,
    homePins: space.homePins.map((pin) =>
      pin.id === id ? { ...pin, ...updates } : pin,
    ),
  }));
}

export function addHomePin(
  state: StoredStateV6,
  homePin: HomePin,
  spaceId = getActiveSpaceId(state),
): StoredStateV6 {
  return updateSpace(state, spaceId, (space) => ({
    ...space,
    homePins: [...space.homePins, homePin],
  }));
}

export function removeHomePin(
  state: StoredStateV6,
  id: string,
  spaceId = getActiveSpaceId(state),
): StoredStateV6 {
  return updateSpace(state, spaceId, (space) => ({
    ...space,
    homePins: space.homePins.filter((pin) => pin.id !== id),
  }));
}

export function moveHomePin(
  state: StoredStateV6,
  id: string,
  toIndex: number,
  spaceId = getActiveSpaceId(state),
): StoredStateV6 {
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

export function createSpace(
  state: StoredStateV6,
  name: string,
  windowId?: number | null,
  icon?: unknown,
): StoredStateV6 {
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
  state: StoredStateV6,
  spaceId: string,
  name: string,
): StoredStateV6 {
  const trimmed = name.trim();
  if (!trimmed) return state;

  return updateSpace(state, spaceId, (space) => ({ ...space, name: trimmed }));
}

export function updateSpaceDetails(
  state: StoredStateV6,
  spaceId: string,
  updates: { name?: string; icon?: unknown },
): StoredStateV6 {
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
  state: StoredStateV6,
  spaceId: string,
  windowId?: number | null,
): StoredStateV6 {
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
  state: StoredStateV6,
  spaceId: string,
): StoredStateV6 {
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

  return { ...state, activeSpaceByWindowId, spaces, tabSpaces };
}

export function renameTabAlias(
  state: StoredStateV6,
  tabId: number,
  alias: string,
): StoredStateV6 {
  const tabAliases = { ...state.tabAliases };
  const trimmed = alias.trim();

  if (trimmed) tabAliases[String(tabId)] = trimmed;
  else delete tabAliases[String(tabId)];

  return { ...state, tabAliases };
}

export function removeTabAlias(
  state: StoredStateV6,
  tabId: number,
): StoredStateV6 {
  const tabAliases = { ...state.tabAliases };
  delete tabAliases[String(tabId)];
  return { ...state, tabAliases };
}

export function pruneAliasesForTabs(
  state: StoredStateV6,
  liveTabIds: Set<number>,
): StoredStateV6 {
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
  state: StoredStateV6,
  liveTabIds: Set<number>,
): StoredStateV6 {
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

export function assignTabToSpace(
  state: StoredStateV6,
  tabId: number,
  spaceId: string,
): StoredStateV6 {
  if (!state.spaces.some((space) => space.id === spaceId)) return state;
  if (state.tabSpaces[tabKey(tabId)] === spaceId) return state;

  return {
    ...state,
    tabSpaces: {
      ...state.tabSpaces,
      [tabKey(tabId)]: spaceId,
    },
  };
}

export function assignTabsToActiveSpaces(
  state: StoredStateV6,
  liveTabs: chrome.tabs.Tab[],
): StoredStateV6 {
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
  state: StoredStateV6,
  liveTabs: chrome.tabs.Tab[],
): StoredStateV6 {
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

export function reconcileStateForTabs(
  state: StoredStateV6,
  liveTabs: chrome.tabs.Tab[],
): StoredStateV6 {
  const liveTabIds = new Set(
    liveTabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number'),
  );

  const prunedState = pruneTabSpacesForTabs(
    pruneAliasesForTabs(state, liveTabIds),
    liveTabIds,
  );

  return updateHomePinsFromTabs(
    assignTabsToActiveSpaces(prunedState, liveTabs),
    liveTabs,
  );
}

export function statesEqual(
  left: StoredStateV6,
  right: StoredStateV6,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
