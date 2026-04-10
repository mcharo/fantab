import type { AppState, ManagedTab, TabGroup } from './types';

export const STORAGE_KEY = 'fantab_state';

const DEFAULT_STATE: AppState = { tabs: [], groups: [] };

export async function loadState(): Promise<AppState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? DEFAULT_STATE;
}

export async function saveState(state: AppState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function findTabByTabId(
  state: AppState,
  tabId: number,
): ManagedTab | undefined {
  return state.tabs.find((t) => t.tabId === tabId);
}

export function findTabById(
  state: AppState,
  id: string,
): ManagedTab | undefined {
  return state.tabs.find((t) => t.id === id);
}

export function updateTab(
  state: AppState,
  id: string,
  updates: Partial<ManagedTab>,
): AppState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  };
}

export function addTab(state: AppState, tab: ManagedTab): AppState {
  return { ...state, tabs: [...state.tabs, tab] };
}

export function removeTab(state: AppState, id: string): AppState {
  return { ...state, tabs: state.tabs.filter((t) => t.id !== id) };
}

export function addGroup(state: AppState, group: TabGroup): AppState {
  return { ...state, groups: [...state.groups, group] };
}

export function updateGroup(
  state: AppState,
  id: string,
  updates: Partial<TabGroup>,
): AppState {
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
  };
}

export function removeGroup(state: AppState, id: string): AppState {
  return {
    ...state,
    groups: state.groups.filter((g) => g.id !== id),
    tabs: state.tabs.map((t) =>
      t.groupId === id ? { ...t, groupId: null } : t,
    ),
  };
}
