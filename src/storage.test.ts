import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addHomePinToGroup,
  assignTabToSpace,
  assignTabsToActiveSpaces,
  createGroup,
  createSpace,
  deleteSpace,
  demoteHomePinToTab,
  findGroupById,
  findHomePinByTabId,
  getHomePinInstanceByTabId,
  getHomePinInstanceForWindow,
  getHomePinTabIds,
  getRememberedActiveTabId,
  isStoredStateV8,
  loadState,
  moveGroup,
  moveGroupToSpace,
  migrateTabId,
  moveHomePin,
  moveHomePinRelativeTo,
  moveHomePinToSpace,
  normalizeState,
  planUnpinnedReorder,
  rememberActiveTabForSpace,
  reattachHomePinsToRestoredTabs,
  reconcileStateForTabs,
  removeGroup,
  removeHomePin,
  removeHomePinInstanceByTabId,
  removeTabFromGroup,
  renameSpace,
  renameTabAlias,
  reorderPinnedSection,
  setGroupPinned,
  setHomePinGroup,
  setTabGroup,
  switchSpace,
  unpinGroup,
  updateGroup,
  updateHomePin,
  updateSpaceDetails,
  upsertHomePinInstance,
} from './storage';
import { DEFAULT_SPACE_ID, type StoredStateV8 } from './types';

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

