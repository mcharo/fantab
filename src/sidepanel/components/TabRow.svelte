<script lang="ts">
  import { get } from 'svelte/store';
  import { getFaviconUrl } from '../../lib/url';
  import type { PanelTab, SectionUnitRef } from '../../types';
  import { dragState } from '../dragState';
  import Icon from './Icon.svelte';
  import InlineEdit from './InlineEdit.svelte';

  type DropPosition = 'before' | 'after';

  interface Props {
    tab: PanelTab;
    selected: boolean;
    copied?: boolean;
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
    onReorder: (
      dragged: SectionUnitRef,
      target: SectionUnitRef,
      position: DropPosition,
    ) => void;
  }

  let {
    tab,
    selected,
    copied = false,
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
    onReorder,
  }: Props = $props();

  // This row as a reorder unit: a loose/member home pin, or a live tab.
  function selfRef(): SectionUnitRef {
    return tab.isHomePin
      ? { kind: 'pin', homePinId: tab.homePinId as string }
      : { kind: 'tab', tabId: tab.tabId as number };
  }

  // Whether the active drag can reorder relative to this row. Loose rows accept
  // any same-section unit (a folder, or a loose item); a folder member row only
  // accepts a sibling from the same folder (intra-folder reordering).
  function reorderTargetValid(): boolean {
    const drag = get(dragState);
    if (!drag || drag.pinned !== tab.isHomePin) return false;
    const self = selfRef();
    if (
      drag.ref.kind === self.kind &&
      ((self.kind === 'pin' &&
        drag.ref.kind === 'pin' &&
        drag.ref.homePinId === self.homePinId) ||
        (self.kind === 'tab' &&
          drag.ref.kind === 'tab' &&
          drag.ref.tabId === self.tabId))
    ) {
      return false; // dropping on itself
    }
    if (tab.groupId === null) {
      return drag.ref.kind === 'folder' || drag.sourceGroupId === null;
    }
    return drag.ref.kind !== 'folder' && drag.sourceGroupId === tab.groupId;
  }

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

  function handleDragStart(event: DragEvent) {
    dragState.set({
      ref: selfRef(),
      pinned: tab.isHomePin,
      sourceGroupId: tab.groupId,
    });
    if (event.dataTransfer) {
      // Some data is required for a valid drag; detection uses the store.
      event.dataTransfer.setData('text/plain', tab.key);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function rowDropPosition(event: DragEvent): DropPosition {
    const row = event.currentTarget as HTMLElement;
    const rect = row.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function handleDragOver(event: DragEvent) {
    // Only same-container reorders highlight here; folder reorders relative to
    // this row's folder block (and invalid drags) fall through to bubble.
    if (!reorderTargetValid()) return;
    event.preventDefault();
    event.stopPropagation();
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
    if (!reorderTargetValid()) return;
    const drag = get(dragState);
    event.preventDefault();
    event.stopPropagation();
    const position = dropPosition ?? rowDropPosition(event);
    dropPosition = null;
    if (drag) onReorder(drag.ref, selfRef(), position);
  }

  function handleRowClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.tools')) return;
    if (event.altKey) {
      openContextMenu(event);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault();
      onSelect(tab, {
        toggle: event.metaKey || event.ctrlKey,
        range: event.shiftKey,
      });
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

</script>

<div
  class="tab-row"
  class:selected
  class:active={tab.isActive}
  class:copied
  class:closed={!tab.isOpen}
  class:dropBefore={dropPosition === 'before'}
  class:dropAfter={dropPosition === 'after'}
  draggable={tab.isOpen || tab.isHomePin}
  ondragstart={handleDragStart}
  ondragend={() => {
    dragState.set(null);
    dropPosition = null;
  }}
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
      {#if tab.isAudible && tab.tabId !== null}
        <button
          class="audio-btn"
          class:muted={tab.isMuted}
          onclick={(event) => {
            event.stopPropagation();
            onToggleMute(tab.tabId!, !tab.isMuted);
            (event.currentTarget as HTMLButtonElement).blur();
          }}
          title={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
        >
          {#if tab.isMuted}
            <Icon name="volume-x" size={15} />
          {:else}
            <span class="audio-dot"></span>
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <div class="tools">
    {#if tab.isPlayingVideo && tab.tabId !== null}
      <button
        class="tool-btn"
        onclick={(event) => {
          event.stopPropagation();
          onTogglePiP(tab.tabId!);
          (event.currentTarget as HTMLButtonElement).blur();
        }}
        title="Picture-in-picture"
      >
        <Icon name="pip" size={15} />
      </button>
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
        <Icon name="pin-off" size={11} />
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
        <Icon name="pin" size={11} />
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

  {#if copied}
    <span class="copied-badge" aria-hidden="true">
      <Icon name="check" size={13} />
      Copied
    </span>
  {/if}
</div>

<style>
  .tab-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--tab-row-min-height, 36px);
    padding: var(--tab-row-pad-y, 4px) 8px;
    border-radius: var(--radius-md);
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

  .tab-row.copied {
    animation: copied-glow 1.5s ease;
  }

  /* Same 0/12/72/100% envelope as copied-badge so the ring and pill fade in and
     out together. Spread stays constant; only the alpha fades. */
  @keyframes copied-glow {
    0% {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--success-color) 0%, transparent);
    }
    12% {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--success-color) 55%, transparent);
    }
    72% {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--success-color) 55%, transparent);
    }
    100% {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--success-color) 0%, transparent);
    }
  }

  .copied-badge {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px 2px 6px;
    border-radius: 999px;
    background: var(--success-color);
    color: var(--bg-primary);
    font-size: 11px;
    font-weight: 700;
    pointer-events: none;
    animation: copied-badge 1.5s ease forwards;
  }

  @keyframes copied-badge {
    0% {
      opacity: 0;
      transform: translate(4px, -50%) scale(0.9);
    }
    12% {
      opacity: 1;
      transform: translate(0, -50%) scale(1);
    }
    72% {
      opacity: 1;
      transform: translate(0, -50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(0, -50%) scale(1);
    }
  }

  @keyframes copied-badge-fade {
    0% {
      opacity: 0;
    }
    12%,
    72% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tab-row.copied {
      animation: none;
    }

    .copied-badge {
      animation-name: copied-badge-fade;
    }
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

  .favicon-btn:hover {
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
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }

  :global(.tab-name) {
    font-size: var(--tab-title-font-size, 15px);
    font-weight: 400;
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
  .tab-row:focus-within .tools {
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

  .audio-btn {
    flex: 0 0 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }

  .audio-btn:hover {
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
