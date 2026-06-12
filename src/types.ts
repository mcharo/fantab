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
  icon: SpaceIconId;
  homePins: HomePin[];
  createdAt: number;
  order: number;
}

export interface StoredStateV6 {
  version: typeof STORAGE_VERSION;
  activeSpaceByWindowId: Record<string, string>;
  spaces: Space[];
  tabAliases: Record<string, string>;
  tabSpaces: Record<string, string>;
}

export type SpaceSummary = {
  id: string;
  name: string;
  icon: SpaceIconId;
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
  isNativePinned: boolean;
  isHomePin: boolean;
  isOpen: boolean;
  atHome: boolean;
  status: string | null;
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
}