const baseState: StoredStateV8 = {
  version: 8,
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
      homePins: [
        {
          id: 'pin-1',
          homeUrl: 'https://mail.example.com/',
          alias: 'Mail',
          aliasCustom: true,
          faviconUrl: '',
          instances: [
            {
              tabId: 1,
              windowId: 1,
              lastKnownUrl: 'https://mail.example.com/',
              lastKnownTitle: 'Inbox',
            },
          ],
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
          instances: [],
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

describe('v8 storage state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects old state and loadState returns an empty default space', async () => {
    expect(isStoredStateV8({ version: 2, homePins: [], tabAliases: {} })).toBe(
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
    expect(state.version).toBe(8);
    expect(state.activeSpaceByWindowId.default).toBe(DEFAULT_SPACE_ID);
    expect(state.lastActiveTabBySpace).toEqual({});
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
    expect(state.version).toBe(8);
    expect(state.activeSpaceByWindowId.default).toBe('focus');
    expect(state.lastActiveTabBySpace).toEqual({});
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
    expect(state.version).toBe(8);
    expect(state.activeSpaceByWindowId['1']).toBe('focus');
    expect(state.lastActiveTabBySpace).toEqual({});
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
    expect(state.version).toBe(8);
    expect(state.spaces[0].homePins).toHaveLength(2);
    expect(state.lastActiveTabBySpace).toEqual({});
    expect(state.tabSpaces).toEqual({});
  });

  it('migrates v6 state and initializes empty group fields', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            fantab_state: {
              version: 6,
              activeSpaceByWindowId: baseState.activeSpaceByWindowId,
              lastActiveTabBySpace: {},
              spaces: [
                {
                  id: DEFAULT_SPACE_ID,
                  name: 'Default',
                  icon: 'circle',
                  createdAt: 1,
                  order: 0,
                  homePins: [],
                },
              ],
              tabAliases: {},
              tabSpaces: {},
            },
          }),
          set: vi.fn(),
        },
      },
    });

    const state = await loadState();
    expect(state.version).toBe(8);
    expect(state.spaces[0].groups).toEqual([]);
    expect(state.tabGroupMembership).toEqual({});
  });

  it('migrates v7 home pin bindings into v8 instances', async () => {
    const legacyV7State = {
      ...baseState,
      version: 7,
      spaces: baseState.spaces.map((space) => ({
        ...space,
        homePins: space.homePins.map((pin) => {
          const { instances, ...logicalPin } = pin;
          return {
            ...logicalPin,
            tabId: instances[0]?.tabId ?? null,
          };
        }),
      })),
    };

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ fantab_state: legacyV7State }),
          set: vi.fn(),
        },
      },
    });

    const state = await loadState();

    expect(state.version).toBe(8);
    expect(state.spaces[0].homePins[0]).toMatchObject({
      instances: [
        {
          tabId: 1,
          windowId: null,
          lastKnownUrl: 'https://mail.example.com/',
          lastKnownTitle: 'Inbox',
        },
      ],
    });
    expect(state.spaces[0].homePins[1]).toMatchObject({ instances: [] });
  });

  it('converts legacy pin bindings consistently from v3 through v6', async () => {
    const legacySpace = {
      ...baseState.spaces[0],
      homePins: baseState.spaces[0].homePins.map((pin) => {
        const { instances, ...logicalPin } = pin;
        return { ...logicalPin, tabId: instances[0]?.tabId ?? null };
      }),
    };
    const legacyStates = [
      {
        version: 3,
        activeSpaceId: DEFAULT_SPACE_ID,
        spaces: [legacySpace],
        tabAliases: {},
      },
      {
        version: 4,
        activeSpaceByWindowId: baseState.activeSpaceByWindowId,
        spaces: [legacySpace],
        tabAliases: {},
      },
      {
        version: 5,
        activeSpaceByWindowId: baseState.activeSpaceByWindowId,
        spaces: [legacySpace],
        tabAliases: {},
      },
      {
        version: 6,
        activeSpaceByWindowId: baseState.activeSpaceByWindowId,
        lastActiveTabBySpace: {},
        spaces: [legacySpace],
        tabAliases: {},
        tabSpaces: {},
      },
    ];

    for (const legacyState of legacyStates) {
      vi.stubGlobal('chrome', {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({ fantab_state: legacyState }),
            set: vi.fn(),
          },
        },
      });

      const state = await loadState();
      expect(state.spaces[0].homePins[0].instances).toEqual([
        {
          tabId: 1,
          windowId: null,
          lastKnownUrl: 'https://mail.example.com/',
          lastKnownTitle: 'Inbox',
        },
      ]);
      expect(state.spaces[0].homePins[1].instances).toEqual([]);
    }
  });

  it('normalizes invalid and duplicate instance records deterministically', () => {
    const normalized = normalizeState({
      ...baseState,
      spaces: [
        {
          ...baseState.spaces[0],
          homePins: [
            {
              ...baseState.spaces[0].homePins[0],
              instances: [
                baseState.spaces[0].homePins[0].instances[0],
                {
                  tabId: 1,
                  windowId: 2,
                  lastKnownUrl: null,
                  lastKnownTitle: null,
                },
                {
                  tabId: 2,
                  windowId: 1,
                  lastKnownUrl: null,
                  lastKnownTitle: null,
                },
                {
                  tabId: Number.NaN,
                  windowId: 3,
                  lastKnownUrl: null,
                  lastKnownTitle: null,
                },
                {
                  tabId: 3,
                  windowId: null,
                  lastKnownUrl: null,
                  lastKnownTitle: null,
                },
                {
                  tabId: 4,
                  windowId: null,
                  lastKnownUrl: null,
                  lastKnownTitle: null,
                },
              ],
            },
            {
              ...baseState.spaces[0].homePins[1],
              instances: [
                {
                  tabId: 3,
                  windowId: 4,
                  lastKnownUrl: null,
                  lastKnownTitle: null,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(normalized.spaces[0].homePins[0].instances.map((item) => item.tabId)).toEqual([
      1, 3, 4,
    ]);
    expect(normalized.spaces[0].homePins[1].instances).toEqual([]);
  });

  it('normalizes existing v8 state that predates active-tab memory', async () => {
    const storedState = {
      version: 8,
      activeSpaceByWindowId: baseState.activeSpaceByWindowId,
      spaces: baseState.spaces,
      tabAliases: {},
      tabSpaces: {},
    };

    expect(isStoredStateV8(storedState)).toBe(true);

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ fantab_state: storedState }),
          set: vi.fn(),
        },
      },
    });

    const state = await loadState();
    expect(state.lastActiveTabBySpace).toEqual({});
  });

  it('reconciles home pins, aliases, and remembered active tabs against live tabs', () => {
    const reconciled = reconcileStateForTabs(
      {
        ...baseState,
        lastActiveTabBySpace: {
          [`1:${DEFAULT_SPACE_ID}`]: 1,
          '1:closed': 99,
        },
      },
      [
        tab({
          id: 1,
          title: 'Inbox updated',
          url: 'https://mail.example.com/inbox',
          favIconUrl: 'mail.ico',
        }),
      ],
    );

    expect(reconciled.tabAliases).toEqual({ '1': 'Mail alias' });
    expect(reconciled.lastActiveTabBySpace).toEqual({
      [`1:${DEFAULT_SPACE_ID}`]: 1,
    });
    expect(reconciled.tabSpaces).toEqual({ '1': DEFAULT_SPACE_ID });
    expect(reconciled.spaces[0].homePins[0]).toMatchObject({
      instances: [
        {
          tabId: 1,
          windowId: 1,
          lastKnownUrl: 'https://mail.example.com/inbox',
          lastKnownTitle: 'Inbox updated',
        },
      ],
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
                instances: [
                  {
                    tabId: 42,
                    windowId: 2,
                    lastKnownUrl: 'https://mail.example.com/',
                    lastKnownTitle: 'Inbox',
                  },
                ],
              },
            ],
          },
        ],
      },
      [],
    );

    expect(reconciled.spaces[0].homePins[0].instances).toEqual([]);
    expect(reconciled.spaces[1].homePins[0].instances).toEqual([]);
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

  it('moves a home pin before/after a target pin', () => {
    const order = (state: StoredStateV8) =>
      [...state.spaces[0].homePins]
        .sort((a, b) => a.order - b.order)
        .map((pin) => pin.id);

    const movedBefore = moveHomePinRelativeTo(
      baseState,
      'pin-2',
      'pin-1',
      'before',
    );
    expect(order(movedBefore)).toEqual(['pin-2', 'pin-1']);

    const movedAfter = moveHomePinRelativeTo(baseState, 'pin-1', 'pin-2', 'after');
    expect(order(movedAfter)).toEqual(['pin-2', 'pin-1']);
  });

  it('moves home pins between spaces and keeps open tabs assigned to the target space', () => {
    const moved = moveHomePinToSpace(
      {
        ...baseState,
        spaces: [
          baseState.spaces[0],
          {
            id: 'focus',
            name: 'Focus',
            icon: 'diamond',
            createdAt: 3,
            order: 1,
            homePins: [
              {
                id: 'focus-pin',
                homeUrl: 'https://notes.example.com/',
                alias: 'Notes',
                faviconUrl: '',
                instances: [],
                lastKnownUrl: null,
                lastKnownTitle: null,
                createdAt: 3,
                order: 0,
              },
            ],
          },
        ],
      },
      'pin-1',
      'focus',
    );

    expect(moved.spaces[0].homePins.map((pin) => [pin.id, pin.order])).toEqual([
      ['pin-2', 0],
    ]);
    expect(moved.spaces[1].homePins.map((pin) => [pin.id, pin.order])).toEqual([
      ['focus-pin', 0],
      ['pin-1', 1],
    ]);
    expect(moved.tabSpaces['1']).toBe('focus');
  });

  it('remembers the active tab independently per window and space', () => {
    const remembered = rememberActiveTabForSpace(
      baseState,
      1,
      DEFAULT_SPACE_ID,
      1,
    );

    expect(
      getRememberedActiveTabId(remembered, 1, DEFAULT_SPACE_ID),
    ).toBe(1);
    expect(
      getRememberedActiveTabId(remembered, 2, DEFAULT_SPACE_ID),
    ).toBeNull();
  });

  it('assigns regular tabs to another space', () => {
    const moved = assignTabToSpace(
      {
        ...baseState,
        spaces: [
          baseState.spaces[0],
          {
            id: 'focus',
            name: 'Focus',
            icon: 'diamond',
            createdAt: 3,
            order: 1,
            homePins: [],
          },
        ],
      },
      99,
      'focus',
    );

    expect(moved.tabSpaces['99']).toBe('focus');
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
    expect(deleted.lastActiveTabBySpace).toEqual({});
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

describe('home pin instances', () => {
  const secondInstance = {
    tabId: 2,
    windowId: 2,
    lastKnownUrl: 'https://mail.example.com/sent',
    lastKnownTitle: 'Sent',
  };

  function twoWindowState(): StoredStateV8 {
    return {
      ...updateHomePin(baseState, 'pin-1', {
        instances: [
          baseState.spaces[0].homePins[0].instances[0],
          secondInstance,
        ],
      }),
      tabSpaces: {
        ...baseState.tabSpaces,
        '2': DEFAULT_SPACE_ID,
      },
    };
  }

  it('looks up, upserts, and removes one instance without disturbing another', () => {
    const initialPin = baseState.spaces[0].homePins[0];
    expect(getHomePinInstanceForWindow(initialPin, 1)?.tabId).toBe(1);
    expect(getHomePinInstanceByTabId(initialPin, 1)?.windowId).toBe(1);
    expect(getHomePinTabIds(initialPin)).toEqual([1]);
    expect(findHomePinByTabId(baseState, 1)?.id).toBe('pin-1');

    const withSecond = upsertHomePinInstance(
      baseState,
      'pin-1',
      secondInstance,
    );
    expect(getHomePinTabIds(withSecond.spaces[0].homePins[0])).toEqual([1, 2]);

    const replacedInWindowTwo = upsertHomePinInstance(
      withSecond,
      'pin-1',
      { ...secondInstance, tabId: 3 },
    );
    expect(getHomePinTabIds(replacedInWindowTwo.spaces[0].homePins[0])).toEqual([
      1, 3,
    ]);

    const removed = removeHomePinInstanceByTabId(replacedInWindowTwo, 1);
    expect(getHomePinTabIds(removed.spaces[0].homePins[0])).toEqual([3]);
  });

  it('keeps surviving windows pinned when another instance closes', () => {
    const reconciled = reconcileStateForTabs(twoWindowState(), [
      tab({
        id: 2,
        windowId: 2,
        url: 'https://mail.example.com/sent',
        title: 'Sent',
      }),
    ]);

    expect(reconciled.spaces[0].homePins[0].instances).toEqual([
      secondInstance,
    ]);
    expect(reconciled.tabSpaces['2']).toBe(DEFAULT_SPACE_ID);
  });

  it('corrects every live instance to its pin space during reconciliation', () => {
    const state = {
      ...twoWindowState(),
      spaces: [
        ...twoWindowState().spaces,
        {
          id: 'focus',
          name: 'Focus',
          icon: 'diamond' as const,
          homePins: [],
          createdAt: 2,
          order: 1,
        },
      ],
      tabSpaces: {
        ...twoWindowState().tabSpaces,
        '1': 'focus',
        '2': 'focus',
      },
    };
    const reconciled = reconcileStateForTabs(state, [
      tab({ id: 1, windowId: 1 }),
      tab({ id: 2, windowId: 2 }),
    ]);

    expect(reconciled.tabSpaces['1']).toBe(DEFAULT_SPACE_ID);
    expect(reconciled.tabSpaces['2']).toBe(DEFAULT_SPACE_ID);
  });

  it('preserves missing instances only during the startup reattach window', () => {
    const preserved = reconcileStateForTabs(twoWindowState(), [], true);
    expect(getHomePinTabIds(preserved.spaces[0].homePins[0])).toEqual([1, 2]);

    const pruned = reconcileStateForTabs(twoWindowState(), [], false);
    expect(pruned.spaces[0].homePins[0].instances).toEqual([]);
  });

  it('repairs a same-window conflict by keeping the most recently accessed tab', () => {
    const conflicted = updateHomePin(baseState, 'pin-1', {
      instances: [
        baseState.spaces[0].homePins[0].instances[0],
        { ...secondInstance, windowId: 1 },
      ],
    });
    const reconciled = reconcileStateForTabs(conflicted, [
      tab({ id: 1, windowId: 1, lastAccessed: 10 }),
      tab({ id: 2, windowId: 1, lastAccessed: 20 }),
    ]);

    expect(getHomePinTabIds(reconciled.spaces[0].homePins[0])).toEqual([2]);
    expect(reconciled.tabSpaces['1']).toBe(DEFAULT_SPACE_ID);
    expect(reconciled.tabSpaces['2']).toBe(DEFAULT_SPACE_ID);
  });

  it('moves every live instance with its logical pin', () => {
    const withSpace = createSpace(twoWindowState(), 'Focus');
    const targetSpaceId = withSpace.spaces[1].id;
    const moved = moveHomePinToSpace(withSpace, 'pin-1', targetSpaceId);

    expect(moved.tabSpaces['1']).toBe(targetSpaceId);
    expect(moved.tabSpaces['2']).toBe(targetSpaceId);
  });

  it('keeps an explicitly moved tab when its destination window has an instance', () => {
    const state = twoWindowState();
    const movedInstance = {
      ...state.spaces[0].homePins[0].instances[0],
      windowId: 2,
    };
    const moved = upsertHomePinInstance(
      state,
      'pin-1',
      movedInstance,
      DEFAULT_SPACE_ID,
    );

    expect(moved.spaces[0].homePins[0].instances).toEqual([movedInstance]);
    // The displaced tab stays assigned to the space as an ordinary loose tab.
    expect(moved.tabSpaces['2']).toBe(DEFAULT_SPACE_ID);
  });

  it('removes a logical pin while leaving all instance tabs loose', () => {
    const removed = removeHomePin(
      twoWindowState(),
      'pin-1',
      DEFAULT_SPACE_ID,
    );

    expect(removed.spaces[0].homePins.map((pin) => pin.id)).toEqual(['pin-2']);
    expect(removed.tabSpaces['1']).toBe(DEFAULT_SPACE_ID);
    expect(removed.tabSpaces['2']).toBe(DEFAULT_SPACE_ID);
  });
});

describe('reattachHomePinsToRestoredTabs', () => {
  // A pin whose tab disappeared (e.g. after a Chrome restart), plus matching
  // helpers, kept independent of `baseState` so tests never mutate it.
  function lostPinState(
    overrides: Partial<StoredStateV8['spaces'][number]['homePins'][number]> = {},
  ): StoredStateV8 {
    return {
      version: 8,
      activeSpaceByWindowId: { default: DEFAULT_SPACE_ID, '1': DEFAULT_SPACE_ID },
      lastActiveTabBySpace: {},
      tabAliases: {},
      tabSpaces: {},
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
              instances: [
                {
                  tabId: 1, // stale id from the previous session
                  windowId: 1,
                  lastKnownUrl: 'https://mail.example.com/inbox',
                  lastKnownTitle: 'Inbox',
                },
              ],
              lastKnownUrl: 'https://mail.example.com/inbox',
              lastKnownTitle: 'Inbox',
              createdAt: 1,
              order: 0,
              ...overrides,
            },
          ],
        },
      ],
    };
  }

  it('rebinds a lost pin to a restored tab matching lastKnownUrl', () => {
    const result = reattachHomePinsToRestoredTabs(lostPinState(), [
      tab({
        id: 1000,
        url: 'https://mail.example.com/inbox',
        title: 'Inbox updated',
        favIconUrl: 'mail.ico',
        windowId: 1,
      }),
    ]);

    expect(result.spaces[0].homePins[0]).toMatchObject({
      instances: [
        {
          tabId: 1000,
          windowId: 1,
          lastKnownUrl: 'https://mail.example.com/inbox',
          lastKnownTitle: 'Inbox updated',
        },
      ],
      faviconUrl: 'mail.ico',
      lastKnownUrl: 'https://mail.example.com/inbox',
      lastKnownTitle: 'Inbox updated',
    });
    expect(result.tabSpaces['1000']).toBe(DEFAULT_SPACE_ID);
  });

  it('reattaches restored instances independently in two windows', () => {
    const state = lostPinState({
      instances: [
        {
          tabId: 1,
          windowId: 1,
          lastKnownUrl: 'https://mail.example.com/inbox',
          lastKnownTitle: 'Inbox',
        },
        {
          tabId: 2,
          windowId: 2,
          lastKnownUrl: 'https://mail.example.com/sent',
          lastKnownTitle: 'Sent',
        },
      ],
    });
    const result = reattachHomePinsToRestoredTabs(state, [
      tab({
        id: 1000,
        windowId: 1,
        url: 'https://mail.example.com/inbox',
      }),
      tab({
        id: 2000,
        windowId: 2,
        url: 'https://mail.example.com/sent',
      }),
    ]);

    expect(result.spaces[0].homePins[0].instances).toMatchObject([
      { tabId: 1000, windowId: 1 },
      { tabId: 2000, windowId: 2 },
    ]);
    expect(result.tabSpaces).toMatchObject({
      '1000': DEFAULT_SPACE_ID,
      '2000': DEFAULT_SPACE_ID,
    });
  });

  it('reconcile alone does not rebind a closed pin to a newly opened tab', () => {
    // Regression: normal browsing must not claim a deliberately opened tab whose
    // URL happens to match a closed pin (e.g. cmd+t -> a pinned site's URL).
    const state = lostPinState({ instances: [] });
    const reconciled = reconcileStateForTabs(state, [
      tab({ id: 1000, url: 'https://mail.example.com/inbox', windowId: 1 }),
    ]);

    expect(reconciled.spaces[0].homePins[0].instances).toEqual([]);
    // The new tab is a normal tab in its window's active space, not the pin.
    expect(reconciled.tabSpaces['1000']).toBe(DEFAULT_SPACE_ID);
  });

  it('matches restored tabs that report only pendingUrl while unloaded', () => {
    const result = reattachHomePinsToRestoredTabs(lostPinState(), [
      tab({ id: 1000, pendingUrl: 'https://mail.example.com/inbox' }),
    ]);

    expect(result.spaces[0].homePins[0].instances[0].tabId).toBe(1000);
  });

  it('falls back to homeUrl when lastKnownUrl does not match', () => {
    const result = reattachHomePinsToRestoredTabs(
      lostPinState({
        lastKnownUrl: 'https://mail.example.com/sent',
        instances: [
          {
            tabId: 1,
            windowId: 1,
            lastKnownUrl: 'https://mail.example.com/sent',
            lastKnownTitle: 'Sent',
          },
        ],
      }),
      [tab({ id: 1000, url: 'https://mail.example.com/' })],
    );

    expect(result.spaces[0].homePins[0].instances[0].tabId).toBe(1000);
  });

  it('does not rebind on a same-domain tab with a different path (exact only)', () => {
    const state = lostPinState({
      lastKnownUrl: null,
      instances: [
        {
          tabId: 1,
          windowId: 1,
          lastKnownUrl: null,
          lastKnownTitle: 'Inbox',
        },
      ],
    });
    const result = reattachHomePinsToRestoredTabs(state, [
      tab({ id: 1000, url: 'https://mail.example.com/some/other/path' }),
    ]);

    expect(result).toBe(state); // unchanged
    // And through the full pipeline the stale binding is cleared, not rebound.
    const reconciled = reconcileStateForTabs(state, [
      tab({ id: 1000, url: 'https://mail.example.com/some/other/path' }),
    ]);
    expect(reconciled.spaces[0].homePins[0].instances).toEqual([]);
  });

  it('leaves a pin closed when no live tab matches', () => {
    const reconciled = reconcileStateForTabs(lostPinState(), [
      tab({ id: 1000, url: 'https://unrelated.example.org/' }),
    ]);
    expect(reconciled.spaces[0].homePins[0].instances).toEqual([]);
  });

  it('never reuses a tab already held by another live pin', () => {
    const state: StoredStateV8 = {
      ...lostPinState({ id: 'lost', instances: [] }),
      spaces: [
        {
          id: DEFAULT_SPACE_ID,
          name: 'Default',
          icon: 'circle',
          createdAt: 1,
          order: 0,
          homePins: [
            {
              id: 'live',
              homeUrl: 'https://mail.example.com/',
              alias: 'Mail (open)',
              faviconUrl: '',
              instances: [
                {
                  tabId: 1000,
                  windowId: 1,
                  lastKnownUrl: 'https://mail.example.com/inbox',
                  lastKnownTitle: 'Inbox',
                },
              ],
              lastKnownUrl: 'https://mail.example.com/inbox',
              lastKnownTitle: 'Inbox',
              createdAt: 1,
              order: 0,
            },
            {
              id: 'lost',
              homeUrl: 'https://mail.example.com/',
              alias: 'Mail (lost)',
              faviconUrl: '',
              instances: [],
              lastKnownUrl: 'https://mail.example.com/inbox',
              lastKnownTitle: 'Inbox',
              createdAt: 2,
              order: 1,
            },
          ],
        },
      ],
    };

    const result = reattachHomePinsToRestoredTabs(state, [
      tab({ id: 1000, url: 'https://mail.example.com/inbox' }),
    ]);

    expect(result).toBe(state); // the only matching tab is already claimed
  });

  it('moves a rebound tab into the pin’s own space, not the active space', () => {
    const state: StoredStateV8 = {
      version: 8,
      activeSpaceByWindowId: { default: DEFAULT_SPACE_ID, '1': DEFAULT_SPACE_ID },
      lastActiveTabBySpace: {},
      tabAliases: {},
      // Simulate a prior reconcile having parked the restored tab in the active
      // (default) space as a loose tab.
      tabSpaces: { '1000': DEFAULT_SPACE_ID },
      spaces: [
        {
          id: DEFAULT_SPACE_ID,
          name: 'Default',
          icon: 'circle',
          createdAt: 1,
          order: 0,
          homePins: [],
        },
        {
          id: 'focus',
          name: 'Focus',
          icon: 'diamond',
          createdAt: 2,
          order: 1,
          homePins: [
            {
              id: 'focus-pin',
              homeUrl: 'https://notes.example.com/',
              alias: 'Notes',
              faviconUrl: '',
              instances: [
                {
                  tabId: 7, // stale
                  windowId: 1,
                  lastKnownUrl: 'https://notes.example.com/today',
                  lastKnownTitle: 'Today',
                },
              ],
              lastKnownUrl: 'https://notes.example.com/today',
              lastKnownTitle: 'Today',
              createdAt: 2,
              order: 0,
            },
          ],
        },
      ],
    };

    const result = reattachHomePinsToRestoredTabs(state, [
      tab({ id: 1000, url: 'https://notes.example.com/today' }),
    ]);

    expect(result.spaces[1].homePins[0].instances[0].tabId).toBe(1000);
    expect(result.tabSpaces['1000']).toBe('focus');
  });

  it('prefers a lastKnownUrl match over another pin’s homeUrl match', () => {
    const state: StoredStateV8 = {
      version: 8,
      activeSpaceByWindowId: { default: DEFAULT_SPACE_ID },
      lastActiveTabBySpace: {},
      tabAliases: {},
      tabSpaces: {},
      spaces: [
        {
          id: DEFAULT_SPACE_ID,
          name: 'Default',
          icon: 'circle',
          createdAt: 1,
          order: 0,
          homePins: [
            {
              id: 'home-only',
              homeUrl: 'https://site.com/page',
              alias: 'Home only',
              faviconUrl: '',
              instances: [
                {
                  tabId: 1,
                  windowId: 1,
                  lastKnownUrl: null,
                  lastKnownTitle: null,
                },
              ],
              lastKnownUrl: null,
              lastKnownTitle: null,
              createdAt: 1,
              order: 0,
            },
            {
              id: 'last-known',
              homeUrl: 'https://site.com/',
              alias: 'Last known',
              faviconUrl: '',
              instances: [
                {
                  tabId: 2,
                  windowId: 1,
                  lastKnownUrl: 'https://site.com/page',
                  lastKnownTitle: 'Page',
                },
              ],
              lastKnownUrl: 'https://site.com/page',
              lastKnownTitle: 'Page',
              createdAt: 2,
              order: 1,
            },
          ],
        },
      ],
    };

    const result = reattachHomePinsToRestoredTabs(state, [
      tab({ id: 1000, url: 'https://site.com/page' }),
    ]);

    const byId = Object.fromEntries(
      result.spaces[0].homePins.map((pin) => [
        pin.id,
        pin.instances[0]?.tabId ?? null,
      ]),
    );
    expect(byId['last-known']).toBe(1000);
    // Reattach itself preserves unmatched stale metadata for partial session
    // restore; a later ordinary reconcile prunes it after the startup window.
    expect(byId['home-only']).toBe(1);
  });
});

