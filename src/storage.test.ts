import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignTabsToActiveSpaces,
  createSpace,
  deleteSpace,
  isStoredStateV6,
  loadState,
  moveHomePin,
  reconcileStateForTabs,
  renameSpace,
  renameTabAlias,
  switchSpace,
  updateSpaceDetails,
} from './storage';
import { DEFAULT_SPACE_ID, type StoredStateV6 } from './types';

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

const baseState: StoredStateV6 = {
  version: 6,
  activeSpaceByWindowId: {
    default: DEFAULT_SPACE_ID,
    '1': DEFAULT_SPACE_ID,
  },
  spaces: [
    {
      id: DEFAULT_SPACE_ID,
      name: 'Default',
      icon: 'circle',
      createdAt: 1,
      order: 0,
      homePins: [
        {
          id: 'pin-1',
          homeUrl: 'https://mail.example.com/',
          alias: 'Mail',
          faviconUrl: '',
          tabId: 1,
          lastKnownUrl: 'https://mail.example.com/',
          lastKnownTitle: 'Inbox',
          createdAt: 1,
          order: 0,
        },
        {
          id: 'pin-2',
          homeUrl: 'https://calendar.example.com/',
          alias: 'Calendar',
          faviconUrl: '',
          tabId: null,
          lastKnownUrl: null,
          lastKnownTitle: null,
          createdAt: 2,
          order: 1,
        },
      ],
    },
  ],
  tabAliases: {
    '1': 'Mail alias',
    '99': 'Closed tab',
  },
  tabSpaces: {
    '1': DEFAULT_SPACE_ID,
    '99': DEFAULT_SPACE_ID,
  },
};

