import type { AppState, ManagedTab } from './types';
import type { Message } from './messaging';
import { isAtHome, computeTitle } from './lib/url';
import {
  loadState,
  saveState,
  generateId,
  findTabByTabId,
  findTabById,
  updateTab,
  addTab,
  removeTab,
  addGroup,
  updateGroup as updateGroupInState,
  removeGroup,
} from './storage';

const titleCache = new Map<number, string>();

async function broadcastState(state: AppState): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      action: 'STATE_UPDATED',
      payload: state,
    });
  } catch {
    // Side panel might not be open — safe to ignore
  }
}

async function applyTitle(tabId: number, title: string): Promise<void> {
  titleCache.set(tabId, title);
  try {
    await chrome.tabs.update(tabId, { title });
  } catch {
    // Tab may have closed between check and update
  }
}

async function refreshTabTitle(managedTab: ManagedTab): Promise<void> {
  if (!managedTab.tabId) return;
  const atHome = isAtHome(managedTab.currentUrl, managedTab.homeUrl);
  const title = computeTitle(
    managedTab.customName,
    managedTab.currentTitle,
    atHome,
  );
  await applyTitle(managedTab.tabId, title);
}

async function handlePinTab(chromeTabId: number): Promise<AppState> {
  let state = await loadState();

  if (state.tabs.some((t) => t.tabId === chromeTabId)) {
    return state;
  }

  const tab = await chrome.tabs.get(chromeTabId);
  const managedTab: ManagedTab = {
    id: generateId(),
    homeUrl: tab.url ?? '',
    customName: tab.title ?? 'New Tab',
    groupId: null,
    tabId: chromeTabId,
    faviconUrl: tab.favIconUrl ?? '',
    currentUrl: tab.url ?? null,
    currentTitle: tab.title ?? null,
    createdAt: Date.now(),
  };

  state = addTab(state, managedTab);
  await saveState(state);
  await refreshTabTitle(managedTab);
  await broadcastState(state);
  return state;
}

async function handleUnpinTab(id: string): Promise<AppState> {
  let state = await loadState();
  const tab = findTabById(state, id);
  if (tab?.tabId) {
    titleCache.delete(tab.tabId);
    try {
      await chrome.tabs.reload(tab.tabId);
    } catch {
      // Tab may have been closed
    }
  }
  state = removeTab(state, id);
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleRenameTab(
  id: string,
  customName: string,
): Promise<AppState> {
  let state = await loadState();
  state = updateTab(state, id, { customName });
  await saveState(state);

  const tab = findTabById(state, id);
  if (tab) await refreshTabTitle(tab);

  await broadcastState(state);
  return state;
}

async function handleGoHome(id: string): Promise<AppState> {
  const state = await loadState();
  const tab = findTabById(state, id);
  if (tab?.tabId) {
    await chrome.tabs.update(tab.tabId, { url: tab.homeUrl });
  }
  return state;
}

async function handleReopenTab(id: string): Promise<AppState> {
  let state = await loadState();
  const managedTab = findTabById(state, id);
  if (!managedTab) return state;

  const newTab = await chrome.tabs.create({ url: managedTab.homeUrl });
  state = updateTab(state, id, {
    tabId: newTab.id ?? null,
    currentUrl: managedTab.homeUrl,
    currentTitle: null,
  });
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleCreateGroup(
  name: string,
  color: string,
): Promise<AppState> {
  let state = await loadState();
  const maxOrder = state.groups.reduce((max, g) => Math.max(max, g.order), -1);
  state = addGroup(state, {
    id: generateId(),
    name,
    color,
    order: maxOrder + 1,
  });
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleUpdateGroup(
  id: string,
  updates: { name?: string; color?: string },
): Promise<AppState> {
  let state = await loadState();
  state = updateGroupInState(state, id, updates);
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleDeleteGroup(id: string): Promise<AppState> {
  let state = await loadState();
  state = removeGroup(state, id);
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleMoveToGroup(
  tabId: string,
  groupId: string | null,
): Promise<AppState> {
  let state = await loadState();
  state = updateTab(state, tabId, { groupId });
  await saveState(state);
  await broadcastState(state);
  return state;
}

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    const handle = async (): Promise<AppState | null> => {
      switch (message.action) {
        case 'PIN_TAB':
          return handlePinTab(message.payload.tabId);
        case 'UNPIN_TAB':
          return handleUnpinTab(message.payload.id);
        case 'RENAME_TAB':
          return handleRenameTab(
            message.payload.id,
            message.payload.customName,
          );
        case 'GO_HOME':
          return handleGoHome(message.payload.id);
        case 'REOPEN_TAB':
          return handleReopenTab(message.payload.id);
        case 'CREATE_GROUP':
          return handleCreateGroup(
            message.payload.name,
            message.payload.color,
          );
        case 'UPDATE_GROUP':
          return handleUpdateGroup(message.payload.id, message.payload);
        case 'DELETE_GROUP':
          return handleDeleteGroup(message.payload.id);
        case 'MOVE_TO_GROUP':
          return handleMoveToGroup(
            message.payload.tabId,
            message.payload.groupId,
          );
        case 'GET_STATE':
          return loadState();
        default:
          return null;
      }
    };

    handle().then(sendResponse);
    return true;
  },
);

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.title) return;

  let state = await loadState();
  const managedTab = findTabByTabId(state, tabId);
  if (!managedTab) return;

  const updates: Partial<ManagedTab> = {};

  if (changeInfo.url) {
    updates.currentUrl = changeInfo.url;
  }

  if (changeInfo.title) {
    if (titleCache.get(tabId) === changeInfo.title) return;
    updates.currentTitle = changeInfo.title;
  }

  if (tab.favIconUrl && tab.favIconUrl !== managedTab.faviconUrl) {
    const currentUrl = updates.currentUrl ?? managedTab.currentUrl;
    if (isAtHome(currentUrl, managedTab.homeUrl)) {
      updates.faviconUrl = tab.favIconUrl;
    }
  }

  state = updateTab(state, managedTab.id, updates);
  await saveState(state);

  const updatedTab = findTabById(state, managedTab.id)!;
  await refreshTabTitle(updatedTab);
  await broadcastState(state);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  let state = await loadState();
  const managedTab = findTabByTabId(state, tabId);
  if (!managedTab) return;

  titleCache.delete(tabId);
  state = updateTab(state, managedTab.id, {
    tabId: null,
    currentUrl: null,
    currentTitle: null,
  });
  await saveState(state);
  await broadcastState(state);
});

chrome.runtime.onStartup.addListener(async () => {
  let state = await loadState();
  const allTabs = await chrome.tabs.query({});
  const tabMap = new Map(allTabs.map((t) => [t.id, t]));
  let changed = false;

  for (const managedTab of state.tabs) {
    if (managedTab.tabId === null) continue;

    const chromeTab = tabMap.get(managedTab.tabId);
    const urlMatches = chromeTab?.url
      ? isAtHome(chromeTab.url, managedTab.homeUrl) ||
        chromeTab.url === managedTab.currentUrl
      : false;

    if (!chromeTab || !urlMatches) {
      state = updateTab(state, managedTab.id, {
        tabId: null,
        currentUrl: null,
        currentTitle: null,
      });
      changed = true;
    }
  }

  if (changed) {
    await saveState(state);
  }

  for (const managedTab of state.tabs) {
    if (managedTab.tabId !== null) {
      await refreshTabTitle(managedTab);
    }
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
