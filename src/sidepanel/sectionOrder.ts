import type { PanelGroup, PanelTab } from '../types';

/**
 * A single rendered unit within a section: either a folder block or a loose
 * row. Loose rows and folders share one `order` scale (home-pin order for the
 * pinned section, live-tab strip index for the unpinned section), so they
 * interleave in a single sorted sequence.
 */
export type SectionEntry =
  | { kind: 'folder'; order: number; group: PanelGroup }
  | { kind: 'row'; order: number; tab: PanelTab };

/**
 * Merge loose rows and folders into one ordered sequence. Folders slot at their
 * anchor (`group.order`); loose rows at their own `order`. Orders are unique
 * across the section, so no tie-breaking is needed.
 */
export function mergeSection(
  looseRows: PanelTab[],
  folders: PanelGroup[],
): SectionEntry[] {
  const entries: SectionEntry[] = [
    ...folders.map(
      (group): SectionEntry => ({ kind: 'folder', order: group.order, group }),
    ),
    ...looseRows.map(
      (tab): SectionEntry => ({ kind: 'row', order: tab.order, tab }),
    ),
  ];
  return entries.sort((a, b) => a.order - b.order);
}
