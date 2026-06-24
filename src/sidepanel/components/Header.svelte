<script lang="ts">
  interface Props {
    searchQuery: string;
    searchOpen?: boolean;
    onSearchChange: (query: string) => void;
    onOpenSettings: () => void;
    onCollapse: () => void;
  }

  import Icon from './Icon.svelte';

  let {
    searchQuery,
    searchOpen = $bindable(false),
    onSearchChange,
    onOpenSettings,
    onCollapse,
  }: Props = $props();

  let searchInput: HTMLInputElement | undefined = $state(undefined);

  const showSearch = $derived(searchOpen || searchQuery.trim().length > 0);

  function toggleSearch() {
    if (showSearch) {
      searchOpen = false;
      onSearchChange('');
      return;
    }

    searchOpen = true;
    requestAnimationFrame(() => searchInput?.focus());
  }
</script>

<header class="toolbar">
  <div class="bar">
    <div class="cluster">
      <button class="tool-btn" onclick={onCollapse} title="Collapse sidebar">
        <Icon name="sidebar" size={17} />
      </button>
      <button class="tool-btn" onclick={onOpenSettings} title="Settings">
        <Icon name="settings" size={17} />
      </button>
      <button
        class="tool-btn"
        class:active={showSearch}
        onclick={toggleSearch}
        title={showSearch ? 'Close search' : 'Search tabs'}
      >
        {#if showSearch}
          <Icon name="x" size={17} />
        {:else}
          <Icon name="search" size={17} />
        {/if}
      </button>
    </div>
  </div>

  {#if showSearch}
    <input
      bind:this={searchInput}
      class="search"
      type="search"
      value={searchQuery}
      placeholder="Search tabs"
      oninput={(event) =>
        onSearchChange((event.target as HTMLInputElement).value)}
      onkeydown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          searchOpen = false;
          onSearchChange('');
        }
      }}
    />
  {/if}
</header>

<style>
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 8px;
    flex-shrink: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .cluster {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  /* Icon-only: no chrome at rest, the rounded button shape fades in on hover. */
  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    width: 28px;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    transition: background 0.12s ease;
  }

  .tool-btn:hover,
  .tool-btn.active {
    background: var(--bg-hover);
  }

  .search {
    width: 100%;
    height: 30px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
    padding: 0 9px;
  }

  .search:focus {
    border-color: var(--accent-color);
  }
</style>
