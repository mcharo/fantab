<script lang="ts">
  import type { PanelGroup, TabGroupColor } from '../../types';
  import { confirmDialog } from '../dialog';
  import Icon from './Icon.svelte';
  import InlineEdit from './InlineEdit.svelte';

  interface Props {
    group: PanelGroup;
    onUpdateGroup: (
      groupId: number,
      updates: { title?: string; color?: TabGroupColor; collapsed?: boolean },
    ) => void;
    onDropTab: (tabId: number, groupId: number) => void;
    onCloseGroup: (groupId: number) => void;
  }

  let { group, onUpdateGroup, onDropTab, onCloseGroup }: Props = $props();
  let dragActive = $state(false);

  const GROUP_COLORS: TabGroupColor[] = [
    'blue',
    'cyan',
    'green',
    'grey',
    'orange',
    'pink',
    'purple',
    'red',
    'yellow',
  ];

  const colorSwatches: Record<TabGroupColor, string> = {
    blue: '#4285f4',
    cyan: '#24c1e0',
    green: '#34a853',
    grey: '#5f6368',
    orange: '#fbbc04',
    pink: '#f538a0',
    purple: '#a142f4',
    red: '#ea4335',
    yellow: '#fdd663',
  };

  function parseDragPayload(event: DragEvent): { type: 'tab'; tabId: number } | null {
    try {
      const payload = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '');
      return payload.type === 'tab' && typeof payload.tabId === 'number'
        ? payload
        : null;
    } catch {
      return null;
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragActive = false;
    const payload = parseDragPayload(event);
    if (payload) onDropTab(payload.tabId, group.id);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dragActive = true;
  }

  function handleDragLeave(event: DragEvent) {
    const row = event.currentTarget as HTMLElement;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && row.contains(nextTarget)) return;
    dragActive = false;
  }

  async function closeGroup() {
    const confirmed = await confirmDialog({
      title: 'Close group',
      message: `Close all ${group.tabs.length} tab${group.tabs.length === 1 ? '' : 's'} in "${group.title}"?`,
      confirmLabel: 'Close',
      danger: true,
    });
    if (confirmed) onCloseGroup(group.id);
  }
</script>

<div
  class="group-header"
  class:dragActive
  role="presentation"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <button
    class="toggle-btn"
    onclick={() => onUpdateGroup(group.id, { collapsed: !group.collapsed })}
    title={group.collapsed ? 'Expand group' : 'Collapse group'}
  >
    <Icon name={group.collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
  </button>

  <span
    class="color-dot"
    style="background: {colorSwatches[group.color]}"
  ></span>

  <div class="name-wrap">
    <InlineEdit
      value={group.title}
      onSave={(title) => onUpdateGroup(group.id, { title })}
      className="group-name"
    />
  </div>

  <select
    class="color-select"
    value={group.color}
    onchange={(event) =>
      onUpdateGroup(group.id, {
        color: (event.target as HTMLSelectElement).value as TabGroupColor,
      })}
    title="Group color"
  >
    {#each GROUP_COLORS as color}
      <option value={color}>{color}</option>
    {/each}
  </select>

  <button class="close-btn" onclick={closeGroup} title="Close group">
    <Icon name="x" size={15} />
  </button>
</div>

<style>
  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 8px 4px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    transition:
      background 0.15s,
      color 0.15s;
  }

  .group-header.dragActive {
    background: var(--bg-secondary);
    color: var(--text-primary);
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

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .name-wrap {
    flex: 1;
    min-width: 0;
  }

  :global(.group-name) {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .color-select {
    width: 68px;
    height: 24px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .close-btn {
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

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .group-header:hover .color-select,
  .group-header:hover .close-btn {
    opacity: 1;
  }
</style>
