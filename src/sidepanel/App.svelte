<script lang="ts">
  import type { AppState } from '../types';
  import type { Message } from '../messaging';
  import { STORAGE_KEY } from '../storage';
  import Header from './components/Header.svelte';
  import TabList from './components/TabList.svelte';
  import EmptyState from './components/EmptyState.svelte';

  let state = $state<AppState>({ tabs: [], groups: [] });
  let activeTabId = $state<number | null>(null);

  const isActiveTabPinned = $derived(
    activeTabId !== null && state.tabs.some((t) => t.tabId === activeTabId),
  );

  function sendMessage(message: Message): Promise<AppState> {
    return chrome.runtime.sendMessage(message);
  }

  async function handlePinTab() {
    if (activeTabId === null) return;
    await sendMessage({ action: 'PIN_TAB', payload: { tabId: activeTabId } });
  }

  async function handleUnpinTab(id: string) {
    await sendMessage({ action: 'UNPIN_TAB', payload: { id } });
  }

  async function handleRenameTab(id: string, customName: string) {
    await sendMessage({ action: 'RENAME_TAB', payload: { id, customName } });
  }

  async function handleGoHome(id: string) {
    await sendMessage({ action: 'GO_HOME', payload: { id } });
  }

  async function handleReopenTab(id: string) {
    await sendMessage({ action: 'REOPEN_TAB', payload: { id } });
  }

  async function handleCreateGroup(name: string, color: string) {
    await sendMessage({ action: 'CREATE_GROUP', payload: { name, color } });
  }

  async function handleUpdateGroup(
    id: string,
    updates: { name?: string; color?: string },
  ) {
    await sendMessage({ action: 'UPDATE_GROUP', payload: { id, ...updates } });
  }

  async function handleDeleteGroup(id: string) {
    await sendMessage({ action: 'DELETE_GROUP', payload: { id } });
  }

  async function handleMoveToGroup(tabId: string, groupId: string | null) {
    await sendMessage({
      action: 'MOVE_TO_GROUP',
      payload: { tabId, groupId },
    });
  }

  $effect(() => {
    sendMessage({ action: 'GET_STATE', payload: {} }).then((s) => {
      if (s) state = s;
    });

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) activeTabId = tab.id;
    });

    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      activeTabId = info.tabId;
    };
    chrome.tabs.onActivated.addListener(onActivated);

    const onMessage = (message: Message) => {
      if (message.action === 'STATE_UPDATED') {
        state = message.payload;
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);

    const onStorageChanged = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes[STORAGE_KEY]?.newValue) {
        state = changes[STORAGE_KEY].newValue;
      }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  });
</script>

<div class="app">
  <Header onPinTab={handlePinTab} {isActiveTabPinned} />

  {#if state.tabs.length === 0}
    <EmptyState />
  {:else}
    <TabList
      tabs={state.tabs}
      groups={state.groups}
      onUnpinTab={handleUnpinTab}
      onRenameTab={handleRenameTab}
      onGoHome={handleGoHome}
      onReopenTab={handleReopenTab}
      onCreateGroup={handleCreateGroup}
      onUpdateGroup={handleUpdateGroup}
      onDeleteGroup={handleDeleteGroup}
      onMoveToGroup={handleMoveToGroup}
    />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
</style>