describe('fantab tab groups', () => {
  it('creates a group in the active space and assigns members', () => {
    const created = createGroup(
      baseState,
      { title: '  Reading  ', pinned: false },
      DEFAULT_SPACE_ID,
    );

    expect(created.groupId).toBeTruthy();
    const group = findGroupById(created.state, created.groupId);
    expect(group).toMatchObject({
      title: 'Reading',
      pinned: false,
      collapsed: false,
      order: 0,
    });

    const withTab = setTabGroup(created.state, 42, created.groupId);
    expect(withTab.tabGroupMembership?.['42']).toBe(created.groupId);

    const withoutTab = removeTabFromGroup(withTab, 42);
    expect(withoutTab.tabGroupMembership?.['42']).toBeUndefined();
  });

  it('updates title and collapse without blanking the title', () => {
    const created = createGroup(baseState, { pinned: true }, DEFAULT_SPACE_ID);
    const updated = updateGroup(created.state, created.groupId, {
      title: '   ',
      collapsed: true,
    });

    const group = findGroupById(updated, created.groupId);
    expect(group?.title).toBe('New Folder'); // blank title is ignored
    expect(group?.collapsed).toBe(true);
  });

  it('sets a home pin into a pinned group and toggles pinned state', () => {
    const created = createGroup(
      baseState,
      { title: 'Reading', pinned: true },
      DEFAULT_SPACE_ID,
    );
    const grouped = setHomePinGroup(
      created.state,
      'pin-1',
      created.groupId,
      DEFAULT_SPACE_ID,
    );

    expect(
      grouped.spaces[0].homePins.find((pin) => pin.id === 'pin-1')?.groupId,
    ).toBe(created.groupId);

    const unpinnedGroup = setGroupPinned(grouped, created.groupId, false);
    expect(findGroupById(unpinnedGroup, created.groupId)?.pinned).toBe(false);
  });

  it('reorders groups within their space', () => {
    const first = createGroup(baseState, { title: 'A', pinned: true });
    const second = createGroup(first.state, { title: 'B', pinned: true });

    const moved = moveGroup(second.state, second.groupId, 0);
    expect(
      (moved.spaces[0].groups ?? []).map((group) => [group.title, group.order]),
    ).toEqual([
      ['B', 0],
      ['A', 1],
    ]);
  });

  it('reorders a folder relative to a loose pin in the pinned section', () => {
    // Folder F holds pin-1; pin-2 stays loose (orders: pin-1=0, pin-2=1).
    const folder = createGroup(baseState, { title: 'F', pinned: true });
    const withMember = addHomePinToGroup(folder.state, 'pin-1', folder.groupId);

    const order = (state: StoredStateV8) =>
      [...state.spaces[0].homePins]
        .sort((a, b) => a.order - b.order)
        .map((pin) => pin.id);

    // Drop the folder after the loose pin: pin-2 leads, the folder follows.
    const movedAfter = reorderPinnedSection(
      withMember,
      { kind: 'folder', groupId: folder.groupId },
      { kind: 'pin', homePinId: 'pin-2' },
      'after',
    );
    expect(order(movedAfter)).toEqual(['pin-2', 'pin-1']);

    // Drop the loose pin before the folder: no change (already first).
    const looseBefore = reorderPinnedSection(
      withMember,
      { kind: 'pin', homePinId: 'pin-2' },
      { kind: 'folder', groupId: folder.groupId },
      'before',
    );
    expect(order(looseBefore)).toEqual(['pin-2', 'pin-1']);
  });

  it('plans an unpinned block move adjacent to a target', () => {
    const tabs = [
      { tabId: 1, index: 0, groupId: 'g' },
      { tabId: 2, index: 1, groupId: 'g' },
      { tabId: 3, index: 2, groupId: null },
    ];

    // Move the loose tab before the folder's block.
    expect(
      planUnpinnedReorder(
        tabs,
        { kind: 'tab', tabId: 3 },
        { kind: 'folder', groupId: 'g' },
        'before',
      ),
    ).toEqual({ tabIds: [3], index: 0 });

    // Move the whole folder after the loose tab.
    expect(
      planUnpinnedReorder(
        tabs,
        { kind: 'folder', groupId: 'g' },
        { kind: 'tab', tabId: 3 },
        'after',
      ),
    ).toEqual({ tabIds: [1, 2], index: 1 });

    // Dropping a folder onto one of its own members is a no-op.
    expect(
      planUnpinnedReorder(
        tabs,
        { kind: 'folder', groupId: 'g' },
        { kind: 'tab', tabId: 1 },
        'before',
      ),
    ).toBeNull();
  });

  it('removes a group definition and frees its members', () => {
    const created = createGroup(
      baseState,
      { title: 'Reading', pinned: true },
      DEFAULT_SPACE_ID,
    );
    const grouped = setHomePinGroup(
      created.state,
      'pin-1',
      created.groupId,
      DEFAULT_SPACE_ID,
    );
    const withTab = setTabGroup(grouped, 42, created.groupId);

    const removed = removeGroup(withTab, created.groupId);
    expect(findGroupById(removed, created.groupId)).toBeUndefined();
    expect(
      removed.spaces[0].homePins.find((pin) => pin.id === 'pin-1')?.groupId,
    ).toBeNull();
    expect(removed.tabGroupMembership?.['42']).toBeUndefined();
  });

  it('unpins a group: open pins become loose tabs, closed pins are dropped', () => {
    // pin-1 is open (tabId 1); add a closed pin in the same pinned group.
    const created = createGroup(
      baseState,
      { title: 'Reading', pinned: true },
      DEFAULT_SPACE_ID,
    );
    let state = setHomePinGroup(
      created.state,
      'pin-1',
      created.groupId,
      DEFAULT_SPACE_ID,
    );
    state = setHomePinGroup(state, 'pin-2', created.groupId, DEFAULT_SPACE_ID);

    const unpinned = unpinGroup(state, created.groupId);

    // The group survives as an unpinned group...
    expect(findGroupById(unpinned, created.groupId)?.pinned).toBe(false);
    // ...the open pin (tabId 1) becomes a loose tab in the group with its alias,
    // and the closed pin (pin-2) is dropped entirely.
    expect(unpinned.tabGroupMembership?.['1']).toBe(created.groupId);
    expect(unpinned.tabAliases['1']).toBe('Mail');
    expect(unpinned.spaces[0].homePins).toHaveLength(0);
  });

  it('unpins every window instance into the resulting live group', () => {
    const withSecondInstance = {
      ...updateHomePin(baseState, 'pin-1', {
        instances: [
          ...baseState.spaces[0].homePins[0].instances,
          {
            tabId: 2,
            windowId: 2,
            lastKnownUrl: 'https://mail.example.com/sent',
            lastKnownTitle: 'Sent',
          },
        ],
      }),
      tabSpaces: {
        ...baseState.tabSpaces,
        '2': DEFAULT_SPACE_ID,
      },
    };
    const created = createGroup(
      withSecondInstance,
      { title: 'Mail', pinned: true },
      DEFAULT_SPACE_ID,
    );
    const grouped = setHomePinGroup(
      created.state,
      'pin-1',
      created.groupId,
      DEFAULT_SPACE_ID,
    );
    const unpinned = unpinGroup(grouped, created.groupId);

    expect(unpinned.tabGroupMembership).toMatchObject({
      '1': created.groupId,
      '2': created.groupId,
    });
    expect(unpinned.spaces[0].homePins.some((pin) => pin.id === 'pin-1')).toBe(
      false,
    );
  });

  it('drops dead unpinned-group membership when reconciling against live tabs', () => {
    const created = createGroup(
      baseState,
      { title: 'Open work', pinned: false },
      DEFAULT_SPACE_ID,
    );
    const withMembership = setTabGroup(created.state, 1, created.groupId);

    const reconciled = reconcileStateForTabs(withMembership, [
      tab({ id: 1, url: 'https://mail.example.com/' }),
    ]);
    expect(reconciled.tabGroupMembership?.['1']).toBe(created.groupId);

    // With no live tabs reconcile drops the membership; normalize then prunes the
    // now-empty ephemeral group.
    const emptied = normalizeState(reconcileStateForTabs(withMembership, []));
    expect(emptied.tabGroupMembership?.['1']).toBeUndefined();
    expect(findGroupById(emptied, created.groupId)).toBeUndefined();
  });

  it('normalizeState keeps a pinned group only while a pin references it', () => {
    const created = createGroup(
      baseState,
      { title: 'Reading', pinned: true },
      DEFAULT_SPACE_ID,
    );
    // No pin references the group, so normalize prunes the orphaned definition.
    expect(
      findGroupById(normalizeState(created.state), created.groupId),
    ).toBeUndefined();

    // Once a pin references it, normalize keeps it.
    const grouped = setHomePinGroup(
      created.state,
      'pin-1',
      created.groupId,
      DEFAULT_SPACE_ID,
    );
    expect(
      findGroupById(normalizeState(grouped), created.groupId),
    ).toBeDefined();
  });
});

