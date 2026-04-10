export interface ManagedTab {
  id: string;
  homeUrl: string;
  customName: string;
  groupId: string | null;
  tabId: number | null;
  faviconUrl: string;
  currentUrl: string | null;
  currentTitle: string | null;
  createdAt: number;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface AppState {
  tabs: ManagedTab[];
  groups: TabGroup[];
}
