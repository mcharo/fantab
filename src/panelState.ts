import type {
  ActiveMedia,
  FantabGroup,
  HomePin,
  PanelGroup,
  PanelState,
  PanelTab,
  StoredStateV7,
} from './types';
import { isAtHome } from './lib/url';
import { getActiveSpace } from './storage';

export interface BuildPanelStateInput {
  tabs: chrome.tabs.Tab[];
  state: StoredStateV7;
  windowId: number | null;
  /** Extension placeholder page URL; matching tabs are hidden from the panel. */
  blankUrl?: string;
  /** Tab ids the content script has reported as currently playing video. */
  playingVideoTabIds?: ReadonlySet<number>;
  /** The media source the player bar controls, resolved by the background. */
  activeMedia?: ActiveMedia | null;
}

function tabId(tab: chrome.tabs.Tab): number {
  return tab.id ?? -1;
}

function tabUrl(tab: chrome.tabs.Tab): string {
  return tab.url ?? tab.pendingUrl ?? '';
}

function tabTitle(tab: chrome.tabs.Tab): string {
  return tab.title ?? (tabUrl(tab) || 'Untitled');
}

function tabFavicon(tab: chrome.tabs.Tab): string {
  return tab.favIconUrl ?? '';
}

function createOpenPanelTab(
  tab: chrome.tabs.Tab,
  state: StoredStateV7,
  homePin: HomePin | undefined,
  playingVideoTabIds: ReadonlySet<number>,
): PanelTab {
  const id = tabId(tab);
  const url = tabUrl(tab);
  const title = tabTitle(tab);
  const alias = homePin?.alias ?? state.tabAliases[String(id)] ?? null;
  const atHome = homePin ? isAtHome(url, homePin.homeUrl) : false;
  const displayName = alias ?? title;
  const groupId = homePin
    ? homePin.groupId ?? null
    : state.tabGroupMembership?.[String(id)] ?? null;

  return {
    key: homePin ? `home:${homePin.id}` : `tab:${id}`,
    tabId: id,
    homePinId: homePin?.id ?? null,
    windowId: tab.windowId ?? null,
    index: tab.index ?? 0,
    order: homePin ? homePin.order : tab.index ?? 0,
    groupId,
    url,
    homeUrl: homePin?.homeUrl ?? null,
    title,
    faviconUrl: homePin?.faviconUrl || tabFavicon(tab),
    alias,
    displayName,
    pageTitle: title,
    isActive: !!tab.active,
    isAudible: !!tab.audible,
    isMuted: !!tab.mutedInfo?.muted,
    isPlayingVideo: playingVideoTabIds.has(id),
    isNativePinned: !!tab.pinned,
    isHomePin: !!homePin,
    isOpen: true,
    atHome,
    status: tab.status ?? null,
    lastAccessed: tab.lastAccessed ?? 0,
  };
}

function createClosedHomePinPanelTab(homePin: HomePin): PanelTab {
  return {
    key: `home:${homePin.id}`,
    tabId: null,
    homePinId: homePin.id,
    windowId: null,
    index: homePin.order,
    order: homePin.order,
    groupId: homePin.groupId ?? null,
    url: homePin.lastKnownUrl ?? homePin.homeUrl,
    homeUrl: homePin.homeUrl,
    title: homePin.lastKnownTitle ?? homePin.alias,
    faviconUrl: homePin.faviconUrl,
    alias: homePin.alias,
    displayName: homePin.alias,
    pageTitle: homePin.lastKnownTitle ?? '',
    isActive: false,
    isAudible: false,
    isMuted: false,
    isPlayingVideo: false,
    isNativePinned: false,
    isHomePin: true,
    isOpen: false,
    atHome: false,
    status: null,
    lastAccessed: 0,
  };
}