describe('demoteHomePinToTab', () => {
  it('turns an open home pin into a loose live tab, keeping a custom rename', () => {
    // pin-1 is open (tabId 1) with a custom alias "Mail".
    const demoted = demoteHomePinToTab(baseState, 'pin-1', DEFAULT_SPACE_ID);

    expect(
      demoted.spaces[0].homePins.find((pin) => pin.id === 'pin-1'),
    ).toBeUndefined();
    expect(demoted.tabSpaces['1']).toBe(DEFAULT_SPACE_ID);
    expect(demoted.tabAliases['1']).toBe('Mail');
  });

  it('does not freeze the title for a non-custom (auto-captured) alias', () => {
    // A pin whose alias is just the captured page title (never renamed) must not
    // leave a sticky tab alias, so the live tab keeps tracking its own title.
    const autoState = {
      ...updateHomePin(baseState, 'pin-1', { aliasCustom: false }),
      tabAliases: {},
    };
    const demoted = demoteHomePinToTab(autoState, 'pin-1', DEFAULT_SPACE_ID);

    expect(demoted.tabSpaces['1']).toBe(DEFAULT_SPACE_ID);
    expect(demoted.tabAliases['1']).toBeUndefined();
  });

  it('is a no-op for a closed home pin (no live tab to keep)', () => {
    // pin-2 is closed (tabId null).
    expect(demoteHomePinToTab(baseState, 'pin-2', DEFAULT_SPACE_ID)).toBe(
      baseState,
    );
  });

  it('ignores an unknown home pin id', () => {
    expect(demoteHomePinToTab(baseState, 'missing', DEFAULT_SPACE_ID)).toBe(
      baseState,
    );
  });
});

