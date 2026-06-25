import type { PanelGroup, PanelTab } from '../types';

/**
 * The tabs a folder shows given its state. Expanded folders show every member.
 *
 * A collapsed folder still "peeks" a single member so the active tab never
 * disappears (Arc-style):
 *  - a currently-active member always peeks while it's active;
 *  - additionally, a folder in the persistent `peek` state (entered by
 *    collapsing while a member was active) keeps showing its last-active member
 *    — the one with the most recent `lastAccessed` — even after focus moves to a
 *    tab outside the folder.
 *
 * This is the single source of truth shared by the list rendering, the
 * keyboard/selection model, and the background's visibility checks, so they all
 * agree on which rows are actually on screen.
 */
export function visibleGroupTabs(group: PanelGroup): PanelTab[] {
  if (!group.collapsed) return group.tabs;

  const active = group.tabs.find((tab) => tab.isActive);
  if (active) return [active];

  if (!group.peek) return [];

  const accessed = group.tabs.filter((tab) => tab.lastAccessed > 0);
  if (accessed.length === 0) return [];

  return [
    accessed.reduce((best, tab) =>
      tab.lastAccessed > best.lastAccessed ? tab : best,
    ),
  ];
}
