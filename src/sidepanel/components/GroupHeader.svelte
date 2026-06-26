<script lang="ts">
  import { get } from 'svelte/store';
  import type { PanelGroup } from '../../types';
  import { visibleGroupTabs } from '../../lib/folderView';
  import { confirmDialog } from '../dialog';
  import { dragState } from '../dragState';
  import Icon from './Icon.svelte';

  interface GroupMembers {
    tabIds: number[];
    homePinIds: string[];
  }

  interface Props {
    group: PanelGroup;
    onUpdateGroup: (
      groupId: string,
      updates: { title?: string; collapsed?: boolean; peek?: boolean },
    ) => void;
    onDropMembers: (groupId: string, members: GroupMembers) => void;
    onCloseGroup: (groupId: string) => void;
    onPinGroup: (groupId: string) => void;
    onUnpinGroup: (groupId: string) => void;
    onOpenAllInGroup: (groupId: string) => void;
    onContextMenu: (group: PanelGroup, x: number, y: number) => void;
  }

  let {
    group,
    onUpdateGroup,
    onDropMembers,
    onCloseGroup,
    onPinGroup,
    onUnpinGroup,
    onOpenAllInGroup,
    onContextMenu,
  }: Props = $props();
  let dragActive = $state(false);

  // A pinned folder can have closed member pins to bulk-reopen; an unpinned
  // folder is always all-open (it dissolves when empty), so "open all" only
  // applies to pinned folders that currently have at least one closed pin.
  const hasClosedPins = $derived(
    group.pinned && group.tabs.some((tab) => !tab.isOpen),
  );
  const openTabCount = $derived(
    group.tabs.filter((tab) => tab.isOpen).length,
  );

  // Three folder states drive the glyph: open (folder-open), peeking a member
  // (folder-dot — collapsed but still showing its last-active tab), and fully
  // collapsed (folder). "Peeking" is whatever the shared view rule renders.
  const folderIcon = $derived(
    !group.collapsed
      ? 'folder-open'
      : visibleGroupTabs(group).length > 0
        ? 'folder-dot'
        : 'folder',
  );

  // The dragged rows that dropping on this header would add to this folder, or
  // null when none apply. Any non-folder row from another folder (or loose) is a
  // candidate — the backend converts as needed (a live tab pins into a pinned
  // folder; an open home pin becomes a live tab in an unpinned folder). Rows
  // already in this folder are skipped.
  function joinMembersFromDrag(): GroupMembers | null {
    const drag = get(dragState);
    if (!drag || drag.ref.kind === 'folder') return null;

    const members = drag.members ?? [
      { ref: drag.ref, sourceGroupId: drag.sourceGroupId },
    ];
    const tabIds: number[] = [];
    const homePinIds: string[] = [];
    for (const member of members) {
      if (member.sourceGroupId === group.id) continue;
      if (member.ref.kind === 'tab') tabIds.push(member.ref.tabId);
      else if (member.ref.kind === 'pin') homePinIds.push(member.ref.homePinId);
    }
    if (tabIds.length === 0 && homePinIds.length === 0) return null;
    return { tabIds, homePinIds };
  }

  // The header is the drag handle for reordering the folder. Reordering itself
  // is handled by the surrounding folder block (so the whole folder is a target).
  function handleDragStart(event: DragEvent) {
    dragState.set({
      ref: { kind: 'folder', groupId: group.id },
      pinned: group.pinned,
      sourceGroupId: group.id,
    });
    if (event.dataTransfer) {
      // A drag must carry some data to be valid; detection uses the store.
      event.dataTransfer.setData('text/plain', group.title);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragEnd() {
    dragState.set(null);
    dragActive = false;
  }

  function handleDragOver(event: DragEvent) {
    // Only a join (adding the dragged item to this folder) is handled here;
    // folder reorders are owned by the surrounding folder block. Stop the event
    // so the block doesn't also show a reorder line over the header.
    if (!joinMembersFromDrag()) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dragActive = true;
  }

  function handleDrop(event: DragEvent) {
    const members = joinMembersFromDrag();
    dragActive = false;
    if (!members) return;
    event.preventDefault();
    event.stopPropagation();
    onDropMembers(group.id, members);
  }

  function handleDragLeave(event: DragEvent) {
    const row = event.currentTarget as HTMLElement;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && row.contains(nextTarget)) return;
    dragActive = false;
  }

  // Collapsing while a member is active enters the persistent "peek" state, so
  // that tab keeps showing even after focus leaves the folder; collapsing with
  // no active member fully closes it. Expanding clears peek.
  function toggleCollapsed() {
    if (group.collapsed) {
      onUpdateGroup(group.id, { collapsed: false, peek: false });
    } else {
      onUpdateGroup(group.id, {
        collapsed: true,
        peek: group.tabs.some((tab) => tab.isActive),
      });
    }
  }

  // A plain click anywhere on the header (a drag fires no click, and right-click
  // raises a context menu rather than a click) toggles the folder. Action
  // buttons keep their own click behavior. Renaming lives in the context menu.
  function handleHeaderClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
    toggleCollapsed();
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(group, event.clientX, event.clientY);
  }

  async function closeGroup() {
    const confirmed = await confirmDialog({
      title: 'Close folder',
      message: `Close all ${openTabCount} tab${openTabCount === 1 ? '' : 's'} in "${group.title}"?`,
      confirmLabel: 'Close',
      danger: true,
    });
    if (confirmed) onCloseGroup(group.id);
  }
</script>

<div
  class="folder-header"
  class:dragActive
  class:pinned={group.pinned}
  role="presentation"
  draggable={true}
  onclick={handleHeaderClick}
  oncontextmenu={handleContextMenu}
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <button
    class="disclosure"
    onclick={toggleCollapsed}
    title={group.collapsed ? 'Expand folder' : 'Collapse folder'}
    aria-expanded={!group.collapsed}
  >
    <Icon name={folderIcon} size={18} />
  </button>

  <div class="name-wrap">
    <span class="folder-name">{group.title}</span>
  </div>

  <div class="actions">
    {#if group.pinned}
      {#if hasClosedPins}
        <button
          class="action-btn"
          onclick={() => onOpenAllInGroup(group.id)}
          title="Open all tabs in folder"
        >
          <Icon name="open-in-new" size={14} />
        </button>
      {/if}
      <button
        class="action-btn"
        onclick={() => onUnpinGroup(group.id)}
        title="Unpin folder"
      >
        <Icon name="pin-off" size={13} />
      </button>
    {:else}
      <button
        class="action-btn"
        onclick={() => onPinGroup(group.id)}
        title="Pin folder"
      >
        <Icon name="pin" size={13} />
      </button>
      <button class="action-btn" onclick={closeGroup} title="Close folder">
        <Icon name="x" size={15} />
      </button>
    {/if}
  </div>
</div>

<style>
  .folder-header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    cursor: default;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .folder-header:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .folder-header.dragActive {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  /* Mirror the tab row's favicon slot (28px at 8px left padding) so the folder
     icon lines up with the favicons of the tabs in the same section. */
  .disclosure {
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--accent-color);
  }

  .name-wrap {
    flex: 1;
    min-width: 0;
  }

  .folder-name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    /* Don't let the label capture the drag as a text selection, so dragging
       from the name area initiates the folder drag. */
    user-select: none;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    opacity: 0;
    transition:
      background 0.15s,
      color 0.15s,
      opacity 0.15s;
  }

  .action-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .folder-header:hover .action-btn {
    opacity: 1;
  }
</style>