export function buildPanelState({
  tabs,
  state,
  windowId,
  blankUrl,
  playingVideoTabIds = new Set<number>(),
  activeMedia = null,
}: BuildPanelStateInput): PanelState {
  const activeSpace = getActiveSpace(state, windowId);
  const isPlaceholder = (tab: chrome.tabs.Tab) =>
    !!blankUrl && tabUrl(tab).startsWith(blankUrl);
  const currentWindowTabs = windowId
    ? tabs.filter((tab) => tab.windowId === windowId)
    : tabs;
  const homePinsByTabId = new Map(
    activeSpace.homePins
      .filter((pin) => pin.tabId !== null)
      .map((pin) => [pin.tabId, pin] as const),
  );
  const openHomePinIds = new Set<string>();
  const panelTabs: PanelTab[] = [];
  const homePinTabs: PanelTab[] = [];

  for (const tab of currentWindowTabs) {
    const id = tab.id;
    if (typeof id !== 'number') continue;
    if (isPlaceholder(tab)) continue;

    const homePin = homePinsByTabId.get(id);
    if (!homePin && state.tabSpaces[String(id)] !== activeSpace.id) continue;

    const panelTab = createOpenPanelTab(tab, state, homePin, playingVideoTabIds);

    if (homePin) {
      openHomePinIds.add(homePin.id);
      homePinTabs.push(panelTab);
    } else {
      panelTabs.push(panelTab);
    }
  }

  const closedHomePins = activeSpace.homePins
    .filter((pin) => !openHomePinIds.has(pin.id))
    .map(createClosedHomePinPanelTab);

  const allHomePins = [...homePinTabs, ...closedHomePins].sort(
    (a, b) =>
      homePinOrder(activeSpace.homePins, a) -
      homePinOrder(activeSpace.homePins, b),
  );

  const spaceGroups = activeSpace.groups ?? [];
  const pinnedGroupById = new Map<string, FantabGroup>();
  const unpinnedGroupById = new Map<string, FantabGroup>();
  for (const group of spaceGroups) {
    (group.pinned ? pinnedGroupById : unpinnedGroupById).set(group.id, group);
  }

  // Partition home pins into pinned-group members vs. loose pins.
  const pinsByGroupId = new Map<string, PanelTab[]>();
  const homePins: PanelTab[] = [];
  for (const pin of allHomePins) {
    if (pin.groupId && pinnedGroupById.has(pin.groupId)) {
      const list = pinsByGroupId.get(pin.groupId) ?? [];
      list.push(pin);
      pinsByGroupId.set(pin.groupId, list);
    } else {
      homePins.push(pin);
    }
  }

  // Partition live tabs into unpinned-group members vs. loose tabs.
  const tabsByGroupId = new Map<string, PanelTab[]>();
  const ungroupedTabs: PanelTab[] = [];
  for (const panelTab of panelTabs.sort((a, b) => a.index - b.index)) {
    if (panelTab.groupId && unpinnedGroupById.has(panelTab.groupId)) {
      const list = tabsByGroupId.get(panelTab.groupId) ?? [];
      list.push(panelTab);
      tabsByGroupId.set(panelTab.groupId, list);
    } else {
      ungroupedTabs.push(panelTab);
    }
  }

  const sortedGroups = [...spaceGroups].sort((a, b) => a.order - b.order);

  // Pinned groups persist even when every member pin is closed.
  const pinnedGroups: PanelGroup[] = sortedGroups
    .filter((group) => group.pinned)
    .map((group) => toPanelGroup(group, pinsByGroupId.get(group.id) ?? []))
    .filter((group) => group.tabs.length > 0);

  // Unpinned groups are ephemeral — only shown while they hold open tabs.
  const unpinnedGroups: PanelGroup[] = sortedGroups
    .filter((group) => !group.pinned)
    .map((group) => toPanelGroup(group, tabsByGroupId.get(group.id) ?? []))
    .filter((group) => group.tabs.length > 0);

  const activeTab = currentWindowTabs.find((tab) => tab.active);

  return {
    windowId,
    activeTabId:
      activeTab && !isPlaceholder(activeTab) ? activeTab.id ?? null : null,
    activeSpaceId: activeSpace.id,
    spaces: state.spaces
      .map((space) => ({
        id: space.id,
        name: space.name,
        icon: space.icon,
        order: space.order,
      }))
      .sort((a, b) => a.order - b.order),
    homePins,
    pinnedGroups,
    unpinnedGroups,
    ungroupedTabs,
    activeMedia,
  };
}

function toPanelGroup(group: FantabGroup, tabs: PanelTab[]): PanelGroup {
  const members = group.pinned
    ? [...tabs].sort((a, b) => a.order - b.order)
    : [...tabs].sort((a, b) => a.index - b.index);
  // The block slots among loose rows at its earliest member; an empty folder
  // falls back to its stored order.
  const anchor = members.length
    ? Math.min(...members.map((tab) => tab.order))
    : group.order;
  return {
    id: group.id,
    title: group.title?.trim() || 'Untitled Folder',
    collapsed: group.collapsed,
    peek: !!group.peek,
    pinned: group.pinned,
    order: anchor,
    tabs: members,
  };
}

function homePinOrder(homePins: HomePin[], panelTab: PanelTab): number {
  if (!panelTab.homePinId) return Number.MAX_SAFE_INTEGER;
  return (
    homePins.find((pin) => pin.id === panelTab.homePinId)?.order ??
    Number.MAX_SAFE_INTEGER
  );
}

export interface CloseFocusTab {
  id: number;
  index: number;
  windowId: number | null;
  active: boolean;
  inActiveSpace: boolean;
  /** `chrome.tabs.Tab.lastAccessed` (ms since epoch); 0 if never activated. */
  lastAccessed: number;
}

/**
 * When the active tab is among those being closed, pick the tab that should
 * receive focus so we stay within the active space instead of letting Chrome
 * jump to an adjacent tab from another space. Prefers the most recently active
 * tab in the space (the one the user was last on); when there's no activation
 * history, falls back to tab-strip proximity. Returns null when no explicit
 * activation is needed (the active tab isn't closing, or there's no same-space
 * tab left to focus).
 */
export function nextFocusTabIdAfterClose(
  tabs: CloseFocusTab[],
  closingTabIds: Set<number>,
  windowId: number | null,
): number | null {
  const inWindow = (tab: CloseFocusTab) =>
    windowId === null || tab.windowId === windowId;

  const activeTab = tabs.find((tab) => tab.active && inWindow(tab));
  if (!activeTab || !closingTabIds.has(activeTab.id)) return null;

  const candidates = tabs.filter(
    (tab) => inWindow(tab) && tab.inActiveSpace && !closingTabIds.has(tab.id),
  );

  if (candidates.length === 0) return null;

  // Prefer the most recently active tab in the space.
  const mostRecent = candidates.reduce((best, tab) =>
    tab.lastAccessed > best.lastAccessed ? tab : best,
  );
  if (mostRecent.lastAccessed > 0) return mostRecent.id;

  // No activation history: fall back to the nearest tab after the one being
  // closed, else the nearest before.
  const byIndex = [...candidates].sort((a, b) => a.index - b.index);
  return (
    byIndex.find((tab) => tab.index > activeTab.index)?.id ??
    byIndex[byIndex.length - 1].id
  );
}

export function tabMatchesQuery(
  tab: PanelTab,
  query: string,
  groupTitle = '',
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [tab.displayName, tab.title, tab.url, groupTitle]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}
