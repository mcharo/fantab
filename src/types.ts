export const STORAGE_VERSION = 7;
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
  /** Id of the pinned {@link FantabGroup} this pin belongs to, or null/loose. */
  groupId?: string | null;
}

/**
 * A fantab-owned tab group. Used for both pinned groups (members are home pins,
 * persistent) and unpinned groups (members are live tabs, ephemeral). Replaces
 * Chrome's native tab groups entirely within the side panel.
 */
export interface FantabGroup {
  id: string;
  title: string;
  /** Pinned groups hold home pins and persist; unpinned groups hold live tabs. */
  pinned: boolean;
  collapsed: boolean;
  /**
   * "Peek" is a third folder state layered on `collapsed`: set when a folder is
   * collapsed while one of its tabs is active. A peeking folder keeps showing
   * its last-active member even after focus moves elsewhere (the member is
   * resolved at render time from `lastAccessed`). Machine-local, like
   * `collapsed`.
   */
  peek?: boolean;
  order: number;
  createdAt: number;
}

export interface Space {
  id: string;
  name: string;
  icon: SpaceIcon;
  homePins: HomePin[];
  /** Tab groups owned by this space (both pinned and unpinned). */
  groups?: FantabGroup[];
  createdAt: number;
  order: number;
}

export interface StoredStateV7 {
  version: typeof STORAGE_VERSION;
  activeSpaceByWindowId: Record<string, string>;
  lastActiveTabBySpace: Record<string, number>;
  spaces: Space[];
  tabAliases: Record<string, string>;
  tabSpaces: Record<string, string>;
  /** Unpinned-group membership for live tabs: tabId -> group id. */
  tabGroupMembership?: Record<string, string>;
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
  /**
   * Position of this row within its section's unified order scale: a home pin's
   * `order` for the pinned section, a live tab's strip `index` for the unpinned
   * section. Used to interleave loose rows with folders.
   */
  order: number;
  /** Id of the fantab group this row belongs to, or null when loose. */
  groupId: string | null;
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
  /**
   * `chrome.tabs.Tab.lastAccessed` (ms since epoch); 0 when never activated or
   * not open. Used to resolve a collapsed folder's "last active" peek member.
   */
  lastAccessed: number;
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
  id: string;
  title: string;
  collapsed: boolean;
  /** See {@link FantabGroup.peek}. */
  peek: boolean;
  pinned: boolean;
  /**
   * Anchor position on the section's order scale (the minimum `order` of its
   * members), used to slot the folder block among loose rows.
   */
  order: number;
  tabs: PanelTab[];
}

/**
 * A draggable unit within a section, used to express reorder operations: a
 * folder block, a loose home pin (pinned section), or a loose live tab
 * (unpinned section).
 */
export type SectionUnitRef =
  | { kind: 'folder'; groupId: string }
  | { kind: 'pin'; homePinId: string }
  | { kind: 'tab'; tabId: number };

export interface PanelState {
  windowId: number | null;
  activeTabId: number | null;
  activeSpaceId: string;
  spaces: SpaceSummary[];
  /** Loose home pins not assigned to any pinned group. */
  homePins: PanelTab[];
  /** Persistent groups of home pins, shown in the pinned section. */
  pinnedGroups: PanelGroup[];
  /** Ephemeral groups of live tabs, shown in the unpinned section. */
  unpinnedGroups: PanelGroup[];
  /** Loose live tabs not in any group. */
  ungroupedTabs: PanelTab[];
  /** The media source the player bar controls, or null when nothing is playing. */
  activeMedia: ActiveMedia | null;
}
