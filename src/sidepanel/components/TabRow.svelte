<script lang="ts">
  import { get } from 'svelte/store';
  import { getFaviconUrl } from '../../lib/url';
  import type { PanelTab, SectionUnitRef } from '../../types';
  import { dragImageEl, dragState, type DragMember } from '../dragState';
  import { setTabDragData, type DragTabPayload } from '../dragPayload';
  import Icon from './Icon.svelte';
  import InlineEdit from './InlineEdit.svelte';

  type DropPosition = 'before' | 'after';

  interface Props {
    tab: PanelTab;
    selected: boolean;
    /** Refs of all selected rows, used to carry a multi-selection on drag. */
    selectionMembers: DragMember[];
    copied?: boolean;
    onActivate: (tab: PanelTab) => void;
    onSelect: (tab: PanelTab, mods: { toggle: boolean; range: boolean }) => void;
    onClose: (tabId: number) => void;
    onToggleMute: (tabId: number, muted: boolean) => void;
    onTogglePiP: (tabId: number) => void;
    onTogglePlayback: (tabId: number, playing: boolean) => void;
    onRename: (tab: PanelTab, alias: string) => void;
    onCreateHomePin: (tabId: number) => void;
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
    selectionMembers,
    copied = false,
    onActivate,
    onSelect,
    onClose,
    onToggleMute,
    onTogglePiP,
    onTogglePlayback,
    onRename,
    onCreateHomePin,
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
    // A multi-selection drag only joins/leaves folders, never reorders.
    if (drag.members && drag.members.length > 1) return false;
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
  const canPin = $derived(!tab.isHomePin && tab.tabId !== null);
  // An open pin's home button: back to the home URL when it has wandered off,
  // or a reload when it's already there (for pages that update through the day).
  const homeAction = $derived(
    tab.isHomePin && tab.isOpen && tab.homePinId
      ? tab.atHome
        ? 'reload'
        : 'return'
      : null,
  );

  // At rest a row shows status only; its actions live in the hover tray. Media
  // controls are grouped in their own capsule, kept apart from the tab's.
  const isSounding = $derived(tab.isAudible && !tab.isMuted);
  const audioStatus = $derived(
    tab.tabId === null
      ? null
      : isSounding
        ? 'sounding'
        : tab.isMuted && (tab.isAudible || tab.mediaPlayback)
          ? 'muted'
          : null,
  );
  const canPlayPause = $derived(tab.mediaPlayback !== null && tab.tabId !== null);
  // The capsule's buttons follow what the tab has, not what it's doing right
  // now: pausing must only swap the play/pause icon. If PiP and mute dropped out
  // with playback (and Chrome's audible flag lags ~2s), the capsule would shrink
  // and slide play/pause out from under the cursor.
  const canPiP = $derived(tab.hasVideo && tab.tabId !== null);
  const canMute = $derived(
    tab.isOpen &&
      tab.tabId !== null &&
      (tab.isAudible || tab.isMuted || tab.mediaPlayback !== null),
  );
  const hasMediaControls = $derived(canPlayPause || canPiP || canMute);
  const hasTools = $derived(
    hasMediaControls || homeAction !== null || canPin || canClose,
  );
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
    // Dragging a row that's part of a multi-selection carries the whole
    // selection; dragging any other row is a single-item drag.
    const multi = selected && selectionMembers.length > 1;
    dragState.set({
      ref: selfRef(),
      pinned: tab.isHomePin,
      sourceGroupId: tab.groupId,
      members: multi ? selectionMembers : undefined,
    });
    if (event.dataTransfer) {
      // Carry url(s) + any custom title so the drag can also drop into another
      // fantab instance, another Chrome window, or a text field. In-app
      // reorder/folder logic still uses the drag store, not this payload.
      const exported: DragTabPayload[] = multi
        ? selectionMembers.map((member) => ({
            url: member.url,
            title: member.title,
          }))
        : [{ url: tab.url, title: tab.alias ?? undefined }];
      setTabDragData(event.dataTransfer, exported);
      // Allow both an internal move and an external copy (open elsewhere).
      event.dataTransfer.effectAllowed = 'all';
      // Multi-selection drags show a fanned stack rather than the single row.
      const stack = multi ? get(dragImageEl) : null;
      if (stack) event.dataTransfer.setDragImage(stack, 16, 16);
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
      {#if audioStatus === 'sounding'}
        <span class="audio-status" role="img" aria-label="Playing audio">
          <span class="eq"><span></span><span></span><span></span></span>
        </span>
      {:else if audioStatus === 'muted'}
        <span class="audio-status" role="img" aria-label="Muted">
          <Icon name="volume-x" size={14} />
        </span>
      {/if}
    </div>
  </div>

  {#if hasTools}
    <div class="tools">
      {#if hasMediaControls}
        <div class="media" class:sounding={isSounding} role="group" aria-label="Media">
          {#if canPlayPause}
            {@const playing = tab.mediaPlayback === 'playing'}
            <button
              class="tool-btn primary"
              onclick={(event) => {
                event.stopPropagation();
                onTogglePlayback(tab.tabId!, playing);
              }}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <Icon name={playing ? 'pause' : 'play'} size={14} />
            </button>
          {/if}
          {#if canPiP}
            <button
              class="tool-btn"
              onclick={(event) => {
                event.stopPropagation();
                onTogglePiP(tab.tabId!);
              }}
              title="Picture-in-picture"
              aria-label="Picture-in-picture"
            >
              <Icon name="pip" size={15} />
            </button>
          {/if}
          {#if canMute}
            <button
              class="tool-btn"
              onclick={(event) => {
                event.stopPropagation();
                onToggleMute(tab.tabId!, !tab.isMuted);
              }}
              title={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
              aria-label={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
            >
              <Icon name={tab.isMuted ? 'volume-x' : 'volume-2'} size={15} />
            </button>
          {/if}
        </div>
      {/if}

      {#if homeAction}
        {@const label = homeAction === 'reload' ? 'Reload' : 'Return to home URL'}
        <button
          class="tool-btn"
          onclick={(event) => {
            event.stopPropagation();
            onGoHome(tab.homePinId!);
          }}
          title={label}
          aria-label={label}
        >
          <Icon name={homeAction === 'reload' ? 'refresh' : 'house'} size={14} />
        </button>
      {:else if canPin}
        <button
          class="tool-btn"
          onclick={(event) => {
            event.stopPropagation();
            onCreateHomePin(tab.tabId!);
          }}
          title="Pin as home"
          aria-label="Pin as home"
        >
          <Icon name="pin" size={14} />
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
          aria-label="Close tab"
        >
          <Icon name="x" size={15} />
        </button>
      {/if}
    </div>
  {/if}

  {#if copied}
    <span class="copied-badge" aria-hidden="true">
      <Icon name="check" size={13} />
      Copied
    </span>
  {/if}
</div>

<style>
  /* --row-bg is the row's opaque surface, which the hover tray paints over the
     end of the title. It's a registered <color> (see global.css) so it fades in
     step with the row's own background. */
  .tab-row {
    --row-bg: var(--bg-primary);
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
      --row-bg 0.15s,
      opacity 0.15s;
  }

  .tab-row:hover,
  .tab-row.selected {
    --row-bg: var(--bg-secondary);
    background: var(--bg-secondary);
  }

  .tab-row.active {
    --row-bg: var(--active-bg);
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

  /* Status at rest: one glyph after the title, nothing reserved for buttons.
     It hands over to the tray on hover, whose media capsule carries the same
     state. */
  .audio-status {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--text-secondary);
    transition: opacity 0.12s;
  }

  .eq {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 11px;
  }

  .eq span {
    width: 2.5px;
    height: 100%;
    border-radius: 1px;
    background: var(--success-color);
    transform-origin: bottom;
    animation: eq-bounce 1.1s ease-in-out infinite;
  }

  .eq span:nth-child(2) {
    animation-duration: 0.85s;
    animation-delay: -0.4s;
  }

  .eq span:nth-child(3) {
    animation-duration: 1.3s;
    animation-delay: -0.75s;
  }

  @keyframes eq-bounce {
    0%,
    100% {
      transform: scaleY(0.35);
    }
    50% {
      transform: scaleY(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .eq span {
      animation: none;
      transform: scaleY(0.55);
    }

    .eq span:nth-child(2) {
      transform: scaleY(1);
    }

    .eq span:nth-child(3) {
      transform: scaleY(0.75);
    }
  }

  /* The hover tray floats over the end of the title instead of reserving
     space, so titles use the full row at rest. Close is always the rightmost
     button. Mouse focus doesn't keep it open; keyboard focus does. */
  .tools {
    position: absolute;
    top: 50%;
    right: 6px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 2px;
    background: var(--row-bg);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-50%);
    transition:
      opacity 0.12s,
      visibility 0.12s;
  }

  /* Fade the title out under the tray. Clicks here still reach the row. */
  .tools::before {
    content: '';
    position: absolute;
    top: 0;
    right: 100%;
    bottom: 0;
    width: 28px;
    background: linear-gradient(to right, transparent, var(--row-bg));
    pointer-events: none;
  }

  .tab-row:hover .tools,
  .tab-row:focus-visible .tools,
  .tab-row:has(.tools :focus-visible) .tools {
    opacity: 1;
    visibility: visible;
  }

  .tab-row:hover .audio-status,
  .tab-row:focus-visible .audio-status,
  .tab-row:has(.tools :focus-visible) .audio-status {
    opacity: 0;
  }

  /* Renaming: the tray would sit on top of the end of the input. */
  .tab-row:has(.title-line :global(input)) .tools {
    opacity: 0;
    visibility: hidden;
  }

  .tool-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }

  .tool-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tool-btn:focus-visible {
    outline: 2px solid var(--accent-color);
    outline-offset: -2px;
  }

  /* Media controls share a capsule, tinted green while the tab is making
     sound — the equalizer's color, so the glyph reads as having opened up. */
  .media {
    display: flex;
    align-items: center;
    margin-right: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-primary) 7%, var(--row-bg));
  }

  .media.sounding {
    background: color-mix(in srgb, var(--success-color) 20%, var(--row-bg));
  }

  .media .tool-btn {
    width: 26px;
    border-radius: 999px;
  }

  .media .tool-btn:hover {
    background: color-mix(in srgb, var(--text-primary) 10%, transparent);
  }

  .media .tool-btn.primary {
    color: var(--text-primary);
  }
</style>
