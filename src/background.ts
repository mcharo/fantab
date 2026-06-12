import type {
  ContentRequestMessage,
  LinkRoutingPolicy,
  Message,
  OpenExternalLinkFromHomePinResponse,
  RequestMessage,
} from './messaging';
import { isAtHome, isSameSiteAsHomeUrl, normalizeHomeUrl } from './lib/url';
import {
  buildPanelState,
  nextFocusTabIdAfterClose,
  UNGROUPED_GROUP_ID,
  type CloseFocusTab,
} from './panelState';
import type {
  HomePin,
  PanelState,
  PanelTab,
  Space,
  StoredStateV6,
  TabGroupColor,
} from './types';
import {
  addHomePin,
  assignTabToSpace,
  createSpace,
  deleteSpace,
  findHomePinById,
  findHomePinByTabId,
  getActiveSpace,
  generateId,
  loadState,
  moveHomePin,
  reconcileStateForTabs,
  removeHomePin,
  removeTabAlias,
  renameSpace,
  renameTabAlias,
  saveState,
  statesEqual,
  switchSpace,
  updateHomePin,
  updateSpaceDetails,
} from './storage';

const DEFAULT_GROUP_TITLE = 'New Group';
const DEFAULT_GROUP_COLOR = 'blue';
const COPY_CURRENT_URL_COMMAND = 'copy-current-url';
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const BLANK_PAGE_PATH = 'blank.html';
const REQUEST_ACTIONS = new Set<RequestMessage['action']>([
  'GET_PANEL_STATE',
  'CREATE_TAB',
  'ACTIVATE_TAB',
  'CLOSE_TAB',
  'MOVE_TAB',
  'CREATE_HOME_PIN',
  'REMOVE_HOME_PIN',
  'EDIT_HOME_PIN_URL',
  'RENAME_TAB_ALIAS',
  'GO_HOME',
  'REOPEN_HOME_PIN',
  'MOVE_HOME_PIN',
  'SWITCH_SPACE',
  'CREATE_SPACE',
  'RENAME_SPACE',
  'UPDATE_SPACE',
  'DELETE_SPACE',
  'CREATE_GROUP_FROM_TAB',
  'MOVE_TAB_TO_GROUP',
  'UNGROUP_TAB',
  'UPDATE_GROUP',
  'CLOSE_GROUP',
]);
const CONTENT_REQUEST_ACTIONS = new Set<ContentRequestMessage['action']>([
  'GET_LINK_ROUTING_POLICY',
  'OPEN_EXTERNAL_LINK_FROM_HOME_PIN',
]);
const EMPTY_LINK_ROUTING_POLICY: LinkRoutingPolicy = {
  isHomePin: false,
  homeUrl: null,
};
let creatingOffscreenDocument: Promise<void> | null = null;

interface CopyToClipboardResponse {
  copied: boolean;
  error?: string;
}

function isRequestMessage(message: Message): message is RequestMessage {
  return REQUEST_ACTIONS.has(message.action as RequestMessage['action']);
}

function isContentRequestMessage(
  message: Message,
): message is ContentRequestMessage {
  return CONTENT_REQUEST_ACTIONS.has(
    message.action as ContentRequestMessage['action'],
  );
}

async function getCurrentWindowId(): Promise<number | null> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (typeof activeTab?.windowId === 'number') return activeTab.windowId;

  const [firstTab] = await chrome.tabs.query({ currentWindow: true });
  return typeof firstTab?.windowId === 'number' ? firstTab.windowId : null;
}

async function loadReconciledState(
  liveTabs: chrome.tabs.Tab[],
): Promise<StoredStateV6> {
  const state = await loadState();
  const reconciled = reconcileStateForTabs(state, liveTabs);

  if (!statesEqual(state, reconciled)) {
    await saveState(reconciled);
  }

  return reconciled;
}

async function resolveWindowId(
  windowId: number | null | undefined,
): Promise<number | null> {
  return typeof windowId === 'number' ? windowId : getCurrentWindowId();
}

function placeholderUrl(): string {
  return chrome.runtime.getURL(BLANK_PAGE_PATH);
}

function isPlaceholderTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? tab.pendingUrl ?? '';
  return url.startsWith(placeholderUrl());
}

async function getPanelState(
  requestedWindowId?: number | null,
): Promise<PanelState> {
  const [windowId, allTabs] = await Promise.all([
    resolveWindowId(requestedWindowId),
    chrome.tabs.query({}),
  ]);
  const state = await loadReconciledState(allTabs);
  const groups =
    windowId === null ? [] : await chrome.tabGroups.query({ windowId });

  return buildPanelState({
    tabs: allTabs,
    groups,
    state,
    windowId,
    blankUrl: placeholderUrl(),
  });
}

async function broadcastPanelState(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      action: 'PANEL_STATE_UPDATED',
      payload: {},
    });
  } catch {
    // No open side panel is listening.
  }
}

async function hasOffscreenDocument(): Promise<boolean> {
  if (chrome.offscreen.hasDocument) {
    return chrome.offscreen.hasDocument();
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;

  creatingOffscreenDocument ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Copy the current tab URL from a keyboard shortcut.',
    })
    .finally(() => {
      creatingOffscreenDocument = null;
    });

  await creatingOffscreenDocument;
}

async function copyTextWithOffscreenDocument(text: string): Promise<boolean> {
  await ensureOffscreenDocument();

  const response = (await chrome.runtime.sendMessage({
    action: 'COPY_TO_CLIPBOARD',
    target: 'offscreen',
    payload: { text },
  })) as CopyToClipboardResponse | undefined;

  return response?.copied === true;
}

async function copyTextWithContentScript(
  text: string,
  tabId: number | undefined,
): Promise<boolean> {
  if (typeof tabId !== 'number') return false;

  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      action: 'COPY_TEXT_TO_CLIPBOARD',
      payload: { text },
    })) as CopyToClipboardResponse | undefined;

    return response?.copied === true;
  } catch {
    return false;
  }
}

async function copyTextToClipboard(
  text: string,
  tabId: number | undefined,
): Promise<boolean> {
  try {
    if (await copyTextWithOffscreenDocument(text)) return true;
  } catch {
    // Try the active tab content script below.
  }

  return copyTextWithContentScript(text, tabId);
}

async function getCommandTab(
  tab?: chrome.tabs.Tab,
): Promise<chrome.tabs.Tab | undefined> {
  if (tab?.url || tab?.pendingUrl) return tab;

  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  return activeTab;
}

async function flashActionBadge(
  tabId: number | undefined,
  text: string,
  color: string,
): Promise<void> {
  const details =
    typeof tabId === 'number' ? { text, tabId } : { text };
  const clearDetails =
    typeof tabId === 'number' ? { text: '', tabId } : { text: '' };

  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText(details);

  setTimeout(() => {
    void chrome.action.setBadgeText(clearDetails);
  }, 1200);
}

async function handleCopyCurrentUrlCommand(
  tab?: chrome.tabs.Tab,
): Promise<void> {
  const commandTab = await getCommandTab(tab);
  const url = commandTab?.url ?? commandTab?.pendingUrl ?? null;
  if (!url) return;

  const copied = await copyTextToClipboard(url, commandTab?.id);
  await flashActionBadge(
    commandTab?.id,
    copied ? 'OK' : 'ERR',
    copied ? '#15803d' : '#b91c1c',
  );
}

function getLinkRoutingPolicyForTab(
  state: StoredStateV6,
  tab: chrome.tabs.Tab | undefined,
): LinkRoutingPolicy {
  if (typeof tab?.id !== 'number') return EMPTY_LINK_ROUTING_POLICY;

  const activeSpaceId = getActiveSpace(state, tab.windowId).id;
  const homePin = findHomePinByTabId(state, tab.id, activeSpaceId);

  if (!homePin) return EMPTY_LINK_ROUTING_POLICY;

  return {
    isHomePin: true,
    homeUrl: homePin.homeUrl,
  };
}

async function getStateForLinkRouting(): Promise<StoredStateV6> {
  return loadReconciledState(await chrome.tabs.query({}));
}

