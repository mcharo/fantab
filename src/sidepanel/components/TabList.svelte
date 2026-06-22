<script lang="ts">
  import type {
    PanelGroup,
    PanelTab,
    SpaceIcon,
    TabGroupColor,
  } from '../../types';
  import CloseAllBar from './CloseAllBar.svelte';
  import GroupHeader from './GroupHeader.svelte';
  import Icon from './Icon.svelte';
  import SpaceGlyph from './SpaceGlyph.svelte';
  import TabRow from './TabRow.svelte';

  type DropPosition = 'before' | 'after';

  interface Props {
    homePins: PanelTab[];
    groups: PanelGroup[];
    ungroupedTabs: PanelTab[];
    spaceName: string;
    spaceIcon: SpaceIcon;
    topInset?: boolean;
    selectedKeys: Set<string>;
    copiedKey: string | null;
    onActivate: (tab: PanelTab) => void;
    onSelect: (tab: PanelTab, mods: { toggle: boolean; range: boolean }) => void;
    onClose: (tabId: number) => void;
    onToggleMute: (tabId: number, muted: boolean) => void;
    onTogglePiP: (tabId: number) => void;
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
    closeAllCount: number;
    closeAllPending: boolean;
    closeAllPendingCount: number;
    closeAllRestoreMs?: number;
    closeAllHoldToConfirm: boolean;
    onCloseAll: () => void;
    onRestoreClosed: () => void;
  }

  let {
    homePins,
    groups,
    ungroupedTabs,
    spaceName,
    spaceIcon,
    topInset = false,
    selectedKeys,
    copiedKey,
    onActivate,
    onSelect,
    onClose,
    onToggleMute,
    onTogglePiP,
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
    closeAllCount,
    closeAllPending,
    closeAllPendingCount,
    closeAllRestoreMs,
    closeAllHoldToConfirm,
    onCloseAll,
    onRestoreClosed,
  }: Props = $props();

  let pinnedCollapsed = $state(false);

  // The "Close all" bar replaces the old loose-tab separator: shown under the
  // same condition (loose tabs exist beneath a pinned/group section), plus while
  // a deferred close is awaiting restore (so the Restore affordance persists).
  const showCloseAllBar = $derived(
    closeAllPending ||
      (ungroupedTabs.length > 0 && (homePins.length > 0 || groups.length > 0)),
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
    <button
      class="section-header"
      aria-expanded={!pinnedCollapsed}
      onclick={() => (pinnedCollapsed = !pinnedCollapsed)}
      title={pinnedCollapsed ? `Expand ${spaceName}` : `Collapse ${spaceName}`}
    >
      <span class="section-glyph">
        <span class="glyph"><SpaceGlyph icon={spaceIcon} size={16} /></span>
        <span class="chevron">
          <Icon
            name={pinnedCollapsed ? 'chevron-right' : 'chevron-down'}
            size={14}
          />
        </span>
      </span>
      <span class="section-label">{spaceName}</span>
    </button>

    {#if !pinnedCollapsed}
      <div class="section">
        {#each homePins as tab (tab.key)}
          <TabRow
            {tab}
            selected={selectedKeys.has(tab.key)}
            copied={copiedKey === tab.key}
            {onActivate}
            {onSelect}
            {onClose}
            {onToggleMute}
            {onTogglePiP}
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
            selected={selectedKeys.has(tab.key)}
            copied={copiedKey === tab.key}
            {onActivate}
            {onSelect}
            {onClose}
            {onToggleMute}
            {onTogglePiP}
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

  {#if showCloseAllBar}
    <CloseAllBar
      count={closeAllCount}
      pending={closeAllPending}
      pendingCount={closeAllPendingCount}
      restoreMs={closeAllRestoreMs}
      holdToConfirm={closeAllHoldToConfirm}
      onConfirm={onCloseAll}
      onRestore={onRestoreClosed}
    />
  {/if}

  {#if ungroupedTabs.length > 0}
    <div class="section default-section">
      {#each ungroupedTabs as tab (tab.key)}
        <TabRow
          {tab}
          selected={selectedKeys.has(tab.key)}
          copied={copiedKey === tab.key}
          {onActivate}
          {onSelect}
          {onClose}
          {onToggleMute}
          {onTogglePiP}
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

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 8px 5px;
    text-align: left;
  }

  .section-glyph {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    color: var(--text-secondary);
  }

  .section-glyph .glyph,
  .section-glyph .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .section-glyph .chevron {
    display: none;
  }

  .section-header:hover .section-glyph .glyph {
    display: none;
  }

  .section-header:hover .section-glyph .chevron {
    display: flex;
  }

  .section-header:hover .section-glyph {
    color: var(--text-primary);
  }

  .section-label {
    min-width: 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .section-header:hover .section-label {
    color: var(--text-primary);
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
