<script lang="ts">
  import { getFaviconUrl } from '../../lib/url';
  import type { PanelTab } from '../../types';
  import { dragImageEl } from '../dragState';

  interface Props {
    tabs: PanelTab[];
  }

  let { tabs }: Props = $props();

  // How many cards to actually draw in the stack; the badge always shows the
  // true total, so a large selection still reads correctly.
  const MAX_CARDS = 3;
  const visible = $derived(tabs.slice(0, MAX_CARDS));

  let root = $state<HTMLDivElement>();

  // Publish this element as the drag image while it's mounted (i.e. while a
  // multi-selection exists). Cleared on teardown so single drags never use it.
  $effect(() => {
    dragImageEl.set(root ?? null);
    return () => dragImageEl.set(null);
  });

  function favicon(tab: PanelTab): string {
    if (tab.faviconUrl) return tab.faviconUrl;
    try {
      return getFaviconUrl(tab.url);
    } catch {
      return '';
    }
  }
</script>

<div class="drag-preview" bind:this={root} aria-hidden="true">
  {#each visible as tab, index (tab.key)}
    <div class="card" style="--i: {index};">
      <span class="favicon">
        {#if favicon(tab)}
          <img src={favicon(tab)} alt="" width="16" height="16" />
        {:else}
          <span class="dot">•</span>
        {/if}
      </span>
      <span class="title">{tab.displayName}</span>
    </div>
  {/each}
  <span class="count">{tabs.length}</span>
</div>

<style>
  /* Lives off-screen but fully painted, so its favicons are already loaded when
     the browser snapshots it for the drag image. */
  .drag-preview {
    position: fixed;
    top: 0;
    left: -10000px;
    width: 220px;
    height: 60px;
    pointer-events: none;
  }

  .card {
    position: absolute;
    top: 4px;
    left: 6px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 188px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
    /* Each card behind the front one slips down-right and tilts, for a tight
       fanned-deck look. */
    transform: translate(calc(var(--i) * 6px), calc(var(--i) * 7px))
      rotate(calc(var(--i) * 3deg));
    transform-origin: top left;
    z-index: calc(10 - var(--i));
  }

  .favicon {
    flex: 0 0 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
  }

  .favicon img {
    width: 16px;
    height: 16px;
    border-radius: 3px;
  }

  .dot {
    color: var(--text-tertiary);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13px;
    color: var(--text-primary);
  }

  .count {
    position: absolute;
    top: 0;
    left: 182px;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--accent-color);
    color: var(--bg-primary);
    font-size: 12px;
    font-weight: 700;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
  }
</style>
