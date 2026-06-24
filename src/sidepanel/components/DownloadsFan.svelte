<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import {
    DEFAULT_RECENT_DOWNLOADS_LIMIT,
    formatRelativeAge,
    selectRecentDownloads,
    type RecentDownload,
  } from '../../downloads';
  import Icon from './Icon.svelte';

  interface Props {
    /**
     * Reveal an existing tab in the current space: reassign it to the active
     * space (so activating it doesn't switch spaces) and focus it. Falls back to
     * a plain activate when not provided.
     */
    onRevealTab?: (tabId: number) => void | Promise<void>;
    /**
     * Close a tab through the panel's close flow, which first focuses the
     * most-recently-active tab in the space. Falls back to a plain remove when
     * not provided.
     */
    onCloseTab?: (tabId: number) => void | Promise<void>;
  }

  let { onRevealTab, onCloseTab }: Props = $props();

  let expanded = $state(false);
  let recent = $state<RecentDownload[]>([]);
  // Ticks while the fan is open so the relative "age" labels stay fresh.
  let now = $state(Date.now());
  // Which item (if any) is mid delete-confirm; deletion is irreversible so it
  // takes two clicks (trash callout -> confirm) before the file is removed.
  let confirmingId = $state<number | null>(null);
  // File-type icons keyed by download id, fetched lazily from Chrome.
  let icons = $state<Record<number, string>>({});

  // Live activity. `activeCount` is how many downloads are in progress;
  // `unseenCount` is completed downloads the user hasn't opened the fan to see
  // yet (cleared on open); `justCompleted` drives a one-shot flash on the
  // trigger when a download finishes while the fan is closed.
  let activeCount = $state(0);
  let unseenCount = $state(0);
  let justCompleted = $state(false);

  const badgeMode = $derived(
    activeCount > 0 ? 'active' : unseenCount > 0 ? 'done' : null,
  );
  const badgeCount = $derived(activeCount > 0 ? activeCount : unseenCount);

  // Render oldest-first so the most recent download sits at the bottom of the
  // fan, closest to the trigger button.
  const ordered = $derived(recent.slice().reverse());

  const triggerLabel = $derived(
    activeCount > 0
      ? `Downloads, ${activeCount} downloading`
      : unseenCount > 0
        ? `Downloads, ${unseenCount} new`
        : 'Downloads',
  );

  const SEARCH_QUERY: chrome.downloads.DownloadQuery = {
    state: 'complete',
    orderBy: ['-endTime'],
    limit: 25,
  };

  async function refresh(): Promise<void> {
    let items: chrome.downloads.DownloadItem[];
    try {
      items = await chrome.downloads.search(SEARCH_QUERY);
    } catch {
      recent = [];
      return;
    }

    recent = selectRecentDownloads(items, DEFAULT_RECENT_DOWNLOADS_LIMIT);

    // Drop a pending confirm whose item vanished (e.g. deleted elsewhere).
    if (confirmingId !== null && !recent.some((d) => d.id === confirmingId)) {
      confirmingId = null;
    }

    pruneIcons();
    void loadIcons();
    void refreshActive();
  }

  async function refreshActive(): Promise<void> {
    try {
      const active = await chrome.downloads.search({ state: 'in_progress' });
      activeCount = active.length;
    } catch {
      activeCount = 0;
    }
  }

  function pruneIcons(): void {
    const ids = new Set(recent.map((d) => d.id));
    const kept = Object.entries(icons).filter(([id]) => ids.has(Number(id)));
    if (kept.length !== Object.keys(icons).length) {
      icons = Object.fromEntries(kept);
    }
  }

  async function loadIcons(): Promise<void> {
    for (const download of recent) {
      if (icons[download.id]) continue;
      try {
        const url = await chrome.downloads.getFileIcon(download.id, {
          size: 32,
        });
        if (url) icons = { ...icons, [download.id]: url };
      } catch {
        // No icon available; the fallback glyph is shown instead.
      }
    }
  }

  // Download events arrive in bursts (a single download fires several onChanged
  // deltas); collapse them into one query.
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefresh(): void {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refresh(), 150);
  }

  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  function noteCompleted(): void {
    // When the fan is open the finished item simply animates into the list, so
    // only the collapsed state needs a nudge.
    if (expanded) return;
    unseenCount += 1;
    justCompleted = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (justCompleted = false), 1600);
  }

  $effect(() => {
    void refresh();

    const onCreated = () => scheduleRefresh();
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.state?.current === 'complete') noteCompleted();
      scheduleRefresh();
    };
    const onErased = () => scheduleRefresh();

    chrome.downloads.onCreated.addListener(onCreated);
    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads.onErased.addListener(onErased);

    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(flashTimer);
      clearTimeout(hoverOpenTimer);
      clearTimeout(hoverCloseTimer);
      chrome.downloads.onCreated.removeListener(onCreated);
      chrome.downloads.onChanged.removeListener(onChanged);
      chrome.downloads.onErased.removeListener(onErased);
    };
  });

  // Keep the "age" labels current while the fan is open (and only then, to
  // avoid a background timer the rest of the time).
  $effect(() => {
    if (!expanded) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 15000);
    return () => clearInterval(timer);
  });

  function open(): void {
    if (expanded) return;
    expanded = true;
    unseenCount = 0;
    justCompleted = false;
    void refresh();
  }

  function collapse(): void {
    clearTimeout(hoverOpenTimer);
    clearTimeout(hoverCloseTimer);
    expanded = false;
    confirmingId = null;
  }

  async function toggleDownloadsPage(): Promise<void> {
    // Hovering reveals the quick fan; an explicit click toggles Chrome's full
    // download history: close it if it's already the active tab, focus it if
    // it's open in the background, otherwise open it. When it lives in another
    // space, pull it into the active space first so focusing it doesn't drag
    // the panel away.
    collapse();
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const page = tabs.find((tab) =>
        (tab.url ?? tab.pendingUrl ?? '').startsWith('chrome://downloads'),
      );

      if (!page || typeof page.id !== 'number') {
        await chrome.tabs.create({ url: 'chrome://downloads/' });
      } else if (page.active) {
        if (onCloseTab) await onCloseTab(page.id);
        else await chrome.tabs.remove(page.id);
      } else if (onRevealTab) {
        await onRevealTab(page.id);
      } else {
        await chrome.tabs.update(page.id, { active: true });
      }
    } catch {
      // Best-effort; ignore transient tab API failures.
    }
  }

  // Hover-to-open (Arc-style): a short open delay avoids opening on an
  // incidental pass, and a generous close delay forgives a wide mouse path
  // from the trigger to the popover so it doesn't vanish before the cursor
  // arrives.
  const HOVER_OPEN_DELAY_MS = 90;
  const HOVER_CLOSE_DELAY_MS = 450;
  let hoverOpenTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined;

  function handlePointerEnter(): void {
    clearTimeout(hoverCloseTimer);
    if (expanded) return;
    hoverOpenTimer = setTimeout(open, HOVER_OPEN_DELAY_MS);
  }

  function handlePointerLeave(): void {
    clearTimeout(hoverOpenTimer);
    hoverCloseTimer = setTimeout(collapse, HOVER_CLOSE_DELAY_MS);
  }

  function openDownload(id: number): void {
    // Call synchronously inside the click handler so the side panel's transient
    // user activation carries into open(), which requires a user gesture.
    try {
      chrome.downloads.open(id);
    } catch {
      // The file may have been removed between render and click.
    }
    collapse();
  }

  function showDownload(id: number): void {
    try {
      chrome.downloads.show(id);
    } catch {
      // Ignore; nothing to reveal if the record is gone.
    }
  }

  async function confirmDelete(id: number): Promise<void> {
    confirmingId = null;
    try {
      await chrome.downloads.removeFile(id);
    } catch {
      // File may already be gone; still erase the history record below.
    }
    try {
      await chrome.downloads.erase({ id });
    } catch {
      // Ignore; a stale record just lingers until the next refresh.
    }
    void refresh();
  }

  // Staggered, slightly-tilted entrance so the cards read as a fan opening from
  // the trigger corner (pivot set via transform-origin in CSS).
  function fanIn(
    _node: Element,
    { index, total }: { index: number; total: number },
  ) {
    const fromTrigger = total - 1 - index;
    return {
      duration: 240,
      delay: fromTrigger * 35,
      easing: cubicOut,
      css: (t: number) => {
        const remaining = 1 - t;
        return `opacity: ${t}; transform: translateY(${remaining * 16}px) rotate(${remaining * -7}deg);`;
      },
    };
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (expanded && event.key === 'Escape') {
      event.stopPropagation();
      collapse();
    }
  }}
