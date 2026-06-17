<script lang="ts">
  interface Props {
    searchQuery: string;
    searchOpen?: boolean;
    onSearchChange: (query: string) => void;
    onOpenSettings: () => void;
    onCreateTab: () => void;
    onCreateGroup: () => void;
    canCreateGroup: boolean;
  }

  import Icon from './Icon.svelte';

  let {
    searchQuery,
    searchOpen = $bindable(false),
    onSearchChange,
    onOpenSettings,
    onCreateTab,
    onCreateGroup,
    canCreateGroup,
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

<header class="header" class:floating={!showSearch} class:docked={showSearch}>
  <div class="top-row">
    <div class="actions">
      <button
        class="icon-btn"
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
      <button class="icon-btn" onclick={onOpenSettings} title="Settings">
        <Icon name="settings" size={17} />
      </button>
      <button
        class="icon-btn"
        onclick={onCreateGroup}
        disabled={!canCreateGroup}
        title="New group from active tab"
      >
        <Icon name="new-group" size={17} />
      </button>
      <button class="icon-btn" onclick={onCreateTab} title="New tab">
        <Icon name="plus" size={18} />
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
  .header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 8px;
    flex-shrink: 0;
  }

  /* Idle: float the buttons over the top-right corner so they reserve no
     vertical space and the tab list starts at the very top. The empty area
     lets clicks fall through to the content beneath. */
  .header.floating {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    pointer-events: none;
  }

  .header.floating .actions {
    pointer-events: auto;
  }

  /* Searching: dock as a normal band that pushes the list down, keeping the
     search field and its results fully visible. */
  .header.docked {
    position: relative;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
  }

  .top-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    width: 28px;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .icon-btn:hover,
  .icon-btn.active {
    background: var(--bg-hover);
  }

  .icon-btn:disabled {
    cursor: default;
    opacity: 0.35;
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