async function broadcastLinkRoutingPolicies(
  state?: StoredStateV6,
): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const routingState = state ?? (await loadReconciledState(tabs));

    await Promise.all(
      tabs.map(async (tab) => {
        if (typeof tab.id !== 'number') return;

        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'LINK_ROUTING_POLICY_UPDATED',
            payload: getLinkRoutingPolicyForTab(routingState, tab),
          });
        } catch {
          // The tab may not have a fantab content script, e.g. chrome:// pages.
        }
      }),
    );
  } catch {
    // Best-effort policy refresh; content scripts also request policy on demand.
  }
}

async function saveAndBroadcast(
  state: StoredStateV6,
  windowId?: number | null,
): Promise<PanelState> {
  await saveState(state);
  const panelState = await getPanelState(windowId);

  await broadcastPanelState();
  void broadcastLinkRoutingPolicies(state);

  return panelState;
}

function tabUrl(tab: chrome.tabs.Tab): string {
  return tab.url ?? tab.pendingUrl ?? '';
}

function tabTitle(tab: chrome.tabs.Tab): string {
  return tab.title ?? (tabUrl(tab) || 'Untitled');
}

function createHomePinFromTab(tab: chrome.tabs.Tab, order: number): HomePin {
  return {
    id: generateId(),
    homeUrl: tabUrl(tab),
    alias: tabTitle(tab),
    faviconUrl: tab.favIconUrl ?? '',
    tabId: tab.id ?? null,
    lastKnownUrl: tabUrl(tab),
    lastKnownTitle: tab.title ?? null,
    createdAt: Date.now(),
    order,
  };
}

function visibleOpenPanelTabs(
  panelState: PanelState,
): Array<PanelTab & { tabId: number }> {
  return [
    ...panelState.homePins,
    ...panelState.groups.flatMap((group) =>
      group.collapsed ? [] : group.tabs,
    ),
    ...panelState.ungroupedTabs,
  ].filter(
    (tab): tab is PanelTab & { tabId: number } =>
      tab.isOpen && typeof tab.tabId === 'number',
  );
}

function hasVisibleActiveTab(panelState: PanelState): boolean {
  return visibleOpenPanelTabs(panelState).some(
    (tab) => tab.tabId === panelState.activeTabId,
  );
}

async function activateFirstVisibleTab(panelState: PanelState): Promise<boolean> {
  const firstVisibleTab = visibleOpenPanelTabs(panelState)[0];
  if (!firstVisibleTab) return false;

  await chrome.tabs.update(firstVisibleTab.tabId, { active: true });
  return true;
}

async function createTabInWindow(
  windowId?: number | null,
  url?: string,
): Promise<chrome.tabs.Tab> {
  const createProperties =
    typeof windowId === 'number'
      ? { active: true, url, windowId }
      : { active: true, url };

  const tab = await chrome.tabs.create(createProperties);

  if (typeof tab.id === 'number') {
    try {
      await chrome.tabs.ungroup(tab.id);
    } catch {
      // The tab may already be ungrouped.
    }
  }

  return tab;
}

async function focusVisibleTabInSpace(
  spaceId: string,
  windowId?: number | null,
): Promise<PanelState> {
  let panelState = await getPanelState(windowId);

  if (!hasVisibleActiveTab(panelState)) {
    const activatedExistingTab = await activateFirstVisibleTab(panelState);

    // No tab is open for this space — park on the blank page rather than
    // reopening a closed pin, so switching in is transparent.
    if (!activatedExistingTab) {
      await parkOnPlaceholder(spaceId, windowId);
    }

    panelState = await getPanelState(windowId);
  }

  return panelState;
}

async function handleCreateSpace(
  name: string,
  windowId?: number | null,
  icon?: unknown,
): Promise<PanelState> {
  const resolvedWindowId = await resolveWindowId(windowId);
  const state = createSpace(
    await loadReconciledState(await chrome.tabs.query({})),
    name,
    resolvedWindowId,
    icon,
  );
  await saveState(state);

  const panelState = await focusVisibleTabInSpace(
    getActiveSpace(state, resolvedWindowId).id,
    resolvedWindowId,
  );

  await broadcastPanelState();
  void broadcastLinkRoutingPolicies();

  return panelState;
}