describe('v6 storage state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects old state and loadState returns an empty default space', async () => {
    expect(isStoredStateV6({ version: 2, homePins: [], tabAliases: {} })).toBe(
      false,
    );

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            fantab_state: { version: 2, homePins: [], tabAliases: {} },
          }),
          set: vi.fn(),
        },
      },
    });

    const state = await loadState();
    expect(state.version).toBe(6);
    expect(state.activeSpaceByWindowId.default).toBe(DEFAULT_SPACE_ID);
    expect(state.tabAliases).toEqual({});
    expect(state.tabSpaces).toEqual({});
    expect(state.spaces).toHaveLength(1);
    expect(state.spaces[0]).toMatchObject({
      id: DEFAULT_SPACE_ID,
      name: 'Default',
      icon: 'circle',
      homePins: [],
      order: 0,
    });
  });

  it('migrates v3 state into the default window selection', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            fantab_state: {
              version: 3,
              activeSpaceId: 'focus',
              spaces: [
                baseState.spaces[0],
                {
                  id: 'focus',
                  name: 'Focus',
                  icon: 'diamond',
                  createdAt: 2,
                  order: 1,
                  homePins: [],
                },
              ],
              tabAliases: {},
            },
          }),
          set: vi.fn(),
        },
      },
    });

    const state = await loadState();
    expect(state.version).toBe(6);
    expect(state.activeSpaceByWindowId.default).toBe('focus');
    expect(state.tabSpaces).toEqual({});
    expect(state.spaces.map((space) => [space.id, space.icon])).toEqual([
      [DEFAULT_SPACE_ID, 'circle'],
      ['focus', 'diamond'],
    ]);
  });

  it('migrates v4 state and assigns icons to existing spaces', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            fantab_state: {
              version: 4,
              activeSpaceByWindowId: {
                default: DEFAULT_SPACE_ID,
                '1': 'focus',
              },
              spaces: [
                {
                  id: DEFAULT_SPACE_ID,
                  name: 'Default',
                  createdAt: 1,
                  order: 0,
                  homePins: [],
                },
                {
                  id: 'focus',
                  name: 'Focus',
                  createdAt: 2,
                  order: 1,
                  homePins: [],
                },
              ],
              tabAliases: {},
            },
          }),
          set: vi.fn(),
        },
      },
    });

    const state = await loadState();
    expect(state.version).toBe(6);
    expect(state.activeSpaceByWindowId['1']).toBe('focus');
    expect(state.tabSpaces).toEqual({});
    expect(state.spaces.map((space) => [space.id, space.icon])).toEqual([
      [DEFAULT_SPACE_ID, 'circle'],
      ['focus', 'diamond'],
    ]);
  });

  it('migrates v5 state and initializes tab ownership', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            fantab_state: {
              version: 5,
              activeSpaceByWindowId: baseState.activeSpaceByWindowId,
              spaces: baseState.spaces,
              tabAliases: baseState.tabAliases,
            },
          }),
          set: vi.fn(),
        },
      },
    });

    const state = await loadState();
    expect(state.version).toBe(6);
    expect(state.spaces[0].homePins).toHaveLength(2);
    expect(state.tabSpaces).toEqual({});
  });

  it('reconciles home pins and aliases against live tabs', () => {
    const reconciled = reconcileStateForTabs(baseState, [
      tab({
        id: 1,
        title: 'Inbox updated',
        url: 'https://mail.example.com/inbox',
        favIconUrl: 'mail.ico',
      }),
    ]);

    expect(reconciled.tabAliases).toEqual({ '1': 'Mail alias' });
    expect(reconciled.tabSpaces).toEqual({ '1': DEFAULT_SPACE_ID });
    expect(reconciled.spaces[0].homePins[0]).toMatchObject({
      tabId: 1,
      faviconUrl: 'mail.ico',
      lastKnownUrl: 'https://mail.example.com/inbox',
      lastKnownTitle: 'Inbox updated',
    });
  });

  it('clears stale home pin tab IDs across spaces', () => {
    const reconciled = reconcileStateForTabs(
      {
        ...baseState,
        spaces: [
          baseState.spaces[0],
          {
            id: 'focus',
            name: 'Focus',
            icon: 'diamond',
            createdAt: 2,
            order: 1,
            homePins: [
              {
                ...baseState.spaces[0].homePins[0],
                id: 'focus-pin',
                tabId: 42,
              },
            ],
          },
        ],
      },
      [],
    );

    expect(reconciled.spaces[0].homePins[0].tabId).toBeNull();
    expect(reconciled.spaces[1].homePins[0].tabId).toBeNull();
    expect(reconciled.tabAliases).toEqual({});
    expect(reconciled.tabSpaces).toEqual({});
  });

  it('assigns loose tabs to the active space for their window', () => {
    const assigned = assignTabsToActiveSpaces(
      {
        ...baseState,
        activeSpaceByWindowId: {
          default: DEFAULT_SPACE_ID,
          '1': 'focus',
          '2': DEFAULT_SPACE_ID,
        },
        spaces: [
          baseState.spaces[0],
          {
            id: 'focus',
            name: 'Focus',
            icon: 'diamond',
            createdAt: 2,
            order: 1,
            homePins: [],
          },
        ],
        tabSpaces: {},
      },
      [
        tab({ id: 1, windowId: 1 }),
        tab({ id: 10, windowId: 1 }),
        tab({ id: 11, windowId: 2 }),
      ],
    );

    expect(assigned.tabSpaces).toEqual({
      '1': DEFAULT_SPACE_ID,
      '10': 'focus',
      '11': DEFAULT_SPACE_ID,
    });
  });

  it('moves home pins inside the active space', () => {
    const moved = moveHomePin(baseState, 'pin-2', 0);
    expect(moved.spaces[0].homePins.map((pin) => [pin.id, pin.order])).toEqual([
      ['pin-2', 0],
      ['pin-1', 1],
    ]);
  });

  it('creates, switches, renames, and deletes spaces', () => {
    const withNewSpace = createSpace(baseState, '  Personal  ', 1);
    const personalSpace = withNewSpace.spaces[1];

    expect(personalSpace).toMatchObject({
      name: 'Personal',
      icon: 'diamond',
      homePins: [],
      order: 1,
    });
    expect(withNewSpace.activeSpaceByWindowId['1']).toBe(personalSpace.id);
    expect(withNewSpace.activeSpaceByWindowId.default).toBe(DEFAULT_SPACE_ID);

    const switched = switchSpace(withNewSpace, DEFAULT_SPACE_ID, 2);
    expect(switched.activeSpaceByWindowId['1']).toBe(personalSpace.id);
    expect(switched.activeSpaceByWindowId['2']).toBe(DEFAULT_SPACE_ID);

    const renamed = renameSpace(switched, personalSpace.id, 'Focus');
    expect(renamed.spaces[1].name).toBe('Focus');

    const deleted = deleteSpace(renamed, DEFAULT_SPACE_ID);
    expect(deleted.activeSpaceByWindowId.default).toBe(personalSpace.id);
    expect(deleted.activeSpaceByWindowId['1']).toBe(personalSpace.id);
    expect(deleted.activeSpaceByWindowId['2']).toBe(personalSpace.id);
    expect(deleted.tabSpaces).toEqual({
      '1': personalSpace.id,
      '99': personalSpace.id,
    });
    expect(deleted.spaces).toHaveLength(1);
    expect(deleted.spaces[0]).toMatchObject({
      id: personalSpace.id,
      name: 'Focus',
      icon: 'diamond',
      order: 0,
    });
  });

  it('updates space names and icons together', () => {
    const updated = updateSpaceDetails(baseState, DEFAULT_SPACE_ID, {
      name: '  Personal  ',
      icon: 'moon',
    });

    expect(updated.spaces[0]).toMatchObject({
      name: 'Personal',
      icon: 'moon',
    });
  });

  it('does not delete the last space', () => {
    expect(deleteSpace(baseState, DEFAULT_SPACE_ID)).toBe(baseState);
  });

  it('stores and clears regular tab aliases', () => {
    const renamed = renameTabAlias(baseState, 5, '  Research  ');
    expect(renamed.tabAliases['5']).toBe('Research');

    const cleared = renameTabAlias(renamed, 5, ' ');
    expect(cleared.tabAliases['5']).toBeUndefined();
  });
});
