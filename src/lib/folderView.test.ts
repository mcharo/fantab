import { describe, expect, it } from 'vitest';
import { visibleGroupTabs } from './folderView';
import type { PanelGroup, PanelTab } from '../types';

function panelTab(overrides: Partial<PanelTab> & { key: string }): PanelTab {
  return {
    tabId: null,
    homePinId: null,
    windowId: null,
    index: 0,
    order: 0,
    groupId: 'g1',
    url: '',
    homeUrl: null,
    title: '',
    faviconUrl: '',
    alias: null,
    displayName: '',
    pageTitle: '',
    isActive: false,
    isAudible: false,
    isMuted: false,
    isPlayingVideo: false,
    isNativePinned: false,
    isHomePin: false,
    isOpen: true,
    atHome: false,
    status: null,
    lastAccessed: 0,
    ...overrides,
  };
}

function group(tabs: PanelTab[], overrides: Partial<PanelGroup> = {}): PanelGroup {
  return {
    id: 'g1',
    title: 'Folder',
    collapsed: false,
    peek: false,
    pinned: false,
    order: 0,
    tabs,
    ...overrides,
  };
}

describe('visibleGroupTabs', () => {
  const a = panelTab({ key: 'a', lastAccessed: 100 });
  const b = panelTab({ key: 'b', lastAccessed: 200 });

  it('shows every member when expanded', () => {
    expect(visibleGroupTabs(group([a, b]))).toEqual([a, b]);
  });

  it('shows nothing when collapsed with no active member and not peeking', () => {
    expect(visibleGroupTabs(group([a, b], { collapsed: true }))).toEqual([]);
  });

  it('peeks the active member when collapsed', () => {
    const active = panelTab({ key: 'b', isActive: true, lastAccessed: 200 });
    expect(visibleGroupTabs(group([a, active], { collapsed: true }))).toEqual([
      active,
    ]);
  });

  it('keeps showing the last-active member in peek state after focus leaves', () => {
    // No member is active now, but the folder is peeking: the most recently
    // accessed member stays visible.
    expect(
      visibleGroupTabs(group([a, b], { collapsed: true, peek: true })),
    ).toEqual([b]);
  });

  it('prefers a currently-active member over the recency fallback', () => {
    const active = panelTab({ key: 'a', isActive: true, lastAccessed: 50 });
    expect(
      visibleGroupTabs(group([active, b], { collapsed: true, peek: true })),
    ).toEqual([active]);
  });

  it('peeks nothing when no member has ever been accessed', () => {
    const fresh1 = panelTab({ key: 'a', lastAccessed: 0 });
    const fresh2 = panelTab({ key: 'b', lastAccessed: 0 });
    expect(
      visibleGroupTabs(group([fresh1, fresh2], { collapsed: true, peek: true })),
    ).toEqual([]);
  });
});