async function handleCreateTab(
  windowId?: number | null,
): Promise<PanelState> {
  const resolvedWindowId = await resolveWindowId(windowId);
  let state = await loadReconciledState(await chrome.tabs.query({}));
  const activeSpaceId = getActiveSpace(state, resolvedWindowId).id;
  const tab = await createTabInWindow(resolvedWindowId);

  if (typeof tab.id === 'number') {
    state = assignTabToSpace(state, tab.id, activeSpaceId);
    await saveState(state);
  }

  return getPanelState(resolvedWindowId);
}

function withTabSpaceAssignment(
  state: StoredStateV6,
  tabId: number | null | undefined,
  spaceId: string,
): StoredStateV6 {
  return typeof tabId === 'number'
    ? assignTabToSpace(state, tabId, spaceId)
    : state;
}

async function handleCreateHomePin(
  tabId: number,
  windowId?: number | null,
): Promise<PanelState> {
  let state = await loadState();
  const activeSpace = getActiveSpace(state, windowId);
  if (findHomePinByTabId(state, tabId, activeSpace.id)) {
    return getPanelState(windowId);
  }

  const tab = await chrome.tabs.get(tabId);
  const nextOrder = activeSpace.homePins.reduce(
    (max, pin) => Math.max(max, pin.order),
    -1,
  ) + 1;

  state = withTabSpaceAssignment(
    removeTabAlias(
      addHomePin(state, createHomePinFromTab(tab, nextOrder), activeSpace.id),
      tabId,
    ),
    tabId,
    activeSpace.id,
  );
  return saveAndBroadcast(state, windowId);
}

async function handleEditHomePinUrl(
  payload: Extract<RequestMessage, { action: 'EDIT_HOME_PIN_URL' }>['payload'],
): Promise<PanelState> {
  const state = await loadState();
  const activeSpaceId = getActiveSpace(state, payload.windowId).id;
  const homeUrl = normalizeHomeUrl(payload.homeUrl);

  if (!homeUrl || !findHomePinById(state, payload.homePinId, activeSpaceId)) {
    return getPanelState(payload.windowId);
  }

  return saveAndBroadcast(
    updateHomePin(state, payload.homePinId, { homeUrl }, activeSpaceId),
    payload.windowId,
  );
}

async function handleRenameTabAlias(
  payload: Extract<RequestMessage, { action: 'RENAME_TAB_ALIAS' }>['payload'],
): Promise<PanelState> {
  let state = await loadState();
  const alias = payload.alias.trim();
  const activeSpaceId = getActiveSpace(state, payload.windowId).id;

  if (payload.homePinId) {
    state = updateHomePin(state, payload.homePinId, { alias }, activeSpaceId);
  } else if (typeof payload.tabId === 'number') {
    state = renameTabAlias(state, payload.tabId, alias);
  }

  return saveAndBroadcast(state, payload.windowId);
}

async function handleGoHome(
  homePinId: string,
  windowId?: number | null,
): Promise<PanelState> {
  const state = await loadState();
  const activeSpaceId = getActiveSpace(state, windowId).id;
  const homePin = findHomePinById(state, homePinId, activeSpaceId);

  if (homePin?.tabId !== null && homePin?.tabId !== undefined) {
    const tab = await chrome.tabs.get(homePin.tabId);

    if (isAtHome(tabUrl(tab), homePin.homeUrl)) {
      await chrome.tabs.reload(homePin.tabId);
    } else {
      await chrome.tabs.update(homePin.tabId, { url: homePin.homeUrl });
    }
  }

  return getPanelState(windowId);
}

