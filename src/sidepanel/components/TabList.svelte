<script lang="ts">
  import { get } from 'svelte/store';
  import type {
    PanelGroup,
    PanelTab,
    SectionUnitRef,
    SpaceIcon,
  } from '../../types';
  import { dragState } from '../dragState';
  import type { SectionEntry } from '../sectionOrder';
  import CloseAllBar from './CloseAllBar.svelte';
  import GroupHeader from './GroupHeader.svelte';
  import Icon from './Icon.svelte';
  import SpaceGlyph from './SpaceGlyph.svelte';
  import TabRow from './TabRow.svelte';

  type DropPosition = 'before' | 'after';

  interface GroupMemberRef {
    tabId?: number;
    homePinId?: string;
  }

  interface Props {
    pinnedEntries: SectionEntry[];
    unpinnedEntries: SectionEntry[];
    spaceName: string;
    spaceIcon: SpaceIcon;
    searching?: boolean;
    selectedKeys: Set<string>;
    copiedKey: string | null;
    onActivate: (tab: PanelTab) => void;
    onCreateTab: () => void;
    onSelect: (tab: PanelTab, mods: { toggle: boolean; range: boolean }) => void;
    onClose: (tabId: number) => void;
    onToggleMute: (tabId: number, muted: boolean) => void;
    onTogglePiP: (tabId: number) => void;
    onRename: (tab: PanelTab, alias: string) => void;
    onCreateHomePin: (tabId: number) => void;
    onRemoveHomePin: (homePinId: string) => void;
    onGoHome: (homePinId: string) => void;
    onContextMenu: (tab: PanelTab, x: number, y: number) => void;
    onGroupContextMenu: (group: PanelGroup, x: number, y: number) => void;
    onUpdateGroup: (
      groupId: string,
      updates: { title?: string; collapsed?: boolean },
    ) => void;
    onDropMember: (groupId: string, member: GroupMemberRef) => void;
    onRemoveFromGroup: (member: GroupMemberRef) => void;
    onCloseGroup: (groupId: string) => void;
    onPinGroup: (groupId: string) => void;
    onUnpinGroup: (groupId: string) => void;
    onOpenAllInGroup: (groupId: string) => void;
    onReorder: (
      dragged: SectionUnitRef,
      target: SectionUnitRef,
      position: DropPosition,
    ) => void;
    closeAllCount: number;
    closeAllPending: boolean;
    closeAllPendingCount: number;
    closeAllRestoreMs?: number;
    closeAllHoldToConfirm: boolean;
    onCloseAll: () => void;
    onRestoreClosed: () => void;
  }

  let {
    pinnedEntries,
    unpinnedEntries,
    spaceName,
    spaceIcon,
    searching = false,
    selectedKeys,
    copiedKey,
    onActivate,
    onCreateTab,
    onSelect,
    onClose,
    onToggleMute,
    onTogglePiP,
    onRename,
    onCreateHomePin,
    onRemoveHomePin,
    onGoHome,
    onContextMenu,
    onGroupContextMenu,
    onUpdateGroup,
    onDropMember,
    onRemoveFromGroup,
    onCloseGroup,
    onPinGroup,
    onUnpinGroup,
    onOpenAllInGroup,
    onReorder,
    closeAllCount,
    closeAllPending,
    closeAllPendingCount,
    closeAllRestoreMs,
    closeAllHoldToConfirm,
    onCloseAll,
    onRestoreClosed,
  }: Props = $props();

  let pinnedCollapsed = $state(false);

  // Which folder block is currently the drop target for a reorder, and on which
  // side, so the block can render the insertion line.
  let folderDropTarget = $state<{ id: string; position: DropPosition } | null>(
    null,
  );

  const hasPinnedSection = $derived(pinnedEntries.length > 0);

  // The "Close all" bar marks the loose-tab region and hosts the Close all /
  // Restore controls. Its divider is present whenever there are open loose tabs
  // (independent of panel focus), plus while a deferred close awaits restore (so
  // the Restore affordance persists).
  const showCloseAllBar = $derived(
    closeAllPending || unpinnedEntries.some((entry) => entry.kind === 'row'),
  );

  // A permanent "+ New Tab" affordance heads the loose-tab region. It's hidden
  // while searching, where the list is reserved for matches.
  const showNewTab = $derived(!searching);

  // A folder reorder/positioning targets the whole folder block (header + its
  // tabs), so the drop zone is large. Valid when another folder or a loose item
  // from the same section is being dragged.
  function folderReorderValid(group: PanelGroup): boolean {
    const drag = get(dragState);
    if (!drag || drag.pinned !== group.pinned) return false;
    if (drag.ref.kind === 'folder' && drag.ref.groupId === group.id) {
      return false;
    }
    return drag.ref.kind === 'folder' || drag.sourceGroupId === null;
  }

  function handleFolderBlockDragOver(event: DragEvent, group: PanelGroup) {
    if (!folderReorderValid(group)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const position: DropPosition =
      event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    folderDropTarget = { id: group.id, position };
  }

  function handleFolderBlockDragLeave(event: DragEvent) {
    const el = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (next && el.contains(next)) return;
    folderDropTarget = null;
  }

  function handleFolderBlockDrop(event: DragEvent, group: PanelGroup) {
    const valid = folderReorderValid(group);
    const drag = get(dragState);
    const position =
      folderDropTarget?.id === group.id ? folderDropTarget.position : 'after';
    folderDropTarget = null;
    if (!valid || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    onReorder(drag.ref, { kind: 'folder', groupId: group.id }, position);
    dragState.set(null);
  }

  // Dropping a row on empty list space pulls it out of whatever folder it was in
  // (a no-op for already-loose rows or folder drags).
  function handleRootDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const drag = get(dragState);
    folderDropTarget = null;
    dragState.set(null);
    if (!drag || drag.ref.kind === 'folder' || drag.sourceGroupId === null) {
      return;
    }
    if (drag.ref.kind === 'tab') onRemoveFromGroup({ tabId: drag.ref.tabId });
    else onRemoveFromGroup({ homePinId: drag.ref.homePinId });
  }
</script>

{#snippet tabRowItem(tab: PanelTab)}
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
    {onReorder}
  />
{/snippet}

{#snippet groupBlock(group: PanelGroup)}
  <div
    class="folder"
    class:collapsed={group.collapsed}
    class:dropBefore={folderDropTarget?.id === group.id &&
      folderDropTarget.position === 'before'}
    class:dropAfter={folderDropTarget?.id === group.id &&
      folderDropTarget.position === 'after'}
    role="presentation"
    ondragover={(event) => handleFolderBlockDragOver(event, group)}
    ondragleave={handleFolderBlockDragLeave}
    ondrop={(event) => handleFolderBlockDrop(event, group)}
  >
    <GroupHeader
      {group}
      {onUpdateGroup}
      {onDropMember}
      {onCloseGroup}
      {onPinGroup}
      {onUnpinGroup}
      {onOpenAllInGroup}
      onContextMenu={onGroupContextMenu}
    />
    {#if !group.collapsed && group.tabs.length > 0}
      <div class="section folder-tabs">
        {#each group.tabs as tab (tab.key)}
          {@render tabRowItem(tab)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div
  class="tab-list"
  role="presentation"
  ondragover={(event) => event.preventDefault()}
  ondrop={handleRootDrop}
>
  {#if hasPinnedSection}
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
        {#each pinnedEntries as entry (entry.kind === 'folder' ? entry.group.id : entry.tab.key)}
          {#if entry.kind === 'folder'}
            {@render groupBlock(entry.group)}
          {:else}
            {@render tabRowItem(entry.tab)}
          {/if}
        {/each}
      </div>
    {/if}
  {/if}

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

  {#if showNewTab || unpinnedEntries.length > 0}
    <div class="section default-section">
      {#if showNewTab}
        <button class="new-tab-row" type="button" onclick={onCreateTab} title="New tab">
          <span class="new-tab-icon" aria-hidden="true"><Icon name="plus" size={18} /></span>
          <span class="new-tab-label">New Tab</span>
        </button>
      {/if}

      {#each unpinnedEntries as entry (entry.kind === 'folder' ? entry.group.id : entry.tab.key)}
        {#if entry.kind === 'folder'}
          {@render groupBlock(entry.group)}
        {:else}
          {@render tabRowItem(entry.tab)}
        {/if}
      {/each}
    </div>
  {/if}

  {#if searching && pinnedEntries.length === 0 && unpinnedEntries.length === 0}
    <div class="empty">No matching tabs</div>
  {/if}
</div>

<style>
  .tab-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .default-section {
    padding-top: 4px;
  }

  .folder {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* Insertion line shown when reordering a folder before/after this block. */
  .folder.dropBefore::before,
  .folder.dropAfter::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    z-index: 2;
    height: 2px;
    border-radius: 999px;
    background: var(--accent-color);
    pointer-events: none;
  }

  .folder.dropBefore::before {
    top: -2px;
  }

  .folder.dropAfter::after {
    bottom: -2px;
  }

  /* A folder's tabs are indented beneath its header, with a vertical guide line
     so they read as the folder's contents. */
  .folder-tabs {
    margin-left: 13px;
    padding-left: 9px;
    border-left: 1px solid var(--border-color);
  }

  /* Permanent action row that mirrors a tab row's metrics so it sits flush with
     the real tabs beneath it. */
  .new-tab-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: var(--tab-row-min-height, 36px);
    padding: var(--tab-row-pad-y, 4px) 8px;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    text-align: left;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .new-tab-row:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .new-tab-icon {
    flex: 0 0 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
  }

  .new-tab-label {
    min-width: 0;
    font-size: var(--tab-title-font-size, 15px);
    font-weight: 400;
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
