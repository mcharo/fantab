import { writable } from 'svelte/store';

/**
 * Tracks whether the side panel is in active use — its window has focus, or the
 * pointer is over it.
 *
 * Kept at module scope (rather than as component state) so the value survives
 * component remounts. The "Close all" bar unmounts when the last loose tab is
 * closed and remounts when a new tab opens; a fresh component instance would
 * otherwise reset to "pointer outside" and stay hidden until the cursor
 * physically left and re-entered the panel.
 */

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

let focused = hasDom ? document.hasFocus() : true;
let pointerInside = false;

export const panelActive = writable(focused || pointerInside);

function sync(): void {
  panelActive.set(focused || pointerInside);
}

function setFocused(value: boolean): void {
  if (focused === value) return;
  focused = value;
  sync();
}

function setPointerInside(value: boolean): void {
  if (pointerInside === value) return;
  pointerInside = value;
  sync();
}

if (hasDom) {
  window.addEventListener('focus', () => setFocused(true));
  window.addEventListener('blur', () => setFocused(false));
  // `mouseenter`/`mouseleave` track the pointer crossing the panel boundary;
  // `pointermove` covers a pointer that was already inside at load (or when the
  // bar remounts under a stationary cursor), since no enter event fires then.
  document.addEventListener('mouseenter', () => setPointerInside(true));
  document.addEventListener('mouseleave', () => setPointerInside(false));
  document.addEventListener('pointermove', () => setPointerInside(true), {
    passive: true,
  });
}
