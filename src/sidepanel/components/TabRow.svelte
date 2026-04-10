<script lang="ts">
  import type { ManagedTab, TabGroup } from '../../types';
  import { isAtHome } from '../../lib/url';
  import InlineEdit from './InlineEdit.svelte';

  interface Props {
    tab: ManagedTab;
    groups: TabGroup[];
    onUnpin: (id: string) => void;
    onRename: (id: string, name: string) => void;
    onGoHome: (id: string) => void;
    onReopen: (id: string) => void;
    onMoveToGroup: (tabId: string, groupId: string | null) => void;
  }

  let { tab, groups, onUnpin, onRename, onGoHome, onReopen, onMoveToGroup }: Props = $props();

  const isOpen = $derived(tab.tabId !== null);
  const atHome = $derived(isAtHome(tab.currentUrl, tab.homeUrl));
  const canGoHome = $derived(isOpen && !atHome);

  let faviconHovered = $state(false);

  function faviconSrc(): string {
    if (tab.faviconUrl) return tab.faviconUrl;
    try {
      return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.homeUrl)}&size=32`;
    } catch {
      return '';
    }
  }

  function handleFaviconClick() {
    if (canGoHome) {
      onGoHome(tab.id);
    } else if (!isOpen) {
      onReopen(tab.id);
    }
  }

  function focusTab() {
    if (tab.tabId) {
      chrome.tabs.update(tab.tabId, { active: true });
    }
  }
</script>

<div class="tab-row" class:closed={!isOpen}>
  <button
    class="favicon-btn"
    class:can-go-home={canGoHome}
    class:is-closed={!isOpen}
    onclick={handleFaviconClick}
    onmouseenter={() => {
      if (canGoHome || !isOpen) faviconHovered = true;
    }}
    onmouseleave={() => (faviconHovered = false)}
    disabled={isOpen && atHome}
    title={canGoHome ? 'Return to pinned URL' : !isOpen ? 'Reopen tab' : ''}
  >
    <img
      class="favicon-img"
      src={faviconSrc()}
      alt=""
      width="20"
      height="20"
      onerror={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  </button>

  <div
    class="title-area"
    class:shifted={faviconHovered}
    role="button"
    tabindex="0"
    onclick={focusTab}
    onkeydown={(e) => e.key === 'Enter' && focusTab()}
  >
    <div class="title-line">
      <InlineEdit
        value={tab.customName}
        onSave={(name) => onRename(tab.id, name)}
        className="tab-name"
      />
      {#if !atHome && tab.currentTitle && isOpen}
        <span class="page-title"> - {tab.currentTitle}</span>
      {/if}
    </div>
    {#if faviconHovered && canGoHome}
      <div class="caption">Return to pinned URL</div>
    {:else if faviconHovered && !isOpen}
      <div class="caption">Reopen tab</div>
    {/if}
  </div>

  <div class="actions">
    <span class="status-dot" class:open={isOpen}></span>

    <select
      class="group-select"
      value={tab.groupId ?? ''}
      onchange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        onMoveToGroup(tab.id, val || null);
      }}
      title="Assign to group"
    >
      <option value="">No group</option>
      {#each groups as group}
        <option value={group.id}>{group.name}</option>
      {/each}
    </select>

    <button class="unpin-btn" onclick={() => onUnpin(tab.id)} title="Unpin tab">
      ×
    </button>
  </div>
</div>

<style>
  .tab-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
    transition: background 0.15s;
  }

  .tab-row:hover {
    background: var(--bg-secondary);
  }

  .tab-row.closed {
    opacity: 0.6;
  }

  .favicon-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    padding: 4px;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      background 0.15s;
  }

  .favicon-btn.can-go-home:hover {
    transform: scale(1.15) translateY(-1px);
    box-shadow: var(--shadow-md);
    background: var(--bg-hover);
    cursor: pointer;
  }

  .favicon-btn.is-closed:hover {
    transform: scale(1.1);
    background: var(--bg-hover);
    cursor: pointer;
  }

  .favicon-btn:disabled {
    cursor: default;
  }

  .favicon-img {
    width: 20px;
    height: 20px;
    border-radius: 2px;
  }

  .title-area {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s ease;
  }

  .title-area.shifted {
    transform: translateY(-4px);
  }

  .title-line {
    display: flex;
    align-items: baseline;
    min-width: 0;
    overflow: hidden;
  }

  :global(.tab-name) {
    font-weight: 500;
    font-size: 13px;
    flex-shrink: 0;
  }

  .page-title {
    color: var(--text-secondary);
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .caption {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 1px;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--closed-color);
  }

  .status-dot.open {
    background: var(--success-color);
  }

  .group-select {
    font-size: 11px;
    padding: 2px 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-secondary);
    max-width: 80px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .tab-row:hover .group-select {
    opacity: 1;
  }

  .unpin-btn {
    font-size: 16px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.15s,
      color 0.15s;
  }

  .tab-row:hover .unpin-btn {
    opacity: 1;
  }

  .unpin-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