async function handleReopenHomePin(
  homePinId: string,
  windowId?: number | null,
): Promise<PanelState> {
  let state = await loadState();
  const activeSpaceId = getActiveSpace(state, windowId).id;
  const homePin = findHomePinById(state, homePinId, activeSpaceId);
  if (!homePin) return getPanelState(windowId);

  const createProperties =
    typeof windowId === 'number'
      ? { active: true, url: homePin.homeUrl, windowId }
      : { active: true, url: homePin.homeUrl };

  const tab = await chrome.tabs.create(createProperties);

  state = withTabSpaceAssignment(
    updateHomePin(
      state,
      homePinId,
      {
        tabId: tab.id ?? null,
        lastKnownUrl: tab.url ?? tab.pendingUrl ?? homePin.homeUrl,
        lastKnownTitle: tab.title ?? homePin.lastKnownTitle,
        faviconUrl: tab.favIconUrl ?? homePin.faviconUrl,
      },
      activeSpaceId,
    ),
    tab.id,
    activeSpaceId,
  );

  return saveAndBroadcast(state, windowId);
}

/**
 * Park the window on the hidden placeholder page so an empty space keeps focus
 * instead of jumping to another space's tab. Reuses an existing placeholder if
 * one is around; otherwise creates one. The placeholder is assigned to the
 * space and hidden from the panel.
 */
async function parkOnPlaceholder(
  spaceId: string,
  windowId?: number | null,
): Promise<void> {
  const tabs = await chrome.tabs.query(
    typeof windowId === 'number' ? { windowId } : {},
  );
  const existing = tabs.find(
    (tab): tab is chrome.tabs.Tab & { id: number } =>
      typeof tab.id === 'number' && isPlaceholderTab(tab),
  );

  const placeholder =
    existing ?? (await createTabInWindow(windowId, placeholderUrl()));
  if (typeof placeholder.id !== 'number') return;

  // A freshly created tab is already active; only reused ones need activating.
  if (existing) {
    await chrome.tabs.update(placeholder.id, { active: true });
  }

  await saveState(assignTabToSpace(await loadState(), placeholder.id, spaceId));
}

/**
 * A placeholder is only valid while it is the active tab of its window. Once
 * focus moves elsewhere (a real tab, another space, or it navigated to a real
 * URL), it is redundant and removed. Loop-safe: it never removes the active tab.
 */
async function cleanupPlaceholders(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const staleIds = tabs
    .filter((tab) => isPlaceholderTab(tab) && !tab.active)
    .map((tab) => tab.id)
    .filter((id): id is number => typeof id === 'number');

  if (staleIds.length > 0) {
    await chrome.tabs.remove(staleIds).catch(() => {
      // Tabs may already be gone.
    });
  }
}

function buildFocusTabs(
  tabs: chrome.tabs.Tab[],
  state: StoredStateV6,
  activeSpace: Space,
): CloseFocusTab[] {
  const homePinTabIds = new Set(
    activeSpace.homePins
      .map((pin) => pin.tabId)
      .filter((id): id is number => typeof id === 'number'),
  );

  return tabs
    .filter(
      (tab): tab is chrome.tabs.Tab & { id: number } =>
        typeof tab.id === 'number' && !isPlaceholderTab(tab),
    )
    .map((tab) => ({
      id: tab.id,
      index: tab.index ?? 0,
      windowId: tab.windowId ?? null,
      active: !!tab.active,
      inActiveSpace:
        homePinTabIds.has(tab.id) ||
        state.tabSpaces[String(tab.id)] === activeSpace.id,
    }));
}

async function preserveSpaceFocusBeforeClosing(
  closingTabIds: Set<number>,
  windowId: number | null,
): Promise<void> {
  const allTabs = await chrome.tabs.query({});
  const state = await loadReconciledState(allTabs);
  const activeSpace = getActiveSpace(state, windowId);
  const focusTabs = buildFocusTabs(allTabs, state, activeSpace);

  const nextTabId = nextFocusTabIdAfterClose(focusTabs, closingTabIds, windowId);
  if (nextTabId !== null) {
    await chrome.tabs.update(nextTabId, { active: true });
    return;
  }

  // No same-space tab to fall back to: if we're closing the active tab, park on
  // the placeholder so we stay in this (now empty) space.
  const activeTab = focusTabs.find(
    (tab) => tab.active && (windowId === null || tab.windowId === windowId),
  );
  if (activeTab && closingTabIds.has(activeTab.id)) {
    await parkOnPlaceholder(activeSpace.id, windowId);
  }
}

