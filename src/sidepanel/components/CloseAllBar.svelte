<script lang="ts">
  import { panelActive } from '../panelActivity';
  import Icon from './Icon.svelte';

  interface Props {
    /** Number of loose tabs that "Close all" would affect (for labels). */
    count: number;
    /** Whether we're in the post-close restore window. */
    pending: boolean;
    /** How many tabs are pending close (shown on the restore button). */
    pendingCount: number;
    /** When false, a single click confirms instead of a hold gesture. */
    holdToConfirm?: boolean;
    /** Hold-to-confirm duration in ms. */
    holdMs?: number;
    /** Restore-window duration in ms (drives the depleting countdown). */
    restoreMs?: number;
    onConfirm: () => void;
    onRestore: () => void;
  }

  let {
    count,
    pending,
    pendingCount,
    holdToConfirm = true,
    holdMs = 650,
    restoreMs = 5000,
    onConfirm,
    onRestore,
  }: Props = $props();

  // `holding` = pointer is down and the pill is filling; `ready` = the fill has
  // completed so a release-inside will confirm. Releasing early, or leaving the
  // button, cancels.
  let holding = $state(false);
  let ready = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;

  // The divider stays put, but the Close all button is a low-priority affordance
  // that stays out of the way until the panel is in use, revealing on focus or
  // hover (tracked by the shared `panelActive` store so it survives this bar
  // unmounting/remounting). A pending restore always shows so its time-sensitive
  // countdown is never hidden.
  const revealed = $derived(pending || $panelActive);

  function tabsLabel(n: number): string {
    return `${n} ${n === 1 ? 'tab' : 'tabs'}`;
  }

  function startHold(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    holding = true;
    ready = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      ready = true;
    }, holdMs);
  }

  function cancelHold() {
    if (!holding) return;
    holding = false;
    ready = false;
    clearTimeout(holdTimer);
    holdTimer = undefined;
  }

  function releaseHold() {
    const complete = ready; // released inside (this is the button) while full
    cancelHold();
    if (complete) onConfirm();
  }
</script>

<div class="close-all-bar">
  <span class="rule" aria-hidden="true"></span>

  {#if pending}
    <button
      type="button"
      class="action restore"
      onclick={onRestore}
      title="Restore the tabs that were just closed"
    >
      <span
        class="deplete"
        style="animation-duration: {restoreMs}ms"
        aria-hidden="true"
      ></span>
      <span class="label">
        <Icon name="refresh" size={13} />
        Restore {tabsLabel(pendingCount)}
      </span>
    </button>
  {:else if holdToConfirm}
    <button
      type="button"
      class="action confirm"
      class:holding
      class:ready
      class:hidden={!revealed}
      tabindex={revealed ? undefined : -1}
      aria-hidden={!revealed}
      style="--hold-ms: {holdMs}ms"
      onpointerdown={startHold}
      onpointerup={releaseHold}
      onpointerleave={cancelHold}
      onpointercancel={cancelHold}
      title={`Hold to close all ${tabsLabel(count)} below`}
      aria-label={`Hold to close all ${tabsLabel(count)} below`}
    >
      <span class="fill" aria-hidden="true"></span>
      <span class="label">
        <Icon name="arrow-down" size={13} />
        Close all
      </span>
    </button>
  {:else}
    <button
      type="button"
      class="action confirm immediate"
      class:hidden={!revealed}
      tabindex={revealed ? undefined : -1}
      aria-hidden={!revealed}
      onclick={onConfirm}
      title={`Close all ${tabsLabel(count)} below`}
      aria-label={`Close all ${tabsLabel(count)} below`}
    >
      <span class="label">
        <Icon name="arrow-down" size={13} />
        Close all
      </span>
    </button>
  {/if}
</div>

<style>
  /* A single unbroken rule spans the row; the button floats centered on top and
     masks the line behind it with its own background, so the gap exists only
     while the button is visible and the line heals when it fades out. */
  .close-all-bar {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 24px;
    margin: 12px 8px 7px;
  }

  .rule {
    flex: 1;
    height: 1px;
    background: var(--border-color);
  }

  .action {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 10px;
    /* Borderless when idle; the pill outline only appears on hover. */
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    user-select: none;
    touch-action: none;
    transition: opacity 0.16s ease;
  }

  /* The divider persists; only the button tucks away until focus/hover. It keeps
     its layout box so the gap in the rule stays put as it fades in and out. */
  .action.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .action:hover {
    border-color: var(--border-color);
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .label {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  /* Hold-to-confirm fill: sweeps the pill left→right over the hold duration. */
  .confirm .fill {
    position: absolute;
    inset: 0;
    background: var(--danger-bg);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 0.16s ease;
  }

  .confirm.holding {
    color: var(--danger-text);
    border-color: color-mix(in srgb, var(--danger-text) 45%, var(--border-color));
    background: var(--bg-primary);
  }

  .confirm.holding .fill {
    transform: scaleX(1);
    transition: transform var(--hold-ms) linear;
  }

  .confirm.ready {
    color: var(--danger-text);
    border-color: var(--danger-text);
    box-shadow: 0 0 0 1px var(--danger-text);
  }

  .confirm.ready .fill {
    background: color-mix(in srgb, var(--danger-text) 22%, var(--danger-bg));
  }

  /* Immediate (molly guard off): a plain click, hinted as destructive on hover. */
  .confirm.immediate:hover {
    color: var(--danger-text);
    border-color: color-mix(in srgb, var(--danger-text) 45%, var(--border-color));
    background: var(--bg-primary);
  }

  /* Restore countdown */
  .restore {
    color: var(--accent-color);
    border-color: color-mix(in srgb, var(--accent-color) 35%, var(--border-color));
  }

  .restore:hover {
    color: var(--accent-color);
    background: var(--active-bg);
  }

  .deplete {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 2px;
    background: var(--accent-color);
    transform-origin: left center;
    animation-name: close-all-deplete;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  @keyframes close-all-deplete {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
</style>
