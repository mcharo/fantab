import { writable } from 'svelte/store';
import type { SectionUnitRef } from '../types';

/**
 * The item currently being dragged within the tab list, tracked in a shared
 * store rather than via DataTransfer because the payload isn't readable during
 * `dragover` (protected mode). Covers folders, loose home pins, and live tabs so
 * every drop target can reliably decide whether it's a valid reorder/join
 * target. Cleared on `dragend`.
 */
export interface DragState {
  /** What's being dragged. */
  ref: SectionUnitRef;
  /** Section the drag belongs to: true = pinned, false = unpinned. */
  pinned: boolean;
  /**
   * The folder the dragged item currently belongs to, or null when loose. For a
   * folder drag this is the folder's own id.
   */
  sourceGroupId: string | null;
}

export const dragState = writable<DragState | null>(null);
