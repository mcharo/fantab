import { writable } from 'svelte/store';
import type { SectionUnitRef } from '../types';

/**
 * The item currently being dragged within the tab list, tracked in a shared
 * store rather than via DataTransfer because the payload isn't readable during
 * `dragover` (protected mode). Covers folders, loose home pins, and live tabs so
 * every drop target can reliably decide whether it's a valid reorder/join
 * target. Cleared on `dragend`.
 */
/** One row carried by a multi-selection drag. */
export interface DragMember {
  ref: SectionUnitRef;
  /** The folder this row currently belongs to, or null when loose. */
  sourceGroupId: string | null;
}

export interface DragState {
  /** What's being dragged (the grabbed row; the primary for a multi drag). */
  ref: SectionUnitRef;
  /** Section the drag belongs to: true = pinned, false = unpinned. */
  pinned: boolean;
  /**
   * The folder the dragged item currently belongs to, or null when loose. For a
   * folder drag this is the folder's own id.
   */
  sourceGroupId: string | null;
  /**
   * Every selected row when a multi-selection is being dragged (includes the
   * primary). Absent for a single-item drag. Folder joins and folder removals
   * act on all members; reordering stays single-item.
   */
  members?: DragMember[];
}

export const dragState = writable<DragState | null>(null);

/**
 * The off-screen element used as the drag image for a multi-selection drag (a
 * fanned stack of the selected rows). Registered by the rendered preview so the
 * dragged row can hand it to `dataTransfer.setDragImage`. Null when fewer than
 * two rows are selected.
 */
export const dragImageEl = writable<HTMLElement | null>(null);
