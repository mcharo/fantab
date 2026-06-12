<script lang="ts" module>
  export type ContextMenuItem =
    | {
        type: 'action';
        label: string;
        onSelect: () => void;
        danger?: boolean;
        disabled?: boolean;
      }
    | { type: 'separator' };
</script>

<script lang="ts">
  interface Props {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
  }

  let { x, y, items, onClose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let position = $state({ left: x, top: y });

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
      {:else}
        <button
          class="context-item"
          class:danger={item.danger}
          role="menuitem"
          disabled={item.disabled}
          onclick={() => handleSelect(item)}
        >
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
    min-width: 184px;
    padding: 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    box-shadow: var(--shadow-md);
  }

  .context-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 13px;
    text-align: left;
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
</style>
