<script lang="ts">
  import type { TabGroup } from '../../types';
  import InlineEdit from './InlineEdit.svelte';

  interface Props {
    group: TabGroup;
    collapsed: boolean;
    onToggle: () => void;
    onUpdateGroup: (id: string, updates: { name?: string; color?: string }) => void;
    onDeleteGroup: (id: string) => void;
  }

  let { group, collapsed, onToggle, onUpdateGroup, onDeleteGroup }: Props = $props();
</script>

<div class="group-header">
  <button class="toggle-btn" onclick={onToggle} aria-label={collapsed ? 'Expand' : 'Collapse'}>
    <span class="chevron" class:collapsed>{collapsed ? '▶' : '▼'}</span>
  </button>

  <span class="color-dot" style="background: {group.color}"></span>

  <div class="group-name-wrap">
    <InlineEdit
      value={group.name}
      onSave={(name) => onUpdateGroup(group.id, { name })}
      className="group-name"
    />
  </div>

  <button
    class="delete-btn"
    onclick={() => onDeleteGroup(group.id)}
    title="Delete group (tabs move to ungrouped)"
  >
    ×
  </button>
</div>

<style>
  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px 4px;
  }

  .toggle-btn {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--text-secondary);
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .group-name-wrap {
    flex: 1;
    min-width: 0;
  }

  :global(.group-name) {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .delete-btn {
    font-size: 14px;
    color: var(--text-tertiary);
    opacity: 0;
    transition:
      opacity 0.15s,
      color 0.15s;
  }

  .group-header:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--text-primary);
  }
</style>