describe('moveGroupToSpace', () => {
  function withSecondSpace(): { state: StoredStateV8; secondSpaceId: string } {
    const state = createSpace(baseState, 'Work', 1);
    const secondSpaceId = state.spaces[state.spaces.length - 1].id;
    return { state, secondSpaceId };
  }

  function spaceHoldingGroup(
    state: StoredStateV8,
    groupId: string,
  ): string | undefined {
    return state.spaces.find((space) =>
      (space.groups ?? []).some((group) => group.id === groupId),
    )?.id;
  }

  it('moves a pinned folder and its home pins to the target space', () => {
    const { state: withSpace, secondSpaceId } = withSecondSpace();
    const folder = createGroup(
      withSpace,
      { title: 'Reading', pinned: true },
      DEFAULT_SPACE_ID,
    );
    const grouped = setHomePinGroup(
      folder.state,
      'pin-1',
      folder.groupId,
      DEFAULT_SPACE_ID,
    );

    const moved = moveGroupToSpace(grouped, folder.groupId, secondSpaceId);

    // The folder definition and its pin leave the source space...
    const sourceSpace = moved.spaces.find((s) => s.id === DEFAULT_SPACE_ID)!;
    expect(sourceSpace.groups ?? []).toHaveLength(0);
    expect(
      sourceSpace.homePins.find((pin) => pin.id === 'pin-1'),
    ).toBeUndefined();

    // ...and land in the target space, the pin keeping its folder membership.
    expect(spaceHoldingGroup(moved, folder.groupId)).toBe(secondSpaceId);
    const targetSpace = moved.spaces.find((s) => s.id === secondSpaceId)!;
    expect(
      targetSpace.homePins.find((pin) => pin.id === 'pin-1')?.groupId,
    ).toBe(folder.groupId);

    // The open tab backing the pin follows it into the target space.
    expect(moved.tabSpaces['1']).toBe(secondSpaceId);

    // Normalization keeps the folder intact in the destination.
    expect(spaceHoldingGroup(normalizeState(moved), folder.groupId)).toBe(
      secondSpaceId,
    );
  });

  it('moves an unpinned folder and its live tabs to the target space', () => {
    const { state: withSpace, secondSpaceId } = withSecondSpace();
    const folder = createGroup(
      withSpace,
      { title: 'Open work', pinned: false },
      DEFAULT_SPACE_ID,
    );
    const grouped = setTabGroup(folder.state, 1, folder.groupId);

    const moved = moveGroupToSpace(grouped, folder.groupId, secondSpaceId);

    expect(spaceHoldingGroup(moved, folder.groupId)).toBe(secondSpaceId);
    // Membership is preserved while the tab is reassigned to the target space.
    expect(moved.tabGroupMembership?.['1']).toBe(folder.groupId);
    expect(moved.tabSpaces['1']).toBe(secondSpaceId);

    // Normalization keeps the unpinned folder in the destination.
    expect(spaceHoldingGroup(normalizeState(moved), folder.groupId)).toBe(
      secondSpaceId,
    );
  });

  it('is a no-op when the target is the folder’s current space', () => {
    const folder = createGroup(
      baseState,
      { title: 'Reading', pinned: true },
      DEFAULT_SPACE_ID,
    );
    const grouped = setHomePinGroup(
      folder.state,
      'pin-1',
      folder.groupId,
      DEFAULT_SPACE_ID,
    );

    expect(moveGroupToSpace(grouped, folder.groupId, DEFAULT_SPACE_ID)).toBe(
      grouped,
    );
  });

  it('ignores an unknown group id', () => {
    const { state, secondSpaceId } = withSecondSpace();
    expect(moveGroupToSpace(state, 'missing', secondSpaceId)).toBe(state);
  });
});

