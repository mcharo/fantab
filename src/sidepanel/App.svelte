<script lang="ts">
  import type { BroadcastMessage, RequestMessage } from '../messaging';
  import { tabMatchesQuery } from '../panelState';
  import {
    DEFAULT_SPACE_ID,
    type PanelState,
    type PanelTab,
    type SpaceIconId,
    type TabGroupColor,
  } from '../types';
  import { promptDialog } from './dialog';
  import ContextMenu, {
    type ContextMenuItem,
  } from './components/ContextMenu.svelte';
  import DialogHost from './components/DialogHost.svelte';
  import Header from './components/Header.svelte';
  import SpaceDock from './components/SpaceDock.svelte';
  import TabList from './components/TabList.svelte';

  const EMPTY_PANEL_STATE: PanelState = {
    windowId: null,
    activeTabId: null,
    activeSpaceId: DEFAULT_SPACE_ID,
    spaces: [{ id: DEFAULT_SPACE_ID, name: 'Default', icon: 'circle', order: 0 }],
    homePins: [],
    groups: [],
    ungroupedTabs: [],
  };

  let panelState = $state<PanelState>(EMPTY_PANEL_STATE);
  let panelWindowId = $state<number | null>(null);
  let panelWindowResolved = false;
  let searchQuery = $state('');
  let searchOpen = $state(false);
  let selectedKey = $state<string | null>(null);
  // Tracks the last active tab so the selection can follow it when it changes
  // (e.g. a new tab opened via Cmd+T) without resetting arrow-key navigation.
  let lastActiveTabId: number | null = null;
  let errorMessage = $state<string | null>(null);
  let contextMenu = $state<{ tab: PanelTab; x: number; y: number } | null>(null);
  let copiedKey = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  const filteredHomePins = $derived(
    panelState.homePins.filter((tab) => tabMatchesQuery(tab, searchQuery)),
  );

  const filteredGroups = $derived(
    panelState.groups
      .map((group) => {
        const groupMatches = group.title
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase());
        const tabs = groupMatches
          ? group.tabs
          : group.tabs.filter((tab) =>
              tabMatchesQuery(tab, searchQuery, group.title),
            );

        return { ...group, tabs };
      })
      .filter((group) => group.tabs.length > 0),
  );

  const filteredUngroupedTabs = $derived(
    panelState.ungroupedTabs.filter((tab) =>
      tabMatchesQuery(tab, searchQuery),
    ),
  );

  const visibleTabs = $derived([
    ...filteredHomePins,
    ...filteredGroups.flatMap((group) =>
      group.collapsed ? [] : group.tabs,
    ),
    ...filteredUngroupedTabs,
  ]);

  // When the header is floating (idle) and there's no leading PINNED section,
  // the first group/tab row would sit under the floating buttons — inset the
  // list so its right-edge controls stay clear of them.
  const headerFloating = $derived(!(searchOpen || searchQuery.trim().length > 0));
  const listTopInset = $derived(headerFloating && filteredHomePins.length === 0);

  $effect(() => {
    if (visibleTabs.length === 0) {
      selectedKey = null;
      lastActiveTabId = panelState.activeTabId;
      return;
    }

    const activeTab = visibleTabs.find((tab) => tab.tabId === panelState.activeTabId);

    // When the active tab changes (e.g. opening a new tab), move the selection
    // to it so the highlight doesn't linger on the previously selected row.
    if (panelState.activeTabId !== lastActiveTabId) {
      lastActiveTabId = panelState.activeTabId;
      if (activeTab) {
        selectedKey = activeTab.key;
        return;
      }
    }

    if (!selectedKey || !visibleTabs.some((tab) => tab.key === selectedKey)) {
      selectedKey = activeTab?.key ?? visibleTabs[0].key;
    }
  });

  async function resolvePanelWindowId(): Promise<number | null> {
    if (panelWindowResolved) return panelWindowId;

    try {
      const currentWindow = await chrome.windows.getCurrent();
      panelWindowId = currentWindow.id ?? null;
    } catch {
      panelWindowId = panelState.windowId;
    }

    panelWindowResolved = true;
    return panelWindowId;
  }

  function scopeMessageToWindow(
    message: RequestMessage,
    windowId: number | null,
  ): RequestMessage {
    return {
      ...message,
      payload: {
        ...message.payload,
        windowId,
      },
    } as RequestMessage;
  }

  async function sendMessage(message: RequestMessage): Promise<PanelState | null> {
    try {
      errorMessage = null;
      const windowId = await resolvePanelWindowId();
      const nextState = await chrome.runtime.sendMessage(
        scopeMessageToWindow(message, windowId),
      );
      if (nextState) panelState = nextState;
      return nextState;
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : 'Unable to update tabs';
      return null;
    }
  }

  async function refreshPanelState() {
    await sendMessage({ action: 'GET_PANEL_STATE', payload: {} });
  }

  function findTabByKey(key: string | null): PanelTab | undefined {
    if (!key) return undefined;
    return visibleTabs.find((tab) => tab.key === key);
  }

  async function activateTab(tab: PanelTab) {
    selectedKey = tab.key;

    if (tab.isOpen && tab.tabId !== null) {
      await sendMessage({
        action: 'ACTIVATE_TAB',
        payload: { tabId: tab.tabId },
      });
      return;
    }

    if (tab.homePinId) {
      await sendMessage({
        action: 'REOPEN_HOME_PIN',
        payload: { homePinId: tab.homePinId },
      });
    }
  }

  async function renameTab(tab: PanelTab, alias: string) {
    await sendMessage({
      action: 'RENAME_TAB_ALIAS',
      payload: {
        tabId: tab.tabId ?? undefined,
        homePinId: tab.homePinId ?? undefined,
        alias,
      },
    });
  }

  async function createGroupFromTab(tabId: number) {
    const result = await promptDialog({
      title: 'New group',
      label: 'Group name',
      value: 'New Group',
      confirmLabel: 'Create',
    });
    if (result === null) return;

    await sendMessage({
      action: 'CREATE_GROUP_FROM_TAB',
      payload: { tabId, title: result.trim() || 'New Group', color: 'blue' },
    });
  }

  async function createGroupFromActiveTab() {
    if (panelState.activeTabId === null) return;
    await createGroupFromTab(panelState.activeTabId);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      errorMessage = 'Unable to copy to clipboard';
    }
  }

  async function editHomePinUrl(tab: PanelTab) {
    if (!tab.homePinId) return;

    const current = tab.homeUrl ?? tab.url;
    const result = await promptDialog({
      title: 'Edit home URL',
      label: 'Home URL',
      value: current,
      placeholder: 'https://example.com',
      confirmLabel: 'Save',
    });
    if (result === null) return;

    const next = result.trim();
    if (!next || next === current) return;

    await sendMessage({
      action: 'EDIT_HOME_PIN_URL',
      payload: { homePinId: tab.homePinId, homeUrl: next },
    });
  }

  async function renameViaDialog(tab: PanelTab) {
    const result = await promptDialog({
      title: 'Rename',
      label: 'Display name',
      value: tab.displayName,
      confirmLabel: 'Save',
    });
    if (result === null) return;

    const next = result.trim();
    if (!next || next === tab.displayName) return;
    void renameTab(tab, next);
  }

  function openContextMenu(tab: PanelTab, x: number, y: number) {
    contextMenu = { tab, x, y };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function contextMenuItems(tab: PanelTab): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    const copyTarget = tab.homeUrl ?? tab.url;

    if (copyTarget) {
      items.push({
        type: 'action',
        label: 'Copy URL',
        onSelect: () => void copyToClipboard(copyTarget),
      });
    }

    if (tab.isHomePin && tab.homePinId) {
      items.push({
        type: 'action',
        label: 'Edit URL…',
        onSelect: () => void editHomePinUrl(tab),
      });
    }

    items.push({
      type: 'action',
      label: 'Rename…',
      onSelect: () => void renameViaDialog(tab),
    });

    if (!tab.isHomePin && tab.tabId !== null) {
      items.push({
        type: 'action',
        label: 'Pin as home',
        onSelect: () =>
          void sendMessage({
            action: 'CREATE_HOME_PIN',
            payload: { tabId: tab.tabId! },
          }),
      });
      items.push({
        type: 'action',
        label: 'New group from tab',
        onSelect: () => void createGroupFromTab(tab.tabId!),
      });
    }

    items.push({ type: 'separator' });

    if (tab.isHomePin && tab.homePinId) {
      items.push({
        type: 'action',
        label: 'Remove pin',
        danger: true,
        onSelect: () =>
          void sendMessage({
            action: 'REMOVE_HOME_PIN',
            payload: { homePinId: tab.homePinId! },
          }),
      });
    }

    if (tab.isOpen && tab.tabId !== null) {
      items.push({
        type: 'action',
        label: 'Close tab',
        danger: true,
        onSelect: () =>
          void sendMessage({
            action: 'CLOSE_TAB',
            payload: { tabId: tab.tabId! },
          }),
      });
    }

    return items;
  }

  async function updateGroup(
    groupId: number,
    updates: { title?: string; color?: TabGroupColor; collapsed?: boolean },
  ) {
    await sendMessage({
      action: 'UPDATE_GROUP',
      payload: { groupId, ...updates },
    });
  }

  async function closeGroup(groupId: number) {
    await sendMessage({
      action: 'CLOSE_GROUP',
      payload: { groupId },
    });
  }

  async function switchSpace(spaceId: string) {
    selectedKey = null;
    await sendMessage({
      action: 'SWITCH_SPACE',
      payload: { spaceId },
    });
  }

  async function createSpace(name: string, icon: SpaceIconId) {
    selectedKey = null;
    await sendMessage({
      action: 'CREATE_SPACE',
      payload: { name, icon },
    });
  }

  async function updateSpace(
    spaceId: string,
    updates: { name?: string; icon?: SpaceIconId },
  ) {
    await sendMessage({
      action: 'UPDATE_SPACE',
      payload: { spaceId, ...updates },
    });
  }

  async function deleteSpace(spaceId: string) {
    selectedKey = null;
    await sendMessage({
      action: 'DELETE_SPACE',
      payload: { spaceId },
    });
  }

  async function handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const isTextInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    if (isTextInput && event.key !== 'Escape') return;

    if (event.key === 'Escape') {
      if (searchQuery) {
        searchQuery = '';
        event.preventDefault();
      }
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') {
      return;
    }

    if (visibleTabs.length === 0) return;

    event.preventDefault();
    const currentIndex = Math.max(
      0,
      visibleTabs.findIndex((tab) => tab.key === selectedKey),
    );

    if (event.key === 'ArrowDown') {
      selectedKey = visibleTabs[Math.min(currentIndex + 1, visibleTabs.length - 1)].key;
      return;
    }

    if (event.key === 'ArrowUp') {
      selectedKey = visibleTabs[Math.max(currentIndex - 1, 0)].key;
      return;
    }

    const selectedTab = findTabByKey(selectedKey);
    if (selectedTab) await activateTab(selectedTab);
  }

  function flashCopied(tabId: number) {
    const tab = visibleTabs.find((candidate) => candidate.tabId === tabId);
    if (!tab) return;

    copiedKey = tab.key;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedKey = null;
    }, 1500);
  }

  $effect(() => {
    void refreshPanelState();

    const onMessage = (message: BroadcastMessage) => {
      if (message.action === 'PANEL_STATE_UPDATED') {
        void refreshPanelState();
      } else if (message.action === 'URL_COPIED') {
        flashCopied(message.payload.tabId);
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app">
  <Header
    {searchQuery}
    bind:searchOpen
    onSearchChange={(query) => (searchQuery = query)}
    onCreateTab={() => sendMessage({ action: 'CREATE_TAB', payload: {} })}
    onCreateGroup={createGroupFromActiveTab}
    canCreateGroup={panelState.activeTabId !== null}
  />

  {#if errorMessage}
    <div class="error">{errorMessage}</div>
  {/if}

  <TabList
    homePins={filteredHomePins}
    groups={filteredGroups}
    ungroupedTabs={filteredUngroupedTabs}
    topInset={listTopInset}
    {selectedKey}
    {copiedKey}
    onActivate={activateTab}
    onClose={(tabId) =>
      sendMessage({ action: 'CLOSE_TAB', payload: { tabId } })}
    onRename={renameTab}
    onCreateHomePin={(tabId) =>
      sendMessage({ action: 'CREATE_HOME_PIN', payload: { tabId } })}
    onRemoveHomePin={(homePinId) =>
      sendMessage({
        action: 'REMOVE_HOME_PIN',
        payload: { homePinId },
      })}
    onGoHome={(homePinId) =>
      sendMessage({ action: 'GO_HOME', payload: { homePinId } })}
    onContextMenu={openContextMenu}
    onMoveToGroup={(tabId, groupId) =>
      sendMessage({
        action: 'MOVE_TAB_TO_GROUP',
        payload: { tabId, groupId },
      })}
    onUngroup={(tabId) =>
      sendMessage({ action: 'UNGROUP_TAB', payload: { tabId } })}
    onCloseGroup={closeGroup}
    onUpdateGroup={updateGroup}
    onMoveTab={(tabId, index) =>
      sendMessage({ action: 'MOVE_TAB', payload: { tabId, index } })}
    onMoveHomePin={(homePinId, index) =>
      sendMessage({
        action: 'MOVE_HOME_PIN',
        payload: { homePinId, index },
      })}
  />

  <SpaceDock
    spaces={panelState.spaces}
    activeSpaceId={panelState.activeSpaceId}
    onSwitchSpace={switchSpace}
    onCreateSpace={createSpace}
    onUpdateSpace={updateSpace}
    onDeleteSpace={deleteSpace}
  />

  {#if contextMenu}
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      items={contextMenuItems(contextMenu.tab)}
      onClose={closeContextMenu}
    />
  {/if}

  <DialogHost />
</div>

<style>
  .app {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    outline: none;
  }

  .error {
    margin: 8px 12px 0;
    padding: 8px;
    border-radius: var(--radius-sm);
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 12px;
  }
</style>
