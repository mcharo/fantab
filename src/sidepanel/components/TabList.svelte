<script lang="ts">
  import type { ManagedTab, TabGroup } from '../../types';
  import TabRow from './TabRow.svelte';
  import GroupHeader from './GroupHeader.svelte';

  interface Props {
    tabs: ManagedTab[];
    groups: TabGroup[];
    onUnpinTab: (id: string) => void;
    onRenameTab: (id: string, name: string) => void;
    onGoHome: (id: string) => void;
    onReopenTab: (id: string) => void;
    onCreateGroup: (name: string, color: string) => void;
    onUpdateGroup: (id: string, updates: { name?: string; color?: string }) => void;
    onDeleteGroup: (id: string) => void;
    onMoveToGroup: (tabId: string, groupId: string | null) => void;
  }

  let {
    tabs,
    groups,
    onUnpinTab,
    onRenameTab,
    onGoHome,
    onReopenTab,
    onCreateGroup,
    onUpdateGroup,
    onDeleteGroup,
    onMoveToGroup,
  }: Props = $props();

  let collapsedGroups = $state<Set<string>>(new Set());
  let showNewGroupForm = $state(false);
  let newGroupName = $state('');
  let newGroupColor = $state('#4285f4');

  const sortedGroups = $derived(
    [...groups].sort((a, b) => a.order - b.order),
  );

  const ungroupedTabs = $derived(
    tabs
      .filter((t) => t.groupId === null)
      .sort((a, b) => a.createdAt - b.createdAt),
  );

  function tabsForGroup(groupId: string): ManagedTab[] {
    return tabs
      .filter((t) => t.groupId === groupId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function toggleGroup(id: string) {
    const next = new Set(collapsedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsedGroups = next;
  }

  function submitNewGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    onCreateGroup(name, newGroupColor);
    newGroupName = '';
    newGroupColor = '#4285f4';
    showNewGroupForm = false;
  }

  const GROUP_COLORS = [
    '#4285f4',
    '#34a853',
    '#fbbc04',
    '#ea4335',
    '#a142f4',
    '#24c1e0',
    '#f538a0',
    '#5f6368',
  ];
</script>

<div class="tab-list">
  {#each sortedGroups as group (group.id)}
    {@const groupTabs = tabsForGroup(group.id)}
    <GroupHeader
      {group}
      collapsed={collapsedGroups.has(group.id)}
      onToggle={() => toggleGroup(group.id)}
      {onUpdateGroup}
      {onDeleteGroup}
    />
    {#if !collapsedGroups.has(group.id)}
      {#if groupTabs.length === 0}
        <div class="empty-group">No tabs in this group</div>
      {:else}
        {#each groupTabs as tab (tab.id)}
          <TabRow
            {tab}
            {groups}
            onUnpin={onUnpinTab}
            onRename={onRenameTab}
            {onGoHome}
            onReopen={onReopenTab}
            {onMoveToGroup}
          />
        {/each}
      {/if}
    {/if}
  {/each}

  {#if ungroupedTabs.length > 0}
    {#if sortedGroups.length > 0}
      <div class="section-label">Ungrouped</div>
    {/if}
    {#each ungroupedTabs as tab (tab.id)}
      <TabRow
        {tab}
        {groups}
        onUnpin={onUnpinTab}
        onRename={onRenameTab}
        {onGoHome}
        onReopen={onReopenTab}
        {onMoveToGroup}
      />
    {/each}
  {/if}

  <div class="add-group-section">
    {#if showNewGroupForm}
      <form
        class="new-group-form"
        onsubmit={(e) => {
          e.preventDefault();
          submitNewGroup();
        }}
      >
        <input
          bind:value={newGroupName}
          placeholder="Group name"
          class="group-name-input"
        />
        <div class="color-picker">
          {#each GROUP_COLORS as color}
            <button
              type="button"
              class="color-swatch"
              class:selected={newGroupColor === color}
              style="background: {color}"
              onclick={() => (newGroupColor = color)}
              aria-label="Color {color}"
            ></button>
          {/each}
        </div>
        <div class="form-actions">
          <button type="submit" class="save-btn">Create</button>
          <button
            type="button"
            class="cancel-btn"
            onclick={() => (showNewGroupForm = false)}
          >
            Cancel
          </button>
        </div>
      </form>
    {:else}
      <button
        class="add-group-btn"
        onclick={() => (showNewGroupForm = true)}
      >
        + New Group
      </button>
    {/if}
  </div>
</div>

<style>
  .tab-list {
    flex: 1;
    overflow-y: auto;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 12px 12px 4px;
  }

  .empty-group {
    padding: 8px 12px 8px 42px;
    font-size: 12px;
    color: var(--text-tertiary);
    font-style: italic;
  }

  .add-group-section {
    padding: 8px 12px;
    border-top: 1px solid var(--border-color);
  }

  .add-group-btn {
    color: var(--accent-color);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 0;
  }

  .add-group-btn:hover {
    text-decoration: underline;
  }

  .new-group-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-name-input {
    padding: 6px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    outline: none;
  }

  .group-name-input:focus {
    border-color: var(--accent-color);
  }

  .color-picker {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }

  .color-swatch.selected {
    border-color: var(--text-primary);
    transform: scale(1.15);
  }

  .color-swatch:hover {
    transform: scale(1.15);
  }

  .form-actions {
    display: flex;
    gap: 8px;
  }

  .save-btn {
    padding: 4px 12px;
    background: var(--accent-color);
    color: #fff;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 500;
  }

  .save-btn:hover {
    background: var(--accent-hover);
  }

  .cancel-btn {
    padding: 4px 12px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .cancel-btn:hover {
    color: var(--text-primary);
  }
</style>
