<script lang="ts">
  import type {
    BroadcastMessage,
    ExportSpaceDataResponse,
    RequestMessage,
  } from '../messaging';
  import { tabMatchesQuery } from '../panelState';
  import {
    DEFAULT_DENSITY,
    DEFAULT_PREFERENCES,
    DEFAULT_TAB_TITLE_FONT_SIZE,
    DEFAULT_THEME,
    type DensityPreference,
    type ThemePreference,
    clampCloseAllRestoreSeconds,
    clampTabTitleFontSize,
    loadPreferences,
    savePreferences,
  } from '../preferences';
  import {
    DEFAULT_SPACE_ID,
    type PanelState,
    type PanelTab,
    type SpaceIcon,
    type TabGroupColor,
  } from '../types';
  import { confirmDialog, promptDialog } from './dialog';
  import ContextMenu, {
    type ContextMenuItem,
  } from './components/ContextMenu.svelte';
  import DialogHost from './components/DialogHost.svelte';
  import Header from './components/Header.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';
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
  // Multi-selection: `selectedKeys` are all highlighted rows; `selectionAnchor`
  // is the keyboard cursor and the anchor for shift-range selection. The set is
  // always reassigned (never mutated in place) so Svelte tracks the change.
  let selectedKeys = $state<Set<string>>(new Set());
  let selectionAnchor = $state<string | null>(null);
  // Tracks the last active tab so the selection can follow it when it changes
  // (e.g. a new tab opened via Cmd+T) without resetting arrow-key navigation.
  let lastActiveTabId: number | null = null;
  let errorMessage = $state<string | null>(null);
  let contextMenu = $state<{ tab: PanelTab; x: number; y: number } | null>(null);
  let settingsOpen = $state(false);
  let settingsBusy = $state(false);
  let settingsStatus = $state<string | null>(null);
  let settingsError = $state<string | null>(null);

  // "Close all" defers the actual tab close: matching tabs are hidden from the
  // panel for a grace period during which they can be restored, then closed.
  let pendingCloseTabIds = $state<Set<number>>(new Set());
  let pendingCloseTimer: ReturnType<typeof setTimeout> | undefined;
  // When "Close all" hides the active tab, we move focus off it immediately and
  // remember it here so an explicit Restore can re-activate it. null when the
  // active tab wasn't among those hidden.
  let closeAllRestoreActiveTabId: number | null = null;
  let copiedKey = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let tabTitleFontSize = $state(DEFAULT_TAB_TITLE_FONT_SIZE);
  let theme = $state<ThemePreference>(DEFAULT_THEME);
  let density = $state<DensityPreference>(DEFAULT_DENSITY);
  let syncEnabled = $state(DEFAULT_PREFERENCES.syncEnabled);
  let closeAllRestoreSeconds = $state(
    DEFAULT_PREFERENCES.closeAllRestoreSeconds,
  );
  const closeAllRestoreMs = $derived(closeAllRestoreSeconds * 1000);
  let closeAllHoldToConfirm = $state(
    DEFAULT_PREFERENCES.closeAllHoldToConfirm,
  );

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
    panelState.ungroupedTabs.filter(
      (tab) =>
        tabMatchesQuery(tab, searchQuery) &&
        !(tab.tabId !== null && pendingCloseTabIds.has(tab.tabId)),
    ),
  );

  // Open loose tabs currently shown below the separator — what "Close all" acts
  // on (and the count it advertises).
  const closeAllTabIds = $derived(
    filteredUngroupedTabs
      .map((tab) => tab.tabId)
      .filter((tabId): tabId is number => tabId !== null),
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

  const activeSpace = $derived(
    panelState.spaces.find((space) => space.id === panelState.activeSpaceId) ??
      panelState.spaces[0],
  );

  function selectSingle(key: string) {
    selectedKeys = new Set([key]);
    selectionAnchor = key;
  }

  function clearSelection() {
    selectedKeys = new Set();
    selectionAnchor = null;
  }

  $effect(() => {
    const activeId = panelState.activeTabId;

    // The user re-activated (via Chrome's tab strip) a tab that's mid-close — it
    // is still live, so cancel the deferred close and let those tabs reappear.
    // Gated on an actual change so the tab already active at "Close all" time
    // doesn't immediately rescue itself.
    if (
      activeId !== lastActiveTabId &&
      activeId !== null &&
      pendingCloseTabIds.has(activeId)
    ) {
      lastActiveTabId = activeId;
      restoreClosedTabs(false);
      return;
    }

    if (visibleTabs.length === 0) {
      if (selectedKeys.size > 0) selectedKeys = new Set();
      if (selectionAnchor !== null) selectionAnchor = null;
      lastActiveTabId = panelState.activeTabId;
      return;
    }

    const activeTab = visibleTabs.find((tab) => tab.tabId === panelState.activeTabId);

    // When the active tab changes (e.g. opening a new tab), move the selection
    // to it so the highlight doesn't linger on the previously selected row.
    if (panelState.activeTabId !== lastActiveTabId) {
      lastActiveTabId = panelState.activeTabId;
      if (activeTab) {
        selectSingle(activeTab.key);
        return;
      }
    }

    // Drop any selected keys whose tabs are no longer visible.
    const visibleKeys = new Set(visibleTabs.map((tab) => tab.key));
    const pruned = [...selectedKeys].filter((key) => visibleKeys.has(key));
    if (pruned.length !== selectedKeys.size) {
      selectedKeys = new Set(pruned);
    }

    if (selectedKeys.size === 0) {
      selectSingle(activeTab?.key ?? visibleTabs[0].key);
    } else if (selectionAnchor === null || !visibleKeys.has(selectionAnchor)) {
      selectionAnchor =
        activeTab && selectedKeys.has(activeTab.key)
          ? activeTab.key
          : [...selectedKeys][0];
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

  async function sendRawMessage<T>(message: RequestMessage): Promise<T> {
    const windowId = await resolvePanelWindowId();
    return chrome.runtime.sendMessage(scopeMessageToWindow(message, windowId));
  }

  async function refreshPanelState() {
    await sendMessage({ action: 'GET_PANEL_STATE', payload: {} });
  }

  function findTabByKey(key: string | null): PanelTab | undefined {
    if (!key) return undefined;
    return visibleTabs.find((tab) => tab.key === key);
  }

  async function activateTab(tab: PanelTab) {
    selectSingle(tab.key);

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

  function selectRow(tab: PanelTab, mods: { toggle: boolean; range: boolean }) {
    if (mods.range && selectionAnchor) {
      selectRange(selectionAnchor, tab.key);
      return;
    }

    if (mods.toggle) {
      const next = new Set(selectedKeys);
      if (next.has(tab.key)) next.delete(tab.key);
      else next.add(tab.key);
      selectedKeys = next;
      selectionAnchor = tab.key;
      return;
    }

    selectSingle(tab.key);
  }

  function selectRange(fromKey: string, toKey: string) {
    const keys = visibleTabs.map((tab) => tab.key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from === -1 || to === -1) {
      selectSingle(toKey);
      return;
    }

    const [lo, hi] = from <= to ? [from, to] : [to, from];
    selectedKeys = new Set(keys.slice(lo, hi + 1));
    // Keep the anchor so further shift-clicks extend from the same origin.
  }

  function openContextMenu(tab: PanelTab, x: number, y: number) {
    // Right-clicking a row outside the current multi-selection collapses to it;
    // right-clicking inside the selection keeps it so bulk actions apply.
    if (!selectedKeys.has(tab.key)) {
      selectSingle(tab.key);
    }
    contextMenu = { tab, x, y };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  // Deferred "Close all": hide the loose tabs now, start the restore window, and
  // actually close them when it expires. Restoring just un-hides them.
  function confirmCloseAll() {
    const ids = closeAllTabIds;
    if (ids.length === 0) return;

    clearTimeout(pendingCloseTimer);
    pendingCloseTabIds = new Set(ids);

    // If the active tab is one of the ones we're hiding, move focus off it now
    // (to the last-used tab in the space, or the blank page) so it isn't left in
    // front during the restore window. Remember it so Restore can re-focus it.
    const activeId = panelState.activeTabId;
    closeAllRestoreActiveTabId =
      activeId !== null && pendingCloseTabIds.has(activeId) ? activeId : null;
    if (closeAllRestoreActiveTabId !== null) {
      void sendMessage({
        action: 'PRESERVE_CLOSE_FOCUS',
        payload: { tabIds: ids },
      });
    }

    pendingCloseTimer = setTimeout(() => {
      void finalizeCloseAll();
    }, closeAllRestoreMs);
  }

  async function finalizeCloseAll() {
    pendingCloseTimer = undefined;
    closeAllRestoreActiveTabId = null;
    const ids = [...pendingCloseTabIds];

    // Close first, THEN clear the hidden set. Clearing before the close lands
    // would un-hide the tabs for the round-trip and flash them back in.
    if (ids.length > 0) {
      await sendMessage({ action: 'CLOSE_TABS', payload: { tabIds: ids } });
    }
    pendingCloseTabIds = new Set();
  }

  // `reactivatePreviousTab` re-focuses the tab that was active when "Close all"
  // moved focus away. We skip it when the restore was triggered by the user
  // re-activating a hidden tab themselves (they're already where they want).
  function restoreClosedTabs(reactivatePreviousTab = true) {
    clearTimeout(pendingCloseTimer);
    pendingCloseTimer = undefined;
    pendingCloseTabIds = new Set();

    const previousActiveTabId = closeAllRestoreActiveTabId;
    closeAllRestoreActiveTabId = null;
    if (reactivatePreviousTab && previousActiveTabId !== null) {
      void sendMessage({
        action: 'ACTIVATE_TAB',
        payload: { tabId: previousActiveTabId },
      });
    }
  }

  $effect(() => () => clearTimeout(pendingCloseTimer));

  function openSettings() {
    settingsOpen = true;
    settingsStatus = null;
    settingsError = null;
  }

  function persistPreferences() {
    void savePreferences({
      tabTitleFontSize,
      theme,
      density,
      syncEnabled,
      closeAllRestoreSeconds,
      closeAllHoldToConfirm,
    });
  }

  function setTabTitleFontSize(size: number) {
    tabTitleFontSize = clampTabTitleFontSize(size);
    persistPreferences();
  }

  function setTheme(next: ThemePreference) {
    theme = next;
    persistPreferences();
  }

  function setDensity(next: DensityPreference) {
    density = next;
    persistPreferences();
  }

  function setSyncEnabled(next: boolean) {
    syncEnabled = next;
    persistPreferences();
  }

  function setCloseAllRestoreSeconds(seconds: number) {
    closeAllRestoreSeconds = clampCloseAllRestoreSeconds(seconds);
    persistPreferences();
  }

  function setCloseAllHoldToConfirm(next: boolean) {
    closeAllHoldToConfirm = next;
    persistPreferences();
  }

  function openKeyboardShortcuts() {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  }

  function downloadJsonFile(filename: string, data: string) {
    const url = URL.createObjectURL(
      new Blob([data], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function exportSpaceData() {
    settingsBusy = true;
    settingsStatus = null;
    settingsError = null;

    try {
      const response = await sendRawMessage<ExportSpaceDataResponse>({
        action: 'EXPORT_SPACE_DATA',
        payload: {},
      });
      downloadJsonFile(response.filename, response.data);
      settingsStatus = 'Exported';
    } catch (error) {
      settingsError =
        error instanceof Error ? error.message : 'Unable to export';
    } finally {
      settingsBusy = false;
    }
  }

  async function importSpaceData(file: File) {
    const confirmed = await confirmDialog({
      title: 'Import Space Data',
      message: 'Replace current fantab spaces with this file?',
      confirmLabel: 'Import',
      danger: true,
    });
    if (!confirmed) return;

    settingsBusy = true;
    settingsStatus = null;
    settingsError = null;

    try {
      const data = await file.text();
      const nextState = await sendRawMessage<PanelState>({
        action: 'IMPORT_SPACE_DATA',
        payload: { data },
      });
      panelState = nextState;
      settingsStatus = 'Imported';
    } catch (error) {
      settingsError =
        error instanceof Error ? error.message : 'Unable to import';
    } finally {
      settingsBusy = false;
    }
  }

  async function resetToDefaults() {
    const confirmed = await confirmDialog({
      title: 'Reset to defaults',
      message:
        'This clears all spaces, home pins, and saved settings, returning fantab to a fresh state. Open tabs stay open. This cannot be undone.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!confirmed) return;

    settingsBusy = true;
    settingsStatus = null;
    settingsError = null;

    try {
      const nextState = await sendRawMessage<PanelState>({
        action: 'RESET_SPACE_DATA',
        payload: {},
      });
      panelState = nextState;

      tabTitleFontSize = DEFAULT_PREFERENCES.tabTitleFontSize;
      theme = DEFAULT_PREFERENCES.theme;
      density = DEFAULT_PREFERENCES.density;
      syncEnabled = DEFAULT_PREFERENCES.syncEnabled;
      closeAllRestoreSeconds = DEFAULT_PREFERENCES.closeAllRestoreSeconds;
      closeAllHoldToConfirm = DEFAULT_PREFERENCES.closeAllHoldToConfirm;
      await savePreferences(DEFAULT_PREFERENCES);

      settingsStatus = 'Reset to defaults';
    } catch (error) {
      settingsError =
        error instanceof Error ? error.message : 'Unable to reset';
    } finally {
      settingsBusy = false;
    }
  }

  function tabCount(n: number): string {
    return `${n} ${n === 1 ? 'tab' : 'tabs'}`;
  }

  function selectedTabs(): PanelTab[] {
    return visibleTabs.filter((tab) => selectedKeys.has(tab.key));
  }

  async function pinSelectedTabs(tabs: PanelTab[]) {
    const tabIds = tabs
      .filter((tab) => !tab.isHomePin && tab.tabId !== null)
      .map((tab) => tab.tabId!);
    if (tabIds.length === 0) return;
    clearSelection();
    await sendMessage({ action: 'CREATE_HOME_PINS', payload: { tabIds } });
  }

  async function unpinSelectedTabs(tabs: PanelTab[]) {
    const homePinIds = tabs
      .filter((tab) => tab.isHomePin && tab.homePinId)
      .map((tab) => tab.homePinId!);
    if (homePinIds.length === 0) return;
    clearSelection();
    await sendMessage({ action: 'REMOVE_HOME_PINS', payload: { homePinIds } });
  }

  async function closeSelectedTabs(tabs: PanelTab[]) {
    const tabIds = tabs
      .filter((tab) => tab.isOpen && tab.tabId !== null)
      .map((tab) => tab.tabId!);
    if (tabIds.length === 0) return;
    clearSelection();
    await sendMessage({ action: 'CLOSE_TABS', payload: { tabIds } });
  }

  function bulkContextMenuItems(): ContextMenuItem[] {
    const tabs = selectedTabs();
    const pinnable = tabs.filter((tab) => !tab.isHomePin && tab.tabId !== null);
    const pinned = tabs.filter((tab) => tab.isHomePin && tab.homePinId);
    const closable = tabs.filter((tab) => tab.isOpen && tab.tabId !== null);
    const items: ContextMenuItem[] = [];

    if (pinnable.length > 0) {
      items.push({
        type: 'action',
        label: `Pin ${tabCount(pinnable.length)}`,
        onSelect: () => void pinSelectedTabs(tabs),
      });
    }

    if (pinned.length > 0) {
      items.push({
        type: 'action',
        label: `Unpin ${tabCount(pinned.length)}`,
        onSelect: () => void unpinSelectedTabs(tabs),
      });
    }

    if (closable.length > 0) {
      if (items.length > 0) items.push({ type: 'separator' });
      items.push({
        type: 'action',
        label: `Close ${tabCount(closable.length)}`,
        danger: true,
        onSelect: () => void closeSelectedTabs(tabs),
      });
    }

    return items;
  }

  function contextMenuItems(tab: PanelTab): ContextMenuItem[] {
    if (selectedKeys.size > 1 && selectedKeys.has(tab.key)) {
      return bulkContextMenuItems();
    }

    const items: ContextMenuItem[] = [];
    const copyTarget = tab.homeUrl ?? tab.url;
    const targetSpaces = panelState.spaces.filter(
      (space) => space.id !== panelState.activeSpaceId,
    );

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

    if (targetSpaces.length > 0 && (tab.homePinId || tab.tabId !== null)) {
      items.push({ type: 'separator' });

      for (const space of targetSpaces) {
        items.push({
          type: 'action',
          label: `Move to ${space.name}`,
          onSelect: () =>
            void sendMessage({
              action: 'MOVE_TAB_TO_SPACE',
              payload: {
                spaceId: space.id,
                tabId: tab.tabId ?? undefined,
                homePinId: tab.homePinId ?? undefined,
              },
            }),
        });
      }
    }

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

    if (tab.isOpen && tab.tabId !== null) {
      items.push({
        type: 'action',
        label: tab.isMuted ? 'Unmute tab' : 'Mute tab',
        onSelect: () =>
          void sendMessage({
            action: 'SET_TAB_MUTED',
            payload: { tabId: tab.tabId!, muted: !tab.isMuted },
          }),
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
    clearSelection();
    await sendMessage({
      action: 'SWITCH_SPACE',
      payload: { spaceId },
    });
  }

  async function createSpace(name: string, icon: SpaceIcon) {
    clearSelection();
    await sendMessage({
      action: 'CREATE_SPACE',
      payload: { name, icon },
    });
  }

  async function updateSpace(
    spaceId: string,
    updates: { name?: string; icon?: SpaceIcon },
  ) {
    await sendMessage({
      action: 'UPDATE_SPACE',
      payload: { spaceId, ...updates },
    });
  }

  async function deleteSpace(spaceId: string) {
    clearSelection();
    await sendMessage({
      action: 'DELETE_SPACE',
      payload: { spaceId },
    });
  }

  function spaceShortcutIndex(event: KeyboardEvent): number | null {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return null;
    }

    const codeMatch = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    const digit =
      codeMatch?.[1] ?? (/^[1-9]$/.test(event.key) ? event.key : null);
    return digit ? Number(digit) - 1 : null;
  }

  async function switchSpaceByIndex(index: number) {
    clearSelection();
    await sendMessage({
      action: 'SWITCH_SPACE_BY_INDEX',
      payload: { index },
    });
  }

  async function handleKeydown(event: KeyboardEvent) {
    const spaceIndex = spaceShortcutIndex(event);
    if (spaceIndex !== null) {
      event.preventDefault();
      await switchSpaceByIndex(spaceIndex);
      return;
    }

    const target = event.target as HTMLElement | null;
    const isTextInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    if (isTextInput && event.key !== 'Escape') return;

    if (event.key === 'Escape') {
      if (selectedKeys.size > 1 && selectionAnchor) {
        selectSingle(selectionAnchor);
        event.preventDefault();
      } else if (searchQuery) {
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
      visibleTabs.findIndex((tab) => tab.key === selectionAnchor),
    );

    if (event.key === 'ArrowDown') {
      selectSingle(
        visibleTabs[Math.min(currentIndex + 1, visibleTabs.length - 1)].key,
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      selectSingle(visibleTabs[Math.max(currentIndex - 1, 0)].key);
      return;
    }

    const selectedTab = findTabByKey(selectionAnchor);
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
    document.documentElement.style.setProperty(
      '--tab-title-font-size',
      `${tabTitleFontSize}px`,
    );
  });

  $effect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  });

  $effect(() => {
    document.documentElement.dataset.density = density;
  });

  $effect(() => {
    void refreshPanelState();
    void loadPreferences().then((prefs) => {
      tabTitleFontSize = prefs.tabTitleFontSize;
      theme = prefs.theme;
      density = prefs.density;
      syncEnabled = prefs.syncEnabled;
      closeAllRestoreSeconds = prefs.closeAllRestoreSeconds;
      closeAllHoldToConfirm = prefs.closeAllHoldToConfirm;
    });

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
    onOpenSettings={openSettings}
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
    spaceName={activeSpace?.name ?? ''}
    spaceIcon={activeSpace?.icon ?? 'circle'}
    topInset={listTopInset}
    {selectedKeys}
    {copiedKey}
    onActivate={activateTab}
    onSelect={selectRow}
    onClose={(tabId) =>
      sendMessage({ action: 'CLOSE_TAB', payload: { tabId } })}
    onToggleMute={(tabId, muted) =>
      sendMessage({ action: 'SET_TAB_MUTED', payload: { tabId, muted } })}
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
    closeAllCount={closeAllTabIds.length}
    closeAllPending={pendingCloseTabIds.size > 0}
    closeAllPendingCount={pendingCloseTabIds.size}
    {closeAllRestoreMs}
    {closeAllHoldToConfirm}
    onCloseAll={confirmCloseAll}
    onRestoreClosed={() => restoreClosedTabs()}
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

  {#if settingsOpen}
    <SettingsDialog
      busy={settingsBusy}
      statusMessage={settingsStatus}
      errorMessage={settingsError}
      {tabTitleFontSize}
      {theme}
      {density}
      {syncEnabled}
      {closeAllRestoreSeconds}
      {closeAllHoldToConfirm}
      onClose={() => (settingsOpen = false)}
      onExport={exportSpaceData}
      onImport={importSpaceData}
      onReset={resetToDefaults}
      onTabTitleFontSizeChange={setTabTitleFontSize}
      onThemeChange={setTheme}
      onDensityChange={setDensity}
      onSyncEnabledChange={setSyncEnabled}
      onCloseAllRestoreSecondsChange={setCloseAllRestoreSeconds}
      onCloseAllHoldToConfirmChange={setCloseAllHoldToConfirm}
      onEditShortcuts={openKeyboardShortcuts}
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
