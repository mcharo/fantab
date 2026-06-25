import { describe, expect, it } from 'vitest';
import {
  buildPanelState,
  nextFocusTabIdAfterClose,
  tabMatchesQuery,
  type CloseFocusTab,
} from './panelState';
import {
  DEFAULT_SPACE_ID,
  type FantabGroup,
  type StoredStateV7,
} from './types';

function tab(overrides: Partial<chrome.tabs.Tab>): chrome.tabs.Tab {
  return {
    active: false,
    highlighted: false,
    incognito: false,
    index: 0,
    pinned: false,
    selected: false,
    windowId: 1,
    ...overrides,
  } as chrome.tabs.Tab;
}

function fantabGroup(overrides: Partial<FantabGroup>): FantabGroup {
  return {
    id: 'group-1',
    title: 'Work',
    pinned: false,
    collapsed: false,
    order: 0,
    createdAt: 1,
    ...overrides,
  };
}

const state: StoredStateV7 = {
  version: 7,
  activeSpaceByWindowId: {
    default: DEFAULT_SPACE_ID,
    '1': DEFAULT_SPACE_ID,
  },
  lastActiveTabBySpace: {},
  spaces: [
    {
      id: DEFAULT_SPACE_ID,
      name: 'Default',
      icon: 'circle',
      createdAt: 1,
      order: 0,
      groups: [],
      homePins: [
        {
          id: 'pin-1',
          homeUrl: 'https://mail.example.com/',
          alias: 'Mail',
          faviconUrl: 'mail.ico',
          tabId: 3,
          lastKnownUrl: 'https://mail.example.com/',
          lastKnownTitle: 'Inbox',
          createdAt: 1,
          order: 0,
          groupId: null,
        },
      ],
    },
  ],
  tabAliases: {
    '1': 'Docs',
  },
  tabSpaces: {
    '1': DEFAULT_SPACE_ID,
    '2': DEFAULT_SPACE_ID,
    '3': DEFAULT_SPACE_ID,
  },
  tabGroupMembership: {},
};