/>

<div
  class="downloads-fan"
  role="presentation"
  onmouseenter={handlePointerEnter}
  onmouseleave={handlePointerLeave}
>
  {#if expanded}
    <div class="fan-popover" transition:fade={{ duration: 120 }}>
      {#if recent.length === 0}
        <p class="fan-empty">No recent downloads</p>
      {:else}
        {#each ordered as download, index (download.id)}
          <div
            class="fan-card"
            in:fanIn={{ index, total: ordered.length }}
          >
            {#if confirmingId === download.id}
              <div class="confirm">
                <span class="confirm-label">Delete file?</span>
                <button
                  class="callout danger"
                  onclick={() => confirmDelete(download.id)}
                  title="Delete file from disk"
                  aria-label="Confirm deleting {download.basename}"
                >
                  <Icon name="check" size={15} />
                </button>
                <button
                  class="callout"
                  onclick={() => (confirmingId = null)}
                  title="Cancel"
                  aria-label="Cancel deleting {download.basename}"
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            {:else}
              <button
                class="card-body"
                onclick={() => openDownload(download.id)}
                title={download.basename}
              >
                {#if icons[download.id]}
                  <img class="file-icon" src={icons[download.id]} alt="" />
                {:else}
                  <span class="file-icon file-icon-fallback" aria-hidden="true">
                    <Icon name="download" size={18} />
                  </span>
                {/if}
                <span class="file-meta">
                  <span class="file-name">{download.basename}</span>
                  {#if download.completedAt !== null}
                    <span class="file-age">
                      {formatRelativeAge(download.completedAt, now)}
                    </span>
                  {/if}
                </span>
              </button>

              <div class="callouts">
                <button
                  class="callout"
                  onclick={() => showDownload(download.id)}
                  title="Open containing folder"
                  aria-label="Open folder for {download.basename}"
                >
                  <Icon name="folder" size={15} />
                </button>
                <button
                  class="callout"
                  onclick={() => (confirmingId = download.id)}
                  title="Delete file"
                  aria-label="Delete {download.basename}"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <button
    class="trigger"
    class:active={expanded}
    class:flash={justCompleted}
    onclick={toggleDownloadsPage}
    title={triggerLabel}
    aria-label={triggerLabel}
    aria-expanded={expanded}
  >
    <Icon name="download" size={18} />
    {#if badgeMode}
      <span
        class="badge"
        class:active={badgeMode === 'active'}
        aria-hidden="true"
      >
        {badgeCount}
      </span>
    {/if}
  </button>
</div>

<style>
  /* Anchored over the space dock's reserved left-edge slot (.dock-edge), so the
     trigger lines up with the centred space buttons and the add-space button on
     the right. Sits above the player bar / dock / tab list. */
  .downloads-fan {
    position: absolute;
    left: 10px;
    bottom: 14px;
    z-index: 30;
  }

  .fan-popover {
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: max-content;
    min-width: 264px;
    max-width: calc(100vw - 20px);
    padding: 6px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    box-shadow: var(--shadow-md);
  }

  .fan-empty {
    padding: 8px 10px;
    color: var(--text-secondary);
    font-size: 12px;
    text-align: center;
  }

  .fan-card {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 46px;
    border-radius: var(--radius-sm);
    transform-origin: bottom left;
  }

  .fan-card:hover {
    background: var(--bg-hover);
  }

  .card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    text-align: left;
  }

  .file-icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 5px;
    object-fit: contain;
  }

  .file-icon-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    background: var(--bg-secondary);
  }

  .file-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13.5px;
    font-weight: 600;
  }

  .file-age {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  /* Callouts stay hidden until the row is hovered or focused within. */
  .callouts {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 4px;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .fan-card:hover .callouts,
  .fan-card:focus-within .callouts {
    opacity: 1;
  }

  .callout {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    transition:
      background 0.12s,
      color 0.12s;
  }

  .callout:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .callout.danger:hover {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  .confirm {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 4px 4px 10px;
  }

  .confirm-label {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--danger-text);
  }

  .trigger {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    /* Bare icon by default; the circle background only reveals on hover. */
    background: transparent;
    color: var(--text-secondary);
    transition:
      background 0.13s,
      color 0.13s,
      transform 0.15s;
  }

  .trigger:hover {
    background: var(--active-bg);
    color: var(--accent-color);
    transform: translateY(-1px);
  }

  .trigger.active {
    background: var(--active-bg);
    color: var(--accent-color);
  }

  /* One-shot ring pulse when a download finishes while the fan is closed. */
  .trigger.flash {
    animation: trigger-flash 1.6s ease-out;
  }

  @keyframes trigger-flash {
    0% {
      box-shadow: 0 0 0 0
        color-mix(in srgb, var(--success-color) 70%, transparent);
    }
    100% {
      box-shadow: 0 0 0 11px
        color-mix(in srgb, var(--success-color) 0%, transparent);
    }
  }

  .badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--success-color);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 0 0 2px var(--bg-primary);
  }

  /* Downloading: accent-coloured and pulsing to read as ongoing activity. */
  .badge.active {
    background: var(--accent-color);
    animation: badge-pulse 1.1s ease-in-out infinite;
  }

  @keyframes badge-pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.18);
      opacity: 0.72;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .trigger.flash,
    .badge.active {
      animation: none;
    }
  }
</style>