/**
 * Correct focus after a native close (Cmd+W, tab-strip ×, middle-click) that we
 * couldn't intercept: if Chrome auto-activated a tab from another space, pull
 * focus back into this window's active space (a same-space tab, else the
 * placeholder).
 */
async function keepFocusInActiveSpace(windowId: number): Promise<void> {
  const allTabs = await chrome.tabs.query({});
  const activeTab = allTabs.find(
    (tab) => tab.active && tab.windowId === windowId,
  );
  if (
    !activeTab ||
    typeof activeTab.id !== 'number' ||
    isPlaceholderTab(activeTab)
  ) {
    return;
  }

  const state = await loadReconciledState(allTabs);
  const activeSpace = getActiveSpace(state, windowId);
  const focusTabs = buildFocusTabs(allTabs, state, activeSpace);

  const activeFocus = focusTabs.find((tab) => tab.id === activeTab.id);
  // Chrome kept us in-space already — nothing to correct.
  if (!activeFocus || activeFocus.inActiveSpace) return;

  const nextTabId = nextFocusTabIdAfterClose(
    focusTabs,
    new Set([activeTab.id]),
    windowId,
  );
  if (nextTabId !== null) {
    await chrome.tabs.update(nextTabId, { active: true });
  } else {
    await parkOnPlaceholder(activeSpace.id, windowId);
  }
}

async function handleCloseTab(
  tabId: number,
  windowId?: number | null,
): Promise<PanelState> {
  const resolvedWindowId = await resolveWindowId(windowId);
  await preserveSpaceFocusBeforeClosing(new Set([tabId]), resolvedWindowId);
  await chrome.tabs.remove(tabId);
  return getPanelState(windowId);
}

async function handleCreateGroupFromTab(
  tabId: number,
  title = DEFAULT_GROUP_TITLE,
  color: TabGroupColor = DEFAULT_GROUP_COLOR,
  windowId?: number | null,
): Promise<PanelState> {
  const groupId = await chrome.tabs.group({ tabIds: tabId });
  await chrome.tabGroups.update(groupId, { title, color });
  return getPanelState(windowId);
}

async function handleMoveTabToGroup(
  tabId: number,
  groupId: number,
  windowId?: number | null,
): Promise<PanelState> {
  if (groupId === UNGROUPED_GROUP_ID) {
    await chrome.tabs.ungroup(tabId);
  } else {
    await chrome.tabs.group({ tabIds: tabId, groupId });
  }

  return getPanelState(windowId);
}

async function handleCloseGroup(
  groupId: number,
  windowId?: number | null,
): Promise<PanelState> {
  const resolvedWindowId = await resolveWindowId(windowId);
  const query =
    resolvedWindowId === null
      ? { groupId }
      : { groupId, windowId: resolvedWindowId };
  const tabs = await chrome.tabs.query(query);
  const tabIds = tabs
    .map((tab) => tab.id)
    .filter((tabId): tabId is number => typeof tabId === 'number');

  if (tabIds.length > 0) {
    await preserveSpaceFocusBeforeClosing(new Set(tabIds), resolvedWindowId);
    await chrome.tabs.remove(tabIds);
  }

  return getPanelState(windowId);
}

async function handleSwitchSpace(
  spaceId: string,
  windowId?: number | null,
): Promise<PanelState> {
  const resolvedWindowId = await resolveWindowId(windowId);
  let state = switchSpace(
    await loadReconciledState(await chrome.tabs.query({})),
    spaceId,
    resolvedWindowId,
  );
  await saveState(state);

  const panelState = await focusVisibleTabInSpace(spaceId, resolvedWindowId);

  await broadcastPanelState();
  void broadcastLinkRoutingPolicies();

  return panelState;
}

