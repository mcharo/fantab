<script lang="ts">
  import type { PanelGroup, PanelTab, TabGroupColor } from '../../types';
  import GroupHeader from './GroupHeader.svelte';
  import Icon from './Icon.svelte';
  import TabRow from './TabRow.svelte';

  type DropPosition = 'before' | 'after';

  interface Props {
    homePins: PanelTab[];
    groups: PanelGroup[];
    ungroupedTabs: PanelTab[];
    topInset?: boolean;
    selectedKey: string | null;
    copiedKey: string | null;
    onActivate: (tab: PanelTab) => void;
    onClose: (tabId: number) => void;
    onRename: (tab: PanelTab, alias: string) => void;
    onCreateHomePin: (tabId: number) => void;
    onRemoveHomePin: (homePinId: string) => void;
    onGoHome: (homePinId: string) => void;
    onContextMenu: (tab: PanelTab, x: number, y: number) => void;
    onMoveToGroup: (tabId: number, groupId: number) => void;
    onUngroup: (tabId: number) => void;
    onCloseGroup: (groupId: number) => void;
    onUpdateGroup: (
      groupId: number,
      updates: { title?: string; color?: TabGroupColor; collapsed?: boolean },
    ) => void;
    onMoveTab: (tabId: number, index: number) => void;
    onMoveHomePin: (homePinId: string, index: number) => void;
  }

  let {
    homePins,
    groups,
    ungroupedTabs,
    topInset = false,
    selectedKey,
    copiedKey,
    onActivate,
    onClose,
    onRename,
    onCreateHomePin,
    onRemoveHomePin,
    onGoHome,
    onContextMenu,
    onMoveToGroup,
    onUngroup,
    onCloseGroup,
    onUpdateGroup,
    onMoveTab,
    onMoveHomePin,
  }: Props = $props();

  let pinnedCollapsed = $state(false);

  const showDefaultSeparator = $derived(
    ungroupedTabs.length > 0 && (homePins.length > 0 || groups.length > 0),
  );

  function homePinDropIndex(targetHomePinId: string): number {
    return homePins.findIndex((tab) => tab.homePinId === targetHomePinId);
  }

  function handleHomePinDrop(
    homePinId: string,
    targetHomePinId: string,
    position: DropPosition,
  ) {
    const currentIndex = homePins.findIndex((tab) => tab.homePinId === homePinId);
    const targetIndex = homePinDropIndex(targetHomePinId);
    if (currentIndex < 0 || targetIndex < 0) return;

    let insertIndex = targetIndex + (position === 'after' ? 1 : 0);
    if (currentIndex < insertIndex) insertIndex -= 1;

    if (currentIndex !== insertIndex) onMoveHomePin(homePinId, insertIndex);
  }

  function parseTabDragPayload(event: DragEvent): number | null {
    try {
      const payload = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '');
      return payload.type === 'tab' && typeof payload.tabId === 'number'
        ? payload.tabId
        : null;
    } catch {
      return null;
    }
  }

  function handleUngroupedDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const tabId = parseTabDragPayload(event);
    if (tabId !== null) onUngroup(tabId);
  }
</script>

<div
  class="tab-list"
  class:topInset
  role="presentation"
  ondragover={(event) => event.preventDefault()}
  ondrop={handleUngroupedDrop}
>
  {#if homePins.length > 0}
    <div class="section-header">
      <button
        class="toggle-btn"
        onclick={() => (pinnedCollapsed = !pinnedCollapsed)}
        title={pinnedCollapsed ? 'Expand pinned' : 'Collapse pinned'}
      >
        <Icon name={pinnedCollapsed ? 'chevron-right' : 'chevron-down'} size={14} />
      </button>
      <div class="section-label">Pinned</div>
    </div>

    {#if !pinnedCollapsed}
      <div class="section">
        {#each homePins as tab (tab.key)}
          <TabRow
            {tab}
            selected={selectedKey === tab.key}
            copied={copiedKey === tab.key}
            {onActivate}
            {onClose}
            {onRename}
            {onCreateHomePin}
            {onRemoveHomePin}
            {onGoHome}
            {onContextMenu}
            onTabDrop={onMoveTab}
            onHomePinDrop={handleHomePinDrop}
          />
        {/each}
      </div>
    {/if}
  {/if}

  {#each groups as group (group.id)}
    <GroupHeader
      {group}
      {onUpdateGroup}
      onDropTab={onMoveToGroup}
      {onCloseGroup}
    />
    {#if !group.collapsed}
      <div class="section">
        {#each group.tabs as tab (tab.key)}
          <TabRow
            {tab}
            selected={selectedKey === tab.key}
            copied={copiedKey === tab.key}
            {onActivate}
            {onClose}
            {onRename}
            {onCreateHomePin}
            {onRemoveHomePin}
            {onGoHome}
            {onContextMenu}
            onTabDrop={onMoveTab}
            onHomePinDrop={handleHomePinDrop}
          />
        {/each}
      </div>
    {/if}
  {/each}

  {#if ungroupedTabs.length > 0}
    {#if showDefaultSeparator}
      <div class="default-separator" role="presentation"></div>
    {/if}

    <div class="section default-section">
      {#each ungroupedTabs as tab (tab.key)}
        <TabRow
          {tab}
          selected={selectedKey === tab.key}
          copied={copiedKey === tab.key}
          {onActivate}
          {onClose}
          {onRename}
          {onCreateHomePin}
          {onRemoveHomePin}
          {onGoHome}
          {onContextMenu}
          onTabDrop={onMoveTab}
          onHomePinDrop={handleHomePinDrop}
        />
      {/each}
    </div>
  {/if}

  {#if homePins.length === 0 && groups.length === 0 && ungroupedTabs.length === 0}
    <div class="empty">No matching tabs</div>
  {/if}
</div>

<style>
  .tab-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  /* Clear the floating header buttons when there's no PINNED section to share
     their row. */
  .tab-list.topInset {
    padding-top: 40px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .default-section {
    padding-top: 4px;
  }

  .default-separator {
    height: 1px;
    margin: 12px 8px 7px;
    background: var(--border-color);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 8px 5px;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }

  .toggle-btn:hover {
    background: var(--bg-hover);
  }

  .section-label {
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    color: var(--text-secondary);
    font-size: 12px;
  }
</style>
