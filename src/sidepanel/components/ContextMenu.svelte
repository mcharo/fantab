<script lang="ts" module>
  import type { SpaceIcon } from '../../types';

  export type ContextMenuItem =
    | {
        type: 'action';
        label: string;
        onSelect: () => void;
        /** Optional leading glyph (e.g. a space's icon/emoji). */
        icon?: SpaceIcon;
        danger?: boolean;
        disabled?: boolean;
      }
    | {
        type: 'submenu';
        label: string;
        items: ContextMenuItem[];
        disabled?: boolean;
      }
    | { type: 'separator' };
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  import SpaceGlyph from './SpaceGlyph.svelte';

  interface Props {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
  }

  let { x, y, items, onClose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let position = $state({ left: x, top: y });

  let openSubmenu = $state<number | null>(null);
  let submenuEl: HTMLDivElement | undefined = $state();
  let submenuStyle = $state('');

  // Keep the menu inside the viewport once its size is known.
  $effect(() => {
    if (!menuEl) return;

    const margin = 6;
    const rect = menuEl.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;

    position = {
      left: Math.max(margin, Math.min(x, maxLeft)),
      top: Math.max(margin, Math.min(y, maxTop)),
    };
  });

  // Flip the submenu flyout to the other side (and nudge it up) when it would
  // overflow the viewport — the side panel is narrow so the right edge is tight.
  $effect(() => {
    if (openSubmenu === null || !submenuEl) {
      submenuStyle = '';
      return;
    }

    const wrap = submenuEl.parentElement;
    if (!wrap) return;

    const margin = 6;
    const wrapRect = wrap.getBoundingClientRect();
    const subRect = submenuEl.getBoundingClientRect();

    const flipX =
      wrapRect.right + subRect.width + margin > window.innerWidth &&
      wrapRect.left - subRect.width - margin >= 0;

    let offsetY = 0;
    if (wrapRect.top + subRect.height + margin > window.innerHeight) {
      offsetY = Math.min(
        0,
        window.innerHeight - margin - (wrapRect.top + subRect.height),
      );
    }

    const horizontal = flipX
      ? 'right: 100%; left: auto;'
      : 'left: 100%; right: auto;';
    submenuStyle = `${horizontal} top: ${offsetY}px;`;
  });

  function handleSelect(item: ContextMenuItem) {
    if (item.type !== 'action' || item.disabled) return;
    onClose();
    item.onSelect();
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }}
/>

<div
  class="context-overlay"
  role="presentation"
  onpointerdown={onClose}
  oncontextmenu={(event) => {
    event.preventDefault();
    onClose();
  }}
>
  <div
    bind:this={menuEl}
    class="context-menu"
    role="menu"
    style="left: {position.left}px; top: {position.top}px"
    onpointerdown={(event) => event.stopPropagation()}
  >
    {#each items as item, index (index)}
      {#if item.type === 'separator'}
        <div class="context-separator" role="separator"></div>
      {:else if item.type === 'submenu'}
        <div class="submenu-wrap">
          <button
            class="context-item submenu-trigger"
            class:open={openSubmenu === index}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openSubmenu === index}
            disabled={item.disabled}
            onmouseenter={() => {
              if (!item.disabled) openSubmenu = index;
            }}
            onclick={(event) => {
              event.stopPropagation();
              if (!item.disabled) openSubmenu = openSubmenu === index ? null : index;
            }}
          >
            <span class="submenu-label">{item.label}</span>
            <span class="submenu-chevron">
              <Icon name="chevron-right" size={13} />
            </span>
          </button>
          {#if openSubmenu === index}
            <div
              bind:this={submenuEl}
              class="context-menu submenu-flyout"
              role="menu"
              style={submenuStyle}
            >
              {#each item.items as sub, subIndex (subIndex)}
                {#if sub.type === 'separator'}
                  <div class="context-separator" role="separator"></div>
                {:else if sub.type === 'action'}
                  <button
                    class="context-item"
                    class:danger={sub.danger}
                    role="menuitem"
                    disabled={sub.disabled}
                    onclick={() => handleSelect(sub)}
                  >
                    {#if sub.icon !== undefined}
                      <span class="item-icon"><SpaceGlyph icon={sub.icon} size={16} /></span>
                    {/if}
                    {sub.label}
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <button
          class="context-item"
          class:danger={item.danger}
          role="menuitem"
          disabled={item.disabled}
          onmouseenter={() => (openSubmenu = null)}
          onclick={() => handleSelect(item)}
        >
          {#if item.icon !== undefined}
            <span class="item-icon"><SpaceGlyph icon={item.icon} size={16} /></span>
          {/if}
          {item.label}
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .context-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
  }

  .context-menu {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 150px;
    padding: 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    box-shadow: var(--shadow-md);
  }

  .context-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 13px;
    text-align: left;
  }

  .item-icon {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    color: var(--text-secondary);
  }

  .context-item:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .context-item.danger {
    color: var(--danger-text);
  }

  .context-item:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .context-separator {
    height: 1px;
    margin: 4px 6px;
    background: var(--border-color);
  }

  .submenu-wrap {
    position: relative;
    display: flex;
  }

  .submenu-trigger {
    justify-content: space-between;
    gap: 8px;
  }

  .submenu-trigger.open:not(:disabled) {
    background: var(--bg-hover);
  }

  .submenu-label {
    flex: 1 1 auto;
  }

  .submenu-chevron {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
  }

  /* Defined after .context-menu so the flyout escapes the fixed positioning of
     the base menu and anchors to its trigger row instead. */
  .submenu-flyout {
    position: absolute;
    top: 0;
    left: 100%;
    min-width: 132px;
  }
</style>