async function handleContentMessage(
  message: ContentRequestMessage,
  sender: chrome.runtime.MessageSender,
): Promise<LinkRoutingPolicy | OpenExternalLinkFromHomePinResponse> {
  const sourceTab = sender.tab;

  switch (message.action) {
    case 'GET_LINK_ROUTING_POLICY':
      return getLinkRoutingPolicyForTab(
        await getStateForLinkRouting(),
        sourceTab,
      );
    case 'OPEN_EXTERNAL_LINK_FROM_HOME_PIN':
      return handleOpenExternalLinkFromHomePin(message.payload.url, sourceTab);
  }
}

async function handleOpenExternalLinkFromHomePin(
  rawUrl: string,
  sourceTab: chrome.tabs.Tab | undefined,
): Promise<OpenExternalLinkFromHomePinResponse> {
  if (
    typeof sourceTab?.id !== 'number' ||
    typeof sourceTab.windowId !== 'number'
  ) {
    return { opened: false };
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return { opened: false };
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return { opened: false };
  }

  const state = await getStateForLinkRouting();
  const activeSpaceId = getActiveSpace(state, sourceTab.windowId).id;
  const homePin = findHomePinByTabId(state, sourceTab.id, activeSpaceId);

  if (!homePin || isSameSiteAsHomeUrl(targetUrl.href, homePin.homeUrl)) {
    return { opened: false };
  }

  const createdTab = await chrome.tabs.create({
    active: true,
    index: sourceTab.index + 1,
    openerTabId: sourceTab.id,
    url: targetUrl.href,
    windowId: sourceTab.windowId,
  });

  if (typeof createdTab.id === 'number') {
    try {
      await chrome.tabs.ungroup(createdTab.id);
    } catch {
      // The new tab may already be ungrouped.
    }

    await saveState(assignTabToSpace(state, createdTab.id, activeSpaceId));
  }

  await broadcastPanelState();

  return { opened: true };
}

async function handleMessage(message: RequestMessage): Promise<PanelState> {
  switch (message.action) {
    case 'GET_PANEL_STATE':
      return getPanelState(message.payload.windowId);
    case 'CREATE_TAB':
      return handleCreateTab(message.payload.windowId);
    case 'ACTIVATE_TAB':
      await chrome.tabs.update(message.payload.tabId, { active: true });
      return getPanelState(message.payload.windowId);
    case 'CLOSE_TAB':
      return handleCloseTab(message.payload.tabId, message.payload.windowId);
    case 'MOVE_TAB':
      await chrome.tabs.move(message.payload.tabId, {
        index: message.payload.index,
      });
      return getPanelState(message.payload.windowId);
    case 'CREATE_HOME_PIN':
      return handleCreateHomePin(
        message.payload.tabId,
        message.payload.windowId,
      );
    case 'REMOVE_HOME_PIN':
      {
        const state = await loadState();
        const activeSpaceId = getActiveSpace(state, message.payload.windowId).id;

        return saveAndBroadcast(
          removeHomePin(state, message.payload.homePinId, activeSpaceId),
          message.payload.windowId,
        );
      }
    case 'EDIT_HOME_PIN_URL':
      return handleEditHomePinUrl(message.payload);
    case 'RENAME_TAB_ALIAS':
      return handleRenameTabAlias(message.payload);
    case 'GO_HOME':
      return handleGoHome(message.payload.homePinId, message.payload.windowId);
    case 'REOPEN_HOME_PIN':
      return handleReopenHomePin(
        message.payload.homePinId,
        message.payload.windowId,
      );
    case 'MOVE_HOME_PIN':
      {
        const state = await loadState();
        const activeSpaceId = getActiveSpace(state, message.payload.windowId).id;

        return saveAndBroadcast(
          moveHomePin(
            state,
            message.payload.homePinId,
            message.payload.index,
            activeSpaceId,
          ),
          message.payload.windowId,
        );
      }
    case 'SWITCH_SPACE':
      return handleSwitchSpace(
        message.payload.spaceId,
        message.payload.windowId,
      );
    case 'CREATE_SPACE':
      return handleCreateSpace(
        message.payload.name,
        message.payload.windowId,
        message.payload.icon,
      );
    case 'RENAME_SPACE':
      return saveAndBroadcast(
        renameSpace(
          await loadState(),
          message.payload.spaceId,
          message.payload.name,
        ),
        message.payload.windowId,
      );
    case 'UPDATE_SPACE':
      return saveAndBroadcast(
        updateSpaceDetails(await loadState(), message.payload.spaceId, {
          name: message.payload.name,
          icon: message.payload.icon,
        }),
        message.payload.windowId,
      );
    case 'DELETE_SPACE':
      return saveAndBroadcast(
        deleteSpace(await loadState(), message.payload.spaceId),
        message.payload.windowId,
      );
    case 'CREATE_GROUP_FROM_TAB':
      return handleCreateGroupFromTab(
        message.payload.tabId,
        message.payload.title,
        message.payload.color,
        message.payload.windowId,
      );
    case 'MOVE_TAB_TO_GROUP':
      return handleMoveTabToGroup(
        message.payload.tabId,
        message.payload.groupId,
        message.payload.windowId,
      );
    case 'UNGROUP_TAB':
      await chrome.tabs.ungroup(message.payload.tabId);
      return getPanelState(message.payload.windowId);
    case 'UPDATE_GROUP':
      await chrome.tabGroups.update(message.payload.groupId, {
        title: message.payload.title,
        color: message.payload.color,
        collapsed: message.payload.collapsed,
      });
      return getPanelState(message.payload.windowId);
    case 'CLOSE_GROUP':
      return handleCloseGroup(
        message.payload.groupId,
        message.payload.windowId,
      );
  }
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (isRequestMessage(message)) {
    handleMessage(message).then(sendResponse);
    return true;
  }

  if (isContentRequestMessage(message)) {
    handleContentMessage(message, sender).then(sendResponse);
    return true;
  }

  return false;
});