describe('buildPanelState', () => {
  it('mirrors current-window tabs and layers aliases and home pins on top', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state,
      tabs: [
        tab({
          id: 1,
          active: true,
          index: 0,
          title: 'Google Docs',
          url: 'https://docs.example.com/',
        }),
        tab({
          id: 2,
          index: 1,
          title: 'Issue tracker',
          url: 'https://issues.example.com/',
        }),
        tab({
          id: 3,
          index: 2,
          title: 'Inbox',
          url: 'https://mail.example.com/',
        }),
      ],
    });

    expect(panelState.activeTabId).toBe(1);
    expect(panelState.activeSpaceId).toBe(DEFAULT_SPACE_ID);
    expect(panelState.spaces).toEqual([
      { id: DEFAULT_SPACE_ID, name: 'Default', icon: 'circle', order: 0 },
    ]);
    expect(panelState.homePins).toHaveLength(1);
    expect(panelState.homePins[0].displayName).toBe('Mail');
    expect(panelState.homePins[0].atHome).toBe(true);
    expect(
      panelState.ungroupedTabs.map((panelTab) => panelTab.displayName),
    ).toEqual(['Docs', 'Issue tracker']);
    expect(panelState.pinnedGroups).toHaveLength(0);
    expect(panelState.unpinnedGroups).toHaveLength(0);
  });

  it('partitions live tabs into an unpinned group via tabGroupMembership', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state: {
        ...state,
        spaces: [
          { ...state.spaces[0], groups: [fantabGroup({ id: 'work' })] },
        ],
        tabGroupMembership: { '2': 'work' },
      },
      tabs: [
        tab({ id: 1, index: 0, title: 'Docs', url: 'https://docs.example.com/' }),
        tab({
          id: 2,
          index: 1,
          title: 'Issue tracker',
          url: 'https://issues.example.com/',
        }),
      ],
    });

    expect(panelState.unpinnedGroups).toHaveLength(1);
    expect(panelState.unpinnedGroups[0].title).toBe('Work');
    expect(panelState.unpinnedGroups[0].pinned).toBe(false);
    expect(
      panelState.unpinnedGroups[0].tabs.map((panelTab) => panelTab.displayName),
    ).toEqual(['Issue tracker']);
    expect(
      panelState.ungroupedTabs.map((panelTab) => panelTab.displayName),
    ).toEqual(['Docs']);
  });

  it('drops an unpinned group whose last live tab has closed', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state: {
        ...state,
        spaces: [
          { ...state.spaces[0], groups: [fantabGroup({ id: 'work' })] },
        ],
        // Membership references a tab that is no longer open.
        tabGroupMembership: { '99': 'work' },
      },
      tabs: [
        tab({ id: 1, index: 0, title: 'Docs', url: 'https://docs.example.com/' }),
      ],
    });

    expect(panelState.unpinnedGroups).toHaveLength(0);
    expect(
      panelState.ungroupedTabs.map((panelTab) => panelTab.displayName),
    ).toEqual(['Docs']);
  });

  it('groups home pins into a pinned group and keeps it out of loose pins', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state: {
        ...state,
        spaces: [
          {
            ...state.spaces[0],
            groups: [fantabGroup({ id: 'reading', pinned: true, title: 'Reading' })],
            homePins: [
              { ...state.spaces[0].homePins[0], groupId: 'reading' },
            ],
          },
        ],
      },
      tabs: [
        tab({
          id: 3,
          index: 0,
          title: 'Inbox',
          url: 'https://mail.example.com/',
        }),
      ],
    });

    expect(panelState.pinnedGroups).toHaveLength(1);
    expect(panelState.pinnedGroups[0].title).toBe('Reading');
    expect(panelState.pinnedGroups[0].pinned).toBe(true);
    expect(
      panelState.pinnedGroups[0].tabs.map((panelTab) => panelTab.displayName),
    ).toEqual(['Mail']);
    expect(panelState.homePins).toHaveLength(0);
  });

  it('keeps a pinned group visible even when all its member pins are closed', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state: {
        ...state,
        spaces: [
          {
            ...state.spaces[0],
            groups: [fantabGroup({ id: 'reading', pinned: true, title: 'Reading' })],
            homePins: [
              {
                ...state.spaces[0].homePins[0],
                tabId: null,
                groupId: 'reading',
              },
            ],
          },
        ],
      },
      tabs: [],
    });

    expect(panelState.pinnedGroups).toHaveLength(1);
    expect(panelState.pinnedGroups[0].tabs).toHaveLength(1);
    expect(panelState.pinnedGroups[0].tabs[0].isOpen).toBe(false);
    expect(panelState.homePins).toHaveLength(0);
  });

  it('hides the placeholder page and nulls activeTabId when parked on it', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state,
      blankUrl: 'chrome-extension://abc/blank.html',
      tabs: [
        tab({
          id: 9,
          active: true,
          url: 'chrome-extension://abc/blank.html',
        }),
        tab({ id: 1, url: 'https://docs.example.com/' }),
      ],
    });

    expect(panelState.activeTabId).toBeNull();
    expect(
      panelState.ungroupedTabs.some((panelTab) => panelTab.tabId === 9),
    ).toBe(false);
    expect(panelState.ungroupedTabs.map((panelTab) => panelTab.tabId)).toEqual([
      1,
    ]);
  });

  it('keeps closed home pins visible in the active space', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state: {
        ...state,
        spaces: [
          {
            ...state.spaces[0],
            homePins: [{ ...state.spaces[0].homePins[0], tabId: null }],
          },
        ],
      },
      tabs: [],
    });

    expect(panelState.homePins).toHaveLength(1);
    expect(panelState.homePins[0].isOpen).toBe(false);
    expect(panelState.homePins[0].displayName).toBe('Mail');
  });

  it('hides inactive-space pins instead of showing them as ungrouped tabs', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state: {
        ...state,
        activeSpaceByWindowId: {
          ...state.activeSpaceByWindowId,
          '1': 'focus',
        },
        spaces: [
          state.spaces[0],
          {
            id: 'focus',
            name: 'Focus',
            icon: 'diamond',
            createdAt: 2,
            order: 1,
            groups: [],
            homePins: [],
          },
        ],
      },
      tabs: [
        tab({
          id: 3,
          index: 0,
          title: 'Inbox',
          url: 'https://mail.example.com/',
        }),
      ],
    });

    expect(panelState.activeSpaceId).toBe('focus');
    expect(panelState.homePins).toHaveLength(0);
    expect(panelState.ungroupedTabs).toHaveLength(0);
  });

  it('renders only regular tabs assigned to the active space', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state: {
        ...state,
        activeSpaceByWindowId: {
          ...state.activeSpaceByWindowId,
          '1': 'focus',
        },
        spaces: [
          state.spaces[0],
          {
            id: 'focus',
            name: 'Focus',
            icon: 'diamond',
            createdAt: 2,
            order: 1,
            groups: [],
            homePins: [],
          },
        ],
        tabSpaces: {
          '1': DEFAULT_SPACE_ID,
          '2': 'focus',
        },
      },
      tabs: [
        tab({
          id: 1,
          index: 0,
          title: 'Default docs',
          url: 'https://docs.example.com/',
        }),
        tab({
          id: 2,
          index: 1,
          title: 'Focus notes',
          url: 'https://notes.example.com/',
        }),
      ],
    });

    expect(panelState.activeSpaceId).toBe('focus');
    expect(panelState.ungroupedTabs.map((tab) => tab.displayName)).toEqual([
      'Focus notes',
    ]);
  });

  it('lets active-space pins win when another space references the same tab', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state: {
        ...state,
        activeSpaceByWindowId: {
          ...state.activeSpaceByWindowId,
          '1': 'focus',
        },
        spaces: [
          state.spaces[0],
          {
            id: 'focus',
            name: 'Focus',
            icon: 'diamond',
            createdAt: 2,
            order: 1,
            groups: [],
            homePins: [
              {
                id: 'focus-pin',
                homeUrl: 'https://mail.example.com/',
                alias: 'Focus Mail',
                faviconUrl: '',
                tabId: 3,
                lastKnownUrl: 'https://mail.example.com/',
                lastKnownTitle: 'Inbox',
                createdAt: 2,
                order: 0,
                groupId: null,
              },
            ],
          },
        ],
      },
      tabs: [
        tab({
          id: 3,
          index: 0,
          title: 'Inbox',
          url: 'https://mail.example.com/',
        }),
      ],
    });

    expect(panelState.homePins.map((panelTab) => panelTab.displayName)).toEqual([
      'Focus Mail',
    ]);
    expect(panelState.ungroupedTabs).toHaveLength(0);
  });

  it('defaults activeMedia to null and passes a provided value through', () => {
    const withoutMedia = buildPanelState({
      windowId: 1,
      state,
      tabs: [],
    });
    expect(withoutMedia.activeMedia).toBeNull();

    const activeMedia = {
      tabId: 2,
      title: 'Now playing',
      artist: 'Artist',
      faviconUrl: 'fav.ico',
      isPlaying: true,
      hasVideo: false,
      canNext: true,
      canPrev: true,
      volume: 0.5,
      muted: false,
    };
    const withMedia = buildPanelState({
      windowId: 1,
      state,
      tabs: [],
      activeMedia,
    });
    expect(withMedia.activeMedia).toEqual(activeMedia);
  });

  it('uses independent active spaces for different windows', () => {
    const panelState = buildPanelState({
      windowId: 2,
      state: {
        ...state,
        activeSpaceByWindowId: {
          default: DEFAULT_SPACE_ID,
          '1': DEFAULT_SPACE_ID,
          '2': 'focus',
        },
        spaces: [
          state.spaces[0],
          {
            id: 'focus',
            name: 'Focus',
            icon: 'diamond',
            createdAt: 2,
            order: 1,
            groups: [],
            homePins: [
              {
                id: 'pin-2',
                homeUrl: 'https://calendar.example.com/',
                alias: 'Calendar',
                faviconUrl: '',
                tabId: null,
                lastKnownUrl: null,
                lastKnownTitle: null,
                createdAt: 2,
                order: 0,
                groupId: null,
              },
            ],
          },
        ],
      },
      tabs: [],
    });

    expect(panelState.activeSpaceId).toBe('focus');
    expect(panelState.homePins.map((tab) => tab.displayName)).toEqual([
      'Calendar',
    ]);
  });
});

