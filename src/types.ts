export const STORAGE_VERSION = 6;
export const DEFAULT_SPACE_ID = 'default';
export const DEFAULT_SPACE_ICON: SpaceIconId = 'circle';

export type SpaceIconId =
  | 'circle'
  | 'diamond'
  | 'spark'
  | 'briefcase'
  | 'book'
  | 'code'
  | 'bolt'
  | 'moon'
  | 'sun'
  | 'heart'
  | 'grid'
  | 'compass';

/**
 * A space's icon: either a built-in {@link SpaceIconId} or a single emoji
 * character. Emoji never collide with the ascii icon ids, so the two are
 * distinguished at render time via `isSpaceIconId`.
 */
export type SpaceIcon = SpaceIconId | (string & {});

export type TabGroupColor =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'grey'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'yellow';

export interface HomePin {
  id: string;
  homeUrl: string;
  alias: string;
  faviconUrl: string;
  tabId: number | null;
  lastKnownUrl: string | null;
  lastKnownTitle: string | null;
  createdAt: number;
  order: number;
}

export interface Space {
  id: string;
  name: string;
  icon: SpaceIcon;
  homePins: HomePin[];
  createdAt: number;
  order: number;
}

export interface StoredStateV6 {
  version: typeof STORAGE_VERSION;
  activeSpaceByWindowId: Record<string, string>;
  lastActiveTabBySpace: Record<string, number>;
  spaces: Space[];
  tabAliases: Record<string, string>;
  tabSpaces: Record<string, string>;
}

export type SpaceSummary = {
  id: string;
  name: string;
  icon: SpaceIcon;
  order: number;
};

export interface PanelTab {
  key: string;
  tabId: number | null;
  homePinId: string | null;
  windowId: number | null;
  index: number;
  groupId: number;
  url: string;
  homeUrl: string | null;
  title: string;
  faviconUrl: string;
  alias: string | null;
  displayName: string;
  pageTitle: string;
  isActive: boolean;
  isAudible: boolean;
  isMuted: boolean;
  isPlayingVideo: boolean;
  isNativePinned: boolean;
  isHomePin: boolean;
  isOpen: boolean;
  atHome: boolean;
  status: string | null;
}

/**
 * Snapshot of a tab's media playback, reported by the content script. Combines
 * DOM media-element facts (volume, muted, playing video) with the page's
 * MediaSession capabilities (next/previous track) relayed by the media bridge.
 */
export interface TabMediaState {
  /** Any audio/video element is present, or the page exposes a media session. */
  hasMedia: boolean;
  /** Something (audio or video) is actively playing. */
  isPlaying: boolean;
  /** A `<video>` element is currently playing (drives the picture-in-picture button). */
  isPlayingVideo: boolean;
  /** A ready `<video>` element exists, so picture-in-picture can be offered. */
  hasVideo: boolean;
  /** The site registered a MediaSession `nexttrack` handler. */
  canNext: boolean;
  /** The site registered a MediaSession `previoustrack` handler. */
  canPrev: boolean;
  /** Volume of the primary media element, 0-1. */
  volume: number;
  /** Whether the primary media element is muted. */
  muted: boolean;
  /** MediaSession metadata title, when provided. */
  title: string;
  /** MediaSession metadata artist, when provided. */
  artist: string;
}

/**
 * The single media source the side panel's player bar controls: the
 * most-recently-playing media tab in the window, resolved against its tab so we
 * can show a label and favicon.
 */
export interface ActiveMedia {
  tabId: number;
  title: string;
  artist: string;
  faviconUrl: string;
  isPlaying: boolean;
  hasVideo: boolean;
  canNext: boolean;
  canPrev: boolean;
  volume: number;
  muted: boolean;
}

export interface PanelGroup {
  id: number;
  title: string;
  color: TabGroupColor;
  collapsed: boolean;
  windowId: number;
  tabs: PanelTab[];
}

export interface PanelState {
  windowId: number | null;
  activeTabId: number | null;
  activeSpaceId: string;
  spaces: SpaceSummary[];
  homePins: PanelTab[];
  groups: PanelGroup[];
  ungroupedTabs: PanelTab[];
  /** The media source the player bar controls, or null when nothing is playing. */
  activeMedia: ActiveMedia | null;
}
