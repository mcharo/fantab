import { normalizeHomeUrl } from './lib/url';
import { iconForSpaceIndex, normalizeSpaceIcon } from './spaceIcons';
import {
  STORAGE_VERSION,
  type HomePin,
  type Space,
  type StoredStateV6,
} from './types';

export const PORTABLE_SPACE_DATA_APP = 'fantab';
export const PORTABLE_SPACE_DATA_VERSION = 1;

export interface PortableHomePin {
  homeUrl: string;
  alias: string;
  faviconUrl: string;
  lastKnownUrl: string | null;
  lastKnownTitle: string | null;
  order: number;
}

export interface PortableRegularTab {
  url: string;
  title: string;
  alias: string | null;
  order: number;
}

export interface PortableSpace {
  name: string;
  icon: unknown;
  order: number;
  homePins: PortableHomePin[];
  tabs: PortableRegularTab[];
}

export interface PortableSpaceDataV1 {
  app: typeof PORTABLE_SPACE_DATA_APP;
  schemaVersion: typeof PORTABLE_SPACE_DATA_VERSION;
  exportedAt: string;
  spaces: PortableSpace[];
}

export interface ImportedRegularTab {
  spaceId: string;
  url: string;
  title: string;
  alias: string | null;
}

export interface ImportedSpaceData {
  state: StoredStateV6;
  regularTabs: ImportedRegularTab[];
}

interface BuildPortableSpaceDataInput {
  state: StoredStateV6;
  tabs: chrome.tabs.Tab[];
  blankUrl?: string;
  exportedAt?: Date;
}

interface ImportPortableSpaceDataOptions {
  now?: number;
  idFactory?: () => string;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableStringValue(value: unknown): string | null {
  const text = stringValue(value);
  return text || null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

function tabUrl(tab: chrome.tabs.Tab): string {
  return tab.url ?? tab.pendingUrl ?? '';
}

function tabTitle(tab: chrome.tabs.Tab): string {
  return tab.title ?? tabUrl(tab) ?? 'Untitled';
}

function isPlaceholderUrl(url: string, blankUrl?: string): boolean {
  return !!blankUrl && url.startsWith(blankUrl);
}

function normalizeImportUrl(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;

  try {
    return new URL(text).href;
  } catch {
    return normalizeHomeUrl(text);
  }
}

function isPortableSpaceDataV1(
  value: unknown,
): value is PortableSpaceDataV1 {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<PortableSpaceDataV1>;
  return (
    candidate.app === PORTABLE_SPACE_DATA_APP &&
    candidate.schemaVersion === PORTABLE_SPACE_DATA_VERSION &&
    Array.isArray(candidate.spaces) &&
    candidate.spaces.length > 0
  );
}

export function buildPortableSpaceData({
  state,
  tabs,
  blankUrl,
  exportedAt = new Date(),
}: BuildPortableSpaceDataInput): PortableSpaceDataV1 {
  const homePinTabIds = new Set(
    state.spaces
      .flatMap((space) => space.homePins)
      .map((pin) => pin.tabId)
      .filter((tabId): tabId is number => typeof tabId === 'number'),
  );

  return {
    app: PORTABLE_SPACE_DATA_APP,
    schemaVersion: PORTABLE_SPACE_DATA_VERSION,
    exportedAt: exportedAt.toISOString(),
    spaces: [...state.spaces]
      .sort((a, b) => a.order - b.order)
      .map((space) => ({
        name: space.name,
        icon: space.icon,
        order: space.order,
        homePins: [...space.homePins]
          .sort((a, b) => a.order - b.order)
          .map((pin) => ({
            homeUrl: pin.homeUrl,
            alias: pin.alias,
            faviconUrl: pin.faviconUrl,
            lastKnownUrl: pin.lastKnownUrl,
            lastKnownTitle: pin.lastKnownTitle,
            order: pin.order,
          })),
        tabs: tabs
          .filter((tab): tab is chrome.tabs.Tab & { id: number } => {
            const url = tabUrl(tab);
            return (
              typeof tab.id === 'number' &&
              state.tabSpaces[String(tab.id)] === space.id &&
              !homePinTabIds.has(tab.id) &&
              !!url &&
              !isPlaceholderUrl(url, blankUrl)
            );
          })
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((tab, index) => ({
            url: tabUrl(tab),
            title: tabTitle(tab),
            alias: state.tabAliases[String(tab.id)] ?? null,
            order: index,
          })),
      })),
  };
}

export function parsePortableSpaceData(
  rawData: string,
  options: ImportPortableSpaceDataOptions = {},
): ImportedSpaceData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    throw new Error('Import file is not valid JSON.');
  }

  if (!isPortableSpaceDataV1(parsed)) {
    throw new Error('Import file is not a supported fantab space export.');
  }

  const now = options.now ?? Date.now();
  const idFactory = options.idFactory ?? crypto.randomUUID.bind(crypto);
  const regularTabs: ImportedRegularTab[] = [];

  const spaces: Space[] = parsed.spaces.map((portableSpace, spaceIndex) => {
    const spaceId = idFactory();
    const homePins: HomePin[] = (Array.isArray(portableSpace.homePins)
      ? portableSpace.homePins
      : []
    )
      .map((portablePin, pinIndex): HomePin | null => {
        const homeUrl = normalizeImportUrl(portablePin.homeUrl);
        if (!homeUrl) return null;

        const lastKnownUrl = normalizeImportUrl(portablePin.lastKnownUrl);

        return {
          id: idFactory(),
          homeUrl,
          alias: stringValue(portablePin.alias) || homeUrl,
          faviconUrl: stringValue(portablePin.faviconUrl),
          tabId: null,
          lastKnownUrl,
          lastKnownTitle: nullableStringValue(portablePin.lastKnownTitle),
          createdAt: now,
          order: pinIndex,
        };
      })
      .filter((pin): pin is HomePin => pin !== null);

    const tabs = Array.isArray(portableSpace.tabs) ? portableSpace.tabs : [];
    for (const portableTab of tabs) {
      const url = normalizeImportUrl(portableTab.url);
      if (!url) continue;

      regularTabs.push({
        spaceId,
        url,
        title: stringValue(portableTab.title) || url,
        alias: nullableStringValue(portableTab.alias),
      });
    }

    return {
      id: spaceId,
      name: stringValue(portableSpace.name) || `Space ${spaceIndex + 1}`,
      icon:
        portableSpace.icon === undefined
          ? iconForSpaceIndex(spaceIndex)
          : normalizeSpaceIcon(portableSpace.icon),
      homePins,
      createdAt: now,
      order: spaceIndex,
    };
  });

  return {
    state: {
      version: STORAGE_VERSION,
      activeSpaceByWindowId: {
        default: spaces[0].id,
      },
      lastActiveTabBySpace: {},
      spaces,
      tabAliases: {},
      tabSpaces: {},
    },
    regularTabs,
  };
}
