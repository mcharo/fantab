<script lang="ts">
  import { getFaviconUrl } from '../../lib/url';
  import type { PanelTab } from '../../types';
  import Icon from './Icon.svelte';
  import InlineEdit from './InlineEdit.svelte';

  type DropPosition = 'before' | 'after';
  type DragPayload =
    | { type: 'homePin'; homePinId: string }
    | {
        type: 'tab';
        tabId: number;
        sourceIndex?: number;
        sourceWindowId?: number | null;
      };

  interface Props {
    tab: PanelTab;
    selected: boolean;
    onActivate: (tab: PanelTab) => void;
    onClose: (tabId: number) => void;
    onRename: (tab: PanelTab, alias: string) => void;
    onCreateHomePin: (tabId: number) => void;
    onRemoveHomePin: (homePinId: string) => void;
    onGoHome: (homePinId: string) => void;
    onContextMenu: (tab: PanelTab, x: number, y: number) => void;
    onTabDrop: (draggedTabId: number, targetIndex: number) => void;
    onHomePinDrop: (
      homePinId: string,
      targetHomePinId: string,
      position: DropPosition,
    ) => void;
  }

  let {
    tab,
    selected,
    onActivate,
    onClose,
    onRename,
    onCreateHomePin,
    onRemoveHomePin,
    onGoHome,
    onContextMenu,
    onTabDrop,
    onHomePinDrop,
  }: Props = $props();

  const canGoHome = $derived(tab.isHomePin && tab.isOpen && !tab.atHome);
  const canClose = $derived(tab.isOpen && tab.tabId !== null);
  const proxiedFaviconUrl = $derived(safeFaviconUrl(tab.url));

  let faviconMode = $state<'direct' | 'proxy' | 'fallback'>('proxy');
  let dropPosition = $state<DropPosition | null>(null);

  const renderedFaviconUrl = $derived(
    faviconMode === 'direct'
      ? tab.faviconUrl
      : faviconMode === 'proxy'
        ? proxiedFaviconUrl
        : '',
  );

  $effect(() => {
    tab.key;
    tab.faviconUrl;
    tab.url;
    faviconMode = tab.faviconUrl ? 'direct' : 'proxy';
  });

  function safeFaviconUrl(pageUrl: string): string {
    if (!pageUrl) return '';

    try {
      return getFaviconUrl(pageUrl);
    } catch {
      return '';
    }
  }

  function handleFaviconError() {
    if (faviconMode === 'direct' && proxiedFaviconUrl) {
      faviconMode = 'proxy';
      return;
    }

    faviconMode = 'fallback';
  }

  function dragPayload(): string {
    if (tab.isHomePin && tab.homePinId) {
      return JSON.stringify({ type: 'homePin', homePinId: tab.homePinId });
    }
    return JSON.stringify({
      type: 'tab',
      tabId: tab.tabId,
      sourceIndex: tab.index,
      sourceWindowId: tab.windowId,
    });
  }

  function rowDropPosition(event: DragEvent): DropPosition {
    const row = event.currentTarget as HTMLElement;
    const rect = row.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function targetTabIndex(payload: Extract<DragPayload, { type: 'tab' }>): number {
    const position = dropPosition ?? 'before';
    let insertIndex = tab.index + (position === 'after' ? 1 : 0);

    if (
      payload.sourceWindowId === tab.windowId &&
      typeof payload.sourceIndex === 'number' &&
      payload.sourceIndex < insertIndex
    ) {
      insertIndex -= 1;
    }

    return Math.max(0, insertIndex);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dropPosition = rowDropPosition(event);
  }

  function handleDragLeave(event: DragEvent) {
    const row = event.currentTarget as HTMLElement;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && row.contains(nextTarget)) return;
    dropPosition = null;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const position = dropPosition ?? rowDropPosition(event);
    dropPosition = null;

    const payload = parseDragPayload(event);
    if (!payload) return;

    if (
      payload.type === 'homePin' &&
      tab.isHomePin &&
      tab.homePinId &&
      payload.homePinId !== tab.homePinId
    ) {
      onHomePinDrop(payload.homePinId, tab.homePinId, position);
    }

    if (payload.type === 'tab' && tab.tabId !== null && payload.tabId !== tab.tabId) {
      onTabDrop(payload.tabId, targetTabIndex(payload));
    }
  }

  function handleRowClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.tools')) return;
    if (event.altKey) {
      openContextMenu(event);
      return;
    }
    onActivate(tab);
  }

  function openContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(tab, event.clientX, event.clientY);
  }

  function handleRowKeydown(event: KeyboardEvent) {
    // Only handle keys aimed at the row itself; ignore events bubbling up from
    // the inline-rename input, otherwise Space/Enter get hijacked while typing.
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onActivate(tab);
  }

  function reloadPinnedUrl(event: MouseEvent) {
    event.stopPropagation();
    if (!tab.homePinId) return;

    if (tab.isOpen) onGoHome(tab.homePinId);
    else onActivate(tab);
  }

  function parseDragPayload(event: DragEvent): DragPayload | null {
    try {
      const payload = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '');
      if (payload.type === 'homePin' && typeof payload.homePinId === 'string') {
        return payload;
      }
      if (payload.type === 'tab' && typeof payload.tabId === 'number') {
        return {
          type: 'tab',
          tabId: payload.tabId,
          sourceIndex:
            typeof payload.sourceIndex === 'number'
              ? payload.sourceIndex
              : undefined,
          sourceWindowId:
            typeof payload.sourceWindowId === 'number'
              ? payload.sourceWindowId
              : null,
        };
      }
    } catch {
      return null;
    }

    return null;
  }