const broadcastSoon = () => {
  void broadcastPanelState();
};

// Track each window's active tab in session storage (survives service-worker
// restarts) so a native close can tell whether the closed tab was the active
// one — the case where Chrome auto-jumps to another space.
function activeTabKey(windowId: number): string {
  return `activeTab:${windowId}`;
}

async function recordInitialActiveTabs(): Promise<void> {
  const activeTabs = await chrome.tabs.query({ active: true });
  const entries: Record<string, number> = {};

  for (const tab of activeTabs) {
    if (typeof tab.id === 'number' && typeof tab.windowId === 'number') {
      entries[activeTabKey(tab.windowId)] = tab.id;
    }
  }

  if (Object.keys(entries).length > 0) {
    await chrome.storage.session.set(entries);
  }
}

async function handleTabRemoved(
  removedTabId: number,
  windowId: number,
): Promise<void> {
  const key = activeTabKey(windowId);
  const stored = await chrome.storage.session.get(key);

  if (stored[key] === removedTabId) {
    await keepFocusInActiveSpace(windowId);
  }

  void broadcastPanelState();
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  void chrome.storage.session.set({
    [activeTabKey(activeInfo.windowId)]: activeInfo.tabId,
  });
  void cleanupPlaceholders();
  void broadcastPanelState();
});
chrome.tabs.onAttached.addListener(broadcastSoon);
chrome.tabs.onCreated.addListener(broadcastSoon);
chrome.tabs.onDetached.addListener(broadcastSoon);
chrome.tabs.onMoved.addListener(broadcastSoon);
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (removeInfo.isWindowClosing) return;
  void handleTabRemoved(tabId, removeInfo.windowId);
});
chrome.tabs.onUpdated.addListener(broadcastSoon);

chrome.tabGroups.onCreated.addListener(broadcastSoon);
chrome.tabGroups.onMoved.addListener(broadcastSoon);
chrome.tabGroups.onRemoved.addListener(broadcastSoon);
chrome.tabGroups.onUpdated.addListener(broadcastSoon);

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COPY_CURRENT_URL_COMMAND) {
    void handleCopyCurrentUrlCommand(tab).catch(() => {
      void flashActionBadge(tab?.id, 'ERR', '#b91c1c');
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void recordInitialActiveTabs();
  broadcastSoon();
});
chrome.runtime.onInstalled.addListener(() => {
  void recordInitialActiveTabs();
  broadcastSoon();
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