describe('migrateTabId', () => {
  // Models Chrome's Memory Saver discard, which replaces a background tab with a
  // new id (chrome.tabs.onReplaced). Every id-keyed binding must follow the tab
  // to its new id so it stays in its own space rather than reconcile pruning the
  // old id and re-parking the new one as a loose tab in the active space.
  function discardableState(): StoredStateV8 {
    return {
      version: 8,
      activeSpaceByWindowId: { default: DEFAULT_SPACE_ID, '1': 'focus' },
      lastActiveTabBySpace: { [`1:${DEFAULT_SPACE_ID}`]: 7 },
      tabAliases: { '7': 'Mail alias' },
      tabSpaces: { '7': DEFAULT_SPACE_ID, '8': 'focus', '9': DEFAULT_SPACE_ID },
      tabGroupMembership: { '8': 'group-1' },
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
              instances: [
                {
                  tabId: 7,
                  windowId: 1,
                  lastKnownUrl: 'https://mail.example.com/inbox',
                  lastKnownTitle: 'Inbox',
                },
                {
                  tabId: 9,
                  windowId: 2,
                  lastKnownUrl: 'https://mail.example.com/sent',
                  lastKnownTitle: 'Sent',
                },
              ],
              lastKnownUrl: 'https://mail.example.com/inbox',
              lastKnownTitle: 'Inbox',
              createdAt: 1,
              order: 0,
            },
          ],
        },
        {
          id: 'focus',
          name: 'Focus',
          icon: 'diamond',
          createdAt: 2,
          order: 1,
          homePins: [],
          groups: [
            {
              id: 'group-1',
              title: 'Work',
              pinned: false,
              collapsed: false,
              peek: false,
              order: 0,
              createdAt: 2,
            },
          ],
        },
      ],
    };
  }

  it('moves a home pin binding and space assignment to the new tab id', () => {
    const migrated = migrateTabId(discardableState(), 7, 100);

    expect(migrated.spaces[0].homePins[0].instances[0].tabId).toBe(100);
    expect(migrated.spaces[0].homePins[0].instances[1].tabId).toBe(9);
    expect(migrated.tabSpaces['100']).toBe(DEFAULT_SPACE_ID);
    expect(migrated.tabSpaces['7']).toBeUndefined();
    expect(migrated.tabAliases['100']).toBe('Mail alias');
    expect(migrated.tabAliases['7']).toBeUndefined();
    expect(migrated.lastActiveTabBySpace[`1:${DEFAULT_SPACE_ID}`]).toBe(100);
  });

  it('moves unpinned-group membership and space assignment to the new id', () => {
    const migrated = migrateTabId(discardableState(), 8, 200);

    expect(migrated.tabSpaces['200']).toBe('focus');
    expect(migrated.tabSpaces['8']).toBeUndefined();
    expect(migrated.tabGroupMembership?.['200']).toBe('group-1');
    expect(migrated.tabGroupMembership?.['8']).toBeUndefined();
  });

  it('survives a full reconcile against the post-discard tab list', () => {
    // The whole point: after migrating, reconcile must keep the pin bound and in
    // its own space, not re-park it as a loose tab in the active (focus) space.
    const migrated = migrateTabId(discardableState(), 7, 100);
    const reconciled = reconcileStateForTabs(migrated, [
      tab({ id: 100, url: 'https://mail.example.com/inbox', windowId: 1 }),
      tab({ id: 8, url: 'https://work.example.com/', windowId: 1 }),
    ]);

    expect(reconciled.spaces[0].homePins[0].instances[0].tabId).toBe(100);
    expect(reconciled.tabSpaces['100']).toBe(DEFAULT_SPACE_ID);
  });

  it('returns the same reference when the old id is not referenced', () => {
    const state = discardableState();
    expect(migrateTabId(state, 999, 1000)).toBe(state);
  });
});