</script>

<div
  class="tab-row"
  class:selected
  class:active={tab.isActive}
  class:closed={!tab.isOpen}
  class:dropBefore={dropPosition === 'before'}
  class:dropAfter={dropPosition === 'after'}
  draggable={tab.isOpen || tab.isHomePin}
  ondragstart={(event) => {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', dragPayload());
    event.dataTransfer.setData('fantab/key', tab.key);
    event.dataTransfer.effectAllowed = 'move';
  }}
  ondragend={() => (dropPosition = null)}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onclick={handleRowClick}
  oncontextmenu={openContextMenu}
  onkeydown={handleRowKeydown}
  role="button"
  tabindex="0"
>
  <button
    class="favicon-btn"
    class:home-action={canGoHome}
    onclick={(event) => {
      event.stopPropagation();
      if (canGoHome && tab.homePinId) onGoHome(tab.homePinId);
      else onActivate(tab);
    }}
    title={canGoHome ? 'Return to home URL' : tab.isOpen ? 'Activate tab' : 'Reopen home pin'}
  >
    {#if renderedFaviconUrl}
      <img
        class="favicon"
        src={renderedFaviconUrl}
        alt=""
        width="18"
        height="18"
        onerror={handleFaviconError}
      />
    {:else if tab.isHomePin}
      <span class="fallback-pin"><Icon name="pin" size={15} /></span>
    {:else}
      <span class="fallback-icon">•</span>
    {/if}
  </button>

  <div class="main">
    <div class="title-line">
      <InlineEdit
        value={tab.displayName}
        onSave={(alias) => onRename(tab, alias)}
        className="tab-name"
      />
    </div>
  </div>

  <div class="tools">
    {#if tab.isAudible}
      <span class="audio-dot" title={tab.isMuted ? 'Muted' : 'Audible'}></span>
    {/if}

    {#if tab.isHomePin && tab.homePinId}
      <button
        class="tool-btn"
        onclick={reloadPinnedUrl}
        title={tab.isOpen ? 'Reload pinned URL' : 'Open pinned URL'}
      >
        <Icon name="refresh" size={14} />
      </button>
      <button
        class="tool-btn"
        onclick={(event) => {
          event.stopPropagation();
          onRemoveHomePin(tab.homePinId!);
        }}
        title="Remove home pin"
      >
        <Icon name="pin-off" size={15} />
      </button>
    {:else if tab.tabId !== null}
      <button
        class="tool-btn"
        onclick={(event) => {
          event.stopPropagation();
          onCreateHomePin(tab.tabId!);
        }}
        title="Pin as home"
      >
        <Icon name="pin" size={15} />
      </button>
    {/if}

    {#if canClose}
      <button
        class="tool-btn"
        onclick={(event) => {
          event.stopPropagation();
          onClose(tab.tabId!);
        }}
        title="Close tab"
      >
        <Icon name="x" size={15} />
      </button>
    {/if}
  </div>
</div>

<style>
  .tab-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 4px 8px;
    border-radius: 999px;
    cursor: default;
    transition:
      background 0.15s,
      opacity 0.15s;
  }

  .tab-row:hover,
  .tab-row.selected {
    background: var(--bg-secondary);
  }

  .tab-row.active {
    background: var(--active-bg);
  }

  .tab-row.closed {
    opacity: 0.6;
  }

  .tab-row.dropBefore::before,
  .tab-row.dropAfter::after {
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

  .tab-row.dropBefore::before {
    top: -1px;
  }

  .tab-row.dropAfter::after {
    bottom: -1px;
  }

  .favicon-btn {
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
  }

  .favicon-btn:hover,
  .favicon-btn.home-action {
    background: var(--bg-hover);
  }

  .favicon {
    width: 18px;
    height: 18px;
    border-radius: 3px;
  }

  .fallback-icon {
    color: var(--text-tertiary);
    font-size: 16px;
  }

  .fallback-pin {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
  }

  .main {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
  }

  .title-line {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
  }

  :global(.tab-name) {
    font-size: 15px;
    font-weight: 500;
    min-width: 0;
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .tab-row:hover .tools,
  .tab-row.selected .tools {
    opacity: 1;
  }

  .tool-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 14px;
  }

  .tool-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .audio-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success-color);
  }
</style>
