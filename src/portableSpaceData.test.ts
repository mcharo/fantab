import { describe, expect, it } from 'vitest';
import {
  buildPortableSpaceData,
  parsePortableSpaceData,
  type PortableSpaceDataV1,
} from './portableSpaceData';
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

const state: StoredStateV6 = {
  version: 6,
  activeSpaceByWindowId: {
    default: DEFAULT_SPACE_ID,
    '1': DEFAULT_SPACE_ID,
  },
  lastActiveTabBySpace: {
    [`1:${DEFAULT_SPACE_ID}`]: 1,
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
          faviconUrl: 'mail.ico',
          tabId: 2,
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
    },
  ],
  tabAliases: {
    '1': 'Docs alias',
  },
  tabSpaces: {
    '1': DEFAULT_SPACE_ID,
    '2': DEFAULT_SPACE_ID,
    '3': 'focus',
    '4': DEFAULT_SPACE_ID,
  },
};

describe('portable space data', () => {
  it('exports spaces, pins, and regular tabs without live tab identifiers', () => {
    const data = buildPortableSpaceData({
      state,
      blankUrl: 'chrome-extension://fantab/blank.html',
      exportedAt: new Date('2026-06-17T12:00:00Z'),
      tabs: [
        tab({
          id: 1,
          index: 0,
          title: 'Docs',
          url: 'https://docs.example.com/',
        }),
        tab({
          id: 2,
          index: 1,
          title: 'Inbox',
          url: 'https://mail.example.com/inbox',
        }),
        tab({
          id: 3,
          index: 2,
          title: 'Focus notes',
          url: 'https://notes.example.com/',
        }),
        tab({
          id: 4,
          index: 3,
          title: 'Blank',
          url: 'chrome-extension://fantab/blank.html?space=default',
        }),
      ],
    });

    expect(data).toMatchObject({
      app: 'fantab',
      schemaVersion: 1,
      exportedAt: '2026-06-17T12:00:00.000Z',
    });
    expect(data.spaces[0].homePins).toEqual([
      {
        homeUrl: 'https://mail.example.com/',
        alias: 'Mail',
        faviconUrl: 'mail.ico',
        lastKnownUrl: 'https://mail.example.com/inbox',
        lastKnownTitle: 'Inbox',
        order: 0,
      },
    ]);
    expect(data.spaces[0].tabs).toEqual([
      {
        url: 'https://docs.example.com/',
        title: 'Docs',
        alias: 'Docs alias',
        order: 0,
      },
    ]);
    expect(data.spaces[1].tabs).toEqual([
      {
        url: 'https://notes.example.com/',
        title: 'Focus notes',
        alias: null,
        order: 0,
      },
    ]);
  });

  it('imports portable data into fresh spaces and tabs to reopen', () => {
    const ids = ['space-1', 'pin-1', 'space-2'];
    const data: PortableSpaceDataV1 = {
      app: 'fantab',
      schemaVersion: 1,
      exportedAt: '2026-06-17T12:00:00.000Z',
      spaces: [
        {
          name: 'Default',
          icon: 'circle',
          order: 0,
          homePins: [
            {
              homeUrl: 'mail.example.com',
              alias: 'Mail',
              faviconUrl: '',
              lastKnownUrl: null,
              lastKnownTitle: null,
              order: 0,
            },
          ],
          tabs: [
            {
              url: 'https://docs.example.com/',
              title: 'Docs',
              alias: 'Docs alias',
              order: 0,
            },
          ],
        },
        {
          name: 'Focus',
          icon: 'diamond',
          order: 1,
          homePins: [],
          tabs: [],
        },
      ],
    };

    const imported = parsePortableSpaceData(JSON.stringify(data), {
      now: 1,
      idFactory: () => ids.shift() ?? 'extra-id',
    });

    expect(imported.state).toMatchObject({
      version: 6,
      activeSpaceByWindowId: {
        default: 'space-1',
      },
      lastActiveTabBySpace: {},
      tabAliases: {},
      tabSpaces: {},
    });
    expect(imported.state.spaces.map((space) => [space.id, space.name])).toEqual([
      ['space-1', 'Default'],
      ['space-2', 'Focus'],
    ]);
    expect(imported.state.spaces[0].homePins[0]).toMatchObject({
      id: 'pin-1',
      homeUrl: 'https://mail.example.com/',
      alias: 'Mail',
      tabId: null,
      createdAt: 1,
      order: 0,
    });
    expect(imported.regularTabs).toEqual([
      {
        spaceId: 'space-1',
        url: 'https://docs.example.com/',
        title: 'Docs',
        alias: 'Docs alias',
      },
    ]);
  });

  it('rejects unsupported import files', () => {
    expect(() =>
      parsePortableSpaceData(JSON.stringify({ app: 'other', spaces: [] })),
    ).toThrow('supported fantab space export');
  });
});
