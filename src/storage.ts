import {
  DEFAULT_SPACE_ID,
  STORAGE_VERSION,
  type HomePin,
  type Space,
  type StoredStateV6,
} from './types';
import { iconForSpaceIndex, normalizeSpaceIcon } from './spaceIcons';
import { isAtHome } from './lib/url';

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
    lastActiveTabBySpace: {},
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
    lastActiveTabBySpace: {},
    tabAliases: state.tabAliases,
    tabSpaces: {},
  };
}

function migrateV4State(state: LegacyStoredStateV4): StoredStateV6 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: state.activeSpaceByWindowId,
    spaces: state.spaces.map(normalizeSpace),
    lastActiveTabBySpace: {},
    tabAliases: state.tabAliases,
    tabSpaces: {},
  };
}

function migrateV5State(state: LegacyStoredStateV5): StoredStateV6 {
  return {
    version: STORAGE_VERSION,
    activeSpaceByWindowId: state.activeSpaceByWindowId,
    spaces: state.spaces.map(normalizeSpace),
    lastActiveTabBySpace: {},
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
  const lastActiveTabBySpace: Record<string, number> = {};

  for (const [key, tabId] of Object.entries(
    state.lastActiveTabBySpace ?? {},
  )) {
    const spaceId = spaceIdFromActiveTabSpaceKey(key);
    if (spaceId && spaceIds.has(spaceId) && typeof tabId === 'number') {
      lastActiveTabBySpace[key] = tabId;
    }
  }

  return {
    ...state,
    activeSpaceByWindowId,
    lastActiveTabBySpace,
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

export function moveHomePinToSpace(
  state: StoredStateV6,
  id: string,
  targetSpaceId: string,
): StoredStateV6 {
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

export function pruneLastActiveTabsForTabs(
  state: StoredStateV6,
  liveTabIds: Set<number>,
): StoredStateV6 {
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
  state: StoredStateV6,
  windowId: number | null | undefined,
  spaceId: string,
  tabId: number,
): StoredStateV6 {
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
  state: StoredStateV6,
  windowId: number | null | undefined,
  spaceId: string,
): number | null {
  return (
    state.lastActiveTabBySpace[activeTabSpaceKey(windowId, spaceId)] ?? null
  );
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
  state: StoredStateV6,
  liveTabs: chrome.tabs.Tab[],
): StoredStateV6 {
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
    pruneLastActiveTabsForTabs(
      pruneAliasesForTabs(state, liveTabIds),
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
  left: StoredStateV6,
  right: StoredStateV6,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