describe('tabMatchesQuery', () => {
  it('matches aliases, titles, URLs, and group titles', () => {
    const panelState = buildPanelState({
      windowId: 1,
      state,
      tabs: [
        tab({
          id: 1,
          title: 'Google Docs',
          url: 'https://docs.example.com/',
        }),
      ],
    });

    const [panelTab] = panelState.ungroupedTabs;
    expect(tabMatchesQuery(panelTab, 'docs')).toBe(true);
    expect(tabMatchesQuery(panelTab, 'google')).toBe(true);
    expect(tabMatchesQuery(panelTab, 'example')).toBe(true);
    expect(tabMatchesQuery(panelTab, 'planning', 'Planning')).toBe(true);
    expect(tabMatchesQuery(panelTab, 'missing')).toBe(false);
  });
});

describe('nextFocusTabIdAfterClose', () => {
  function focusTab(overrides: Partial<CloseFocusTab>): CloseFocusTab {
    return {
      id: 0,
      index: 0,
      windowId: 1,
      active: false,
      inActiveSpace: true,
      lastAccessed: 0,
      ...overrides,
    };
  }

  it('returns null when the active tab is not being closed', () => {
    const tabs = [
      focusTab({ id: 1, index: 0, active: true }),
      focusTab({ id: 2, index: 1 }),
    ];

    expect(nextFocusTabIdAfterClose(tabs, new Set([2]), 1)).toBeNull();
  });

  it('focuses the nearest same-space tab after the closed active tab', () => {
    const tabs = [
      focusTab({ id: 1, index: 0 }),
      focusTab({ id: 2, index: 1, active: true }),
      focusTab({ id: 3, index: 2 }),
    ];

    expect(nextFocusTabIdAfterClose(tabs, new Set([2]), 1)).toBe(3);
  });

  it('falls back to the nearest same-space tab before when none follow', () => {
    const tabs = [
      focusTab({ id: 1, index: 0 }),
      focusTab({ id: 2, index: 1 }),
      focusTab({ id: 3, index: 2, active: true }),
    ];

    expect(nextFocusTabIdAfterClose(tabs, new Set([3]), 1)).toBe(2);
  });

  it('ignores tabs from other spaces', () => {
    const tabs = [
      focusTab({ id: 1, index: 0, inActiveSpace: false }),
      focusTab({ id: 2, index: 1, active: true }),
      focusTab({ id: 3, index: 2, inActiveSpace: false }),
    ];

    expect(nextFocusTabIdAfterClose(tabs, new Set([2]), 1)).toBeNull();
  });

  it('skips every tab being closed when a whole group closes', () => {
    const tabs = [
      focusTab({ id: 1, index: 0 }),
      focusTab({ id: 2, index: 1, active: true }),
      focusTab({ id: 3, index: 2 }),
      focusTab({ id: 4, index: 3 }),
    ];

    expect(nextFocusTabIdAfterClose(tabs, new Set([2, 3]), 1)).toBe(4);
  });

  it('only considers tabs in the target window', () => {
    const tabs = [
      focusTab({ id: 1, index: 0, windowId: 2 }),
      focusTab({ id: 2, index: 1, windowId: 1, active: true }),
      focusTab({ id: 3, index: 2, windowId: 2 }),
    ];

    expect(nextFocusTabIdAfterClose(tabs, new Set([2]), 1)).toBeNull();
  });

  it('prefers the most recently active same-space tab over proximity', () => {
    const tabs = [
      focusTab({ id: 1, index: 0, lastAccessed: 500 }),
      focusTab({ id: 2, index: 1, active: true, lastAccessed: 900 }),
      focusTab({ id: 3, index: 2, lastAccessed: 100 }),
    ];

    // Index proximity would pick the following tab (id 3); recency wins (id 1).
    expect(nextFocusTabIdAfterClose(tabs, new Set([2]), 1)).toBe(1);
  });

  it('ignores recency of tabs in other spaces', () => {
    const tabs = [
      focusTab({ id: 1, index: 0, inActiveSpace: false, lastAccessed: 900 }),
      focusTab({ id: 2, index: 1, active: true, lastAccessed: 800 }),
      focusTab({ id: 3, index: 2, lastAccessed: 300 }),
    ];

    expect(nextFocusTabIdAfterClose(tabs, new Set([2]), 1)).toBe(3);
  });
});
