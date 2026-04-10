# FantTab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension (Manifest V3) with a Svelte 5 side panel for managing tabs -- rename them, pin URLs with a "go home" favicon button, and organize with custom groups.

**Architecture:** Service worker handles Chrome tab events, title prefixing, and state management via `chrome.storage.local`. A Svelte 5 side panel provides the UI. The two communicate through `chrome.runtime` messaging with a typed protocol. All state lives in storage; the service worker is stateless on restart.

**Tech Stack:** Svelte 5, TypeScript, Vite 6, Chrome Manifest V3 APIs

**Spec:** `docs/superpowers/specs/2026-04-09-fantab-design.md`

---

### Task 1: Project Scaffolding & Build Setup

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `svelte.config.js`
- Create: `public/manifest.json`
- Create: `sidepanel.html`
- Create: `src/sidepanel/main.ts` (stub)
- Create: `src/background.ts` (stub)
- Create: `.gitignore`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd /Users/michael/Documents/code/mcharo/fantab
npm init -y
npm install -D vite svelte @sveltejs/vite-plugin-svelte typescript @types/chrome vitest
```

Then update `package.json` scripts:

```json
{
  "name": "fantab",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite build --watch --mode development",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Keep all `devDependencies` that npm added. Only update the top-level fields shown above.

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
.DS_Store
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Create `svelte.config.js`**

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
```

- [ ] **Step 6: Create `public/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "FantTab",
  "description": "Custom tab behaviors: rename tabs, pin URLs, and organize with groups",
  "version": "0.1.0",
  "permissions": ["tabs", "sidePanel", "storage", "favicon"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "FantTab"
  }
}
```

- [ ] **Step 7: Create `sidepanel.html`** (at project root — Vite entry)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FantTab</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/sidepanel/main.ts"></script>
</body>
</html>
```

- [ ] **Step 8: Create stub entry files**

Create `src/sidepanel/main.ts`:

```ts
console.log('FantTab side panel loaded');
```

Create `src/background.ts`:

```ts
console.log('FantTab service worker loaded');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

- [ ] **Step 9: Verify the build works**

```bash
npm run build
```

Expected: builds without errors. `dist/` contains `sidepanel.html`, `sidepanel.js`, `background.js`.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: project scaffolding with Vite + Svelte 5 + MV3 manifest"
```

---

### Task 2: Shared Types, Messaging & URL Helpers

**Files:**
- Create: `src/types.ts`
- Create: `src/messaging.ts`
- Create: `src/lib/url.ts`
- Create: `src/lib/url.test.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/messaging.ts`**

```ts
import type { AppState } from './types';

export interface PinTabMessage {
  action: 'PIN_TAB';
  payload: { tabId: number };
}

export interface UnpinTabMessage {
  action: 'UNPIN_TAB';
  payload: { id: string };
}

export interface RenameTabMessage {
  action: 'RENAME_TAB';
  payload: { id: string; customName: string };
}

export interface GoHomeMessage {
  action: 'GO_HOME';
  payload: { id: string };
}

export interface ReopenTabMessage {
  action: 'REOPEN_TAB';
  payload: { id: string };
}

export interface CreateGroupMessage {
  action: 'CREATE_GROUP';
  payload: { name: string; color: string };
}

export interface UpdateGroupMessage {
  action: 'UPDATE_GROUP';
  payload: { id: string; name?: string; color?: string };
}

export interface DeleteGroupMessage {
  action: 'DELETE_GROUP';
  payload: { id: string };
}

export interface MoveToGroupMessage {
  action: 'MOVE_TO_GROUP';
  payload: { tabId: string; groupId: string | null };
}

export interface GetStateMessage {
  action: 'GET_STATE';
  payload: Record<string, never>;
}

export interface StateUpdatedMessage {
  action: 'STATE_UPDATED';
  payload: AppState;
}

export type Message =
  | PinTabMessage
  | UnpinTabMessage
  | RenameTabMessage
  | GoHomeMessage
  | ReopenTabMessage
  | CreateGroupMessage
  | UpdateGroupMessage
  | DeleteGroupMessage
  | MoveToGroupMessage
  | GetStateMessage
  | StateUpdatedMessage;
```

- [ ] **Step 3: Create `src/lib/url.ts`**

```ts
export function isAtHome(currentUrl: string | null, homeUrl: string): boolean {
  if (!currentUrl) return false;
  try {
    const current = new URL(currentUrl);
    const home = new URL(homeUrl);
    return current.origin === home.origin && current.pathname === home.pathname;
  } catch {
    return false;
  }
}

export function computeTitle(
  customName: string,
  pageTitle: string | null,
  atHome: boolean,
): string {
  if (atHome || !pageTitle) return customName;
  return `${customName} - ${pageTitle}`;
}

export function buildFaviconUrl(extensionId: string, pageUrl: string): string {
  return `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
}

export function getFaviconUrl(pageUrl: string): string {
  return buildFaviconUrl(chrome.runtime.id, pageUrl);
}
```

- [ ] **Step 4: Write tests for URL helpers**

Create `src/lib/url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isAtHome, computeTitle, buildFaviconUrl } from './url';

describe('isAtHome', () => {
  it('returns true when origin and pathname match', () => {
    expect(isAtHome('https://example.com/path', 'https://example.com/path')).toBe(true);
  });

  it('returns true with trailing slash differences', () => {
    expect(isAtHome('https://example.com/path/', 'https://example.com/path/')).toBe(true);
  });

  it('ignores query string differences', () => {
    expect(isAtHome('https://example.com/path?q=1', 'https://example.com/path')).toBe(true);
  });

  it('ignores hash differences', () => {
    expect(isAtHome('https://example.com/path#section', 'https://example.com/path')).toBe(true);
  });

  it('returns false for different pathnames', () => {
    expect(isAtHome('https://example.com/other', 'https://example.com/path')).toBe(false);
  });

  it('returns false for different origins', () => {
    expect(isAtHome('https://other.com/path', 'https://example.com/path')).toBe(false);
  });

  it('returns false when currentUrl is null', () => {
    expect(isAtHome(null, 'https://example.com')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isAtHome('not-a-url', 'https://example.com')).toBe(false);
  });
});

describe('computeTitle', () => {
  it('returns just customName when at home', () => {
    expect(computeTitle('My Tab', 'Some Page', true)).toBe('My Tab');
  });

  it('returns customName - pageTitle when navigated away', () => {
    expect(computeTitle('My Tab', 'Some Page', false)).toBe('My Tab - Some Page');
  });

  it('returns just customName when pageTitle is null', () => {
    expect(computeTitle('My Tab', null, false)).toBe('My Tab');
  });
});

describe('buildFaviconUrl', () => {
  it('constructs correct chrome-extension favicon URL', () => {
    const url = buildFaviconUrl('abc123', 'https://example.com');
    expect(url).toBe(
      'chrome-extension://abc123/_favicon/?pageUrl=https%3A%2F%2Fexample.com&size=32',
    );
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: shared types, messaging protocol, and URL helpers with tests"
```

---

### Task 3: Storage Layer

**Files:**
- Create: `src/storage.ts`

- [ ] **Step 1: Create `src/storage.ts`**

```ts
import type { AppState, ManagedTab, TabGroup } from './types';

const STORAGE_KEY = 'fantab_state';

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
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: storage layer with immutable state helpers"
```

---

### Task 4: Service Worker

**Files:**
- Modify: `src/background.ts` (replace stub)

- [ ] **Step 1: Implement the full service worker**

Replace `src/background.ts` with:

```ts
import type { AppState, ManagedTab } from './types';
import type { Message } from './messaging';
import { isAtHome, computeTitle } from './lib/url';
import {
  loadState,
  saveState,
  generateId,
  findTabByTabId,
  findTabById,
  updateTab,
  addTab,
  removeTab,
  addGroup,
  updateGroup as updateGroupInState,
  removeGroup,
} from './storage';

const titleCache = new Map<number, string>();

async function broadcastState(state: AppState): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      action: 'STATE_UPDATED',
      payload: state,
    });
  } catch {
    // Side panel might not be open — safe to ignore
  }
}

async function applyTitle(tabId: number, title: string): Promise<void> {
  titleCache.set(tabId, title);
  try {
    await chrome.tabs.update(tabId, { title });
  } catch {
    // Tab may have closed between check and update
  }
}

async function refreshTabTitle(managedTab: ManagedTab): Promise<void> {
  if (!managedTab.tabId) return;
  const atHome = isAtHome(managedTab.currentUrl, managedTab.homeUrl);
  const title = computeTitle(
    managedTab.customName,
    managedTab.currentTitle,
    atHome,
  );
  await applyTitle(managedTab.tabId, title);
}

// --- Message handlers ---

async function handlePinTab(chromeTabId: number): Promise<AppState> {
  let state = await loadState();

  if (state.tabs.some((t) => t.tabId === chromeTabId)) {
    return state;
  }

  const tab = await chrome.tabs.get(chromeTabId);
  const managedTab: ManagedTab = {
    id: generateId(),
    homeUrl: tab.url ?? '',
    customName: tab.title ?? 'New Tab',
    groupId: null,
    tabId: chromeTabId,
    faviconUrl: tab.favIconUrl ?? '',
    currentUrl: tab.url ?? null,
    currentTitle: tab.title ?? null,
    createdAt: Date.now(),
  };

  state = addTab(state, managedTab);
  await saveState(state);
  await refreshTabTitle(managedTab);
  await broadcastState(state);
  return state;
}

async function handleUnpinTab(id: string): Promise<AppState> {
  let state = await loadState();
  const tab = findTabById(state, id);
  if (tab?.tabId) {
    titleCache.delete(tab.tabId);
  }
  state = removeTab(state, id);
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleRenameTab(
  id: string,
  customName: string,
): Promise<AppState> {
  let state = await loadState();
  state = updateTab(state, id, { customName });
  await saveState(state);

  const tab = findTabById(state, id);
  if (tab) await refreshTabTitle(tab);

  await broadcastState(state);
  return state;
}

async function handleGoHome(id: string): Promise<AppState> {
  const state = await loadState();
  const tab = findTabById(state, id);
  if (tab?.tabId) {
    await chrome.tabs.update(tab.tabId, { url: tab.homeUrl });
  }
  return state;
}

async function handleReopenTab(id: string): Promise<AppState> {
  let state = await loadState();
  const managedTab = findTabById(state, id);
  if (!managedTab) return state;

  const newTab = await chrome.tabs.create({ url: managedTab.homeUrl });
  state = updateTab(state, id, {
    tabId: newTab.id ?? null,
    currentUrl: managedTab.homeUrl,
    currentTitle: null,
  });
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleCreateGroup(
  name: string,
  color: string,
): Promise<AppState> {
  let state = await loadState();
  const maxOrder = state.groups.reduce((max, g) => Math.max(max, g.order), -1);
  state = addGroup(state, {
    id: generateId(),
    name,
    color,
    order: maxOrder + 1,
  });
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleUpdateGroup(
  id: string,
  updates: { name?: string; color?: string },
): Promise<AppState> {
  let state = await loadState();
  state = updateGroupInState(state, id, updates);
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleDeleteGroup(id: string): Promise<AppState> {
  let state = await loadState();
  state = removeGroup(state, id);
  await saveState(state);
  await broadcastState(state);
  return state;
}

async function handleMoveToGroup(
  tabId: string,
  groupId: string | null,
): Promise<AppState> {
  let state = await loadState();
  state = updateTab(state, tabId, { groupId });
  await saveState(state);
  await broadcastState(state);
  return state;
}

// --- Event listeners ---

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    const handle = async (): Promise<AppState | null> => {
      switch (message.action) {
        case 'PIN_TAB':
          return handlePinTab(message.payload.tabId);
        case 'UNPIN_TAB':
          return handleUnpinTab(message.payload.id);
        case 'RENAME_TAB':
          return handleRenameTab(
            message.payload.id,
            message.payload.customName,
          );
        case 'GO_HOME':
          return handleGoHome(message.payload.id);
        case 'REOPEN_TAB':
          return handleReopenTab(message.payload.id);
        case 'CREATE_GROUP':
          return handleCreateGroup(
            message.payload.name,
            message.payload.color,
          );
        case 'UPDATE_GROUP':
          return handleUpdateGroup(message.payload.id, message.payload);
        case 'DELETE_GROUP':
          return handleDeleteGroup(message.payload.id);
        case 'MOVE_TO_GROUP':
          return handleMoveToGroup(
            message.payload.tabId,
            message.payload.groupId,
          );
        case 'GET_STATE':
          return loadState();
        default:
          return null;
      }
    };

    handle().then(sendResponse);
    return true;
  },
);

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.title) return;

  let state = await loadState();
  const managedTab = findTabByTabId(state, tabId);
  if (!managedTab) return;

  const updates: Partial<ManagedTab> = {};

  if (changeInfo.url) {
    updates.currentUrl = changeInfo.url;
  }

  if (changeInfo.title) {
    if (titleCache.get(tabId) === changeInfo.title) return;
    updates.currentTitle = changeInfo.title;
  }

  if (tab.favIconUrl && tab.favIconUrl !== managedTab.faviconUrl) {
    const currentUrl = updates.currentUrl ?? managedTab.currentUrl;
    if (isAtHome(currentUrl, managedTab.homeUrl)) {
      updates.faviconUrl = tab.favIconUrl;
    }
  }

  state = updateTab(state, managedTab.id, updates);
  await saveState(state);

  const updatedTab = findTabById(state, managedTab.id)!;
  await refreshTabTitle(updatedTab);
  await broadcastState(state);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  let state = await loadState();
  const managedTab = findTabByTabId(state, tabId);
  if (!managedTab) return;

  titleCache.delete(tabId);
  state = updateTab(state, managedTab.id, {
    tabId: null,
    currentUrl: null,
    currentTitle: null,
  });
  await saveState(state);
  await broadcastState(state);
});

chrome.runtime.onStartup.addListener(async () => {
  let state = await loadState();
  const allTabs = await chrome.tabs.query({});
  const tabIds = new Set(allTabs.map((t) => t.id));
  let changed = false;

  for (const managedTab of state.tabs) {
    if (managedTab.tabId !== null && !tabIds.has(managedTab.tabId)) {
      state = updateTab(state, managedTab.id, {
        tabId: null,
        currentUrl: null,
        currentTitle: null,
      });
      changed = true;
    }
  }

  if (changed) {
    await saveState(state);
  }

  for (const managedTab of state.tabs) {
    if (managedTab.tabId !== null) {
      await refreshTabTitle(managedTab);
    }
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: service worker with tab management, title prefixing, and messaging"
```

---

### Task 5: Side Panel Foundation

**Files:**
- Modify: `src/sidepanel/main.ts` (replace stub)
- Create: `src/sidepanel/styles/global.css`
- Create: `src/sidepanel/App.svelte`

- [ ] **Step 1: Create `src/sidepanel/styles/global.css`**

```css
:root {
  --bg-primary: #fff;
  --bg-secondary: #f5f5f5;
  --bg-hover: #e8e8e8;
  --text-primary: #1f1f1f;
  --text-secondary: #5f6368;
  --text-tertiary: #9aa0a6;
  --border-color: #dadce0;
  --accent-color: #1a73e8;
  --accent-hover: #1557b0;
  --success-color: #34a853;
  --closed-color: #9aa0a6;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.15);
  --radius-sm: 4px;
  --radius-md: 8px;
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #292a2d;
    --bg-secondary: #35363a;
    --bg-hover: #3c4043;
    --text-primary: #e8eaed;
    --text-secondary: #9aa0a6;
    --text-tertiary: #5f6368;
    --border-color: #3c4043;
    --accent-color: #8ab4f8;
    --accent-hover: #aecbfa;
    --success-color: #81c995;
    --closed-color: #5f6368;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.4);
  }
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-family);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-primary);
  width: 100%;
  overflow-x: hidden;
}

button {
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
}

input, select {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}
```

- [ ] **Step 2: Replace `src/sidepanel/main.ts`**

```ts
import { mount } from 'svelte';
import App from './App.svelte';
import './styles/global.css';

mount(App, { target: document.getElementById('app')! });
```

- [ ] **Step 3: Create `src/sidepanel/App.svelte`**

```svelte
<script lang="ts">
  import type { AppState } from '../types';
  import type { Message } from '../messaging';
  import Header from './components/Header.svelte';
  import TabList from './components/TabList.svelte';
  import EmptyState from './components/EmptyState.svelte';

  let state = $state<AppState>({ tabs: [], groups: [] });
  let activeTabId = $state<number | null>(null);

  const isActiveTabPinned = $derived(
    activeTabId !== null && state.tabs.some((t) => t.tabId === activeTabId),
  );

  function sendMessage(message: Message): Promise<AppState> {
    return chrome.runtime.sendMessage(message);
  }

  async function handlePinTab() {
    if (activeTabId === null) return;
    await sendMessage({ action: 'PIN_TAB', payload: { tabId: activeTabId } });
  }

  async function handleUnpinTab(id: string) {
    await sendMessage({ action: 'UNPIN_TAB', payload: { id } });
  }

  async function handleRenameTab(id: string, customName: string) {
    await sendMessage({ action: 'RENAME_TAB', payload: { id, customName } });
  }

  async function handleGoHome(id: string) {
    await sendMessage({ action: 'GO_HOME', payload: { id } });
  }

  async function handleReopenTab(id: string) {
    await sendMessage({ action: 'REOPEN_TAB', payload: { id } });
  }

  async function handleCreateGroup(name: string, color: string) {
    await sendMessage({ action: 'CREATE_GROUP', payload: { name, color } });
  }

  async function handleUpdateGroup(
    id: string,
    updates: { name?: string; color?: string },
  ) {
    await sendMessage({ action: 'UPDATE_GROUP', payload: { id, ...updates } });
  }

  async function handleDeleteGroup(id: string) {
    await sendMessage({ action: 'DELETE_GROUP', payload: { id } });
  }

  async function handleMoveToGroup(tabId: string, groupId: string | null) {
    await sendMessage({
      action: 'MOVE_TO_GROUP',
      payload: { tabId, groupId },
    });
  }

  $effect(() => {
    sendMessage({ action: 'GET_STATE', payload: {} }).then((s) => {
      if (s) state = s;
    });

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) activeTabId = tab.id;
    });

    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      activeTabId = info.tabId;
    };
    chrome.tabs.onActivated.addListener(onActivated);

    const onMessage = (message: Message) => {
      if (message.action === 'STATE_UPDATED') {
        state = message.payload;
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);

    const onStorageChanged = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes.fantab_state?.newValue) {
        state = changes.fantab_state.newValue;
      }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  });
</script>

<div class="app">
  <Header onPinTab={handlePinTab} {isActiveTabPinned} />

  {#if state.tabs.length === 0}
    <EmptyState />
  {:else}
    <TabList
      tabs={state.tabs}
      groups={state.groups}
      onUnpinTab={handleUnpinTab}
      onRenameTab={handleRenameTab}
      onGoHome={handleGoHome}
      onReopenTab={handleReopenTab}
      onCreateGroup={handleCreateGroup}
      onUpdateGroup={handleUpdateGroup}
      onDeleteGroup={handleDeleteGroup}
      onMoveToGroup={handleMoveToGroup}
    />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
</style>
```

Note: this file references `Header`, `TabList`, and `EmptyState` components that are created in the next tasks. The build will fail until those exist. That's expected — continue to Task 6.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: side panel foundation — global styles, App root with state management"
```

---

### Task 6: Header & EmptyState Components

**Files:**
- Create: `src/sidepanel/components/Header.svelte`
- Create: `src/sidepanel/components/EmptyState.svelte`

- [ ] **Step 1: Create `src/sidepanel/components/Header.svelte`**

```svelte
<script lang="ts">
  interface Props {
    onPinTab: () => void;
    isActiveTabPinned: boolean;
  }

  let { onPinTab, isActiveTabPinned }: Props = $props();
</script>

<header class="header">
  <h1 class="title">FantTab</h1>
  <button
    class="pin-btn"
    onclick={onPinTab}
    disabled={isActiveTabPinned}
    title={isActiveTabPinned
      ? 'This tab is already pinned'
      : 'Pin the current tab'}
  >
    {isActiveTabPinned ? 'Pinned' : '+ Pin this tab'}
  </button>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
  }

  .pin-btn {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    background: var(--accent-color);
    color: #fff;
    font-weight: 500;
    font-size: 12px;
    transition: background 0.15s;
  }

  .pin-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .pin-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
```

- [ ] **Step 2: Create `src/sidepanel/components/EmptyState.svelte`**

```svelte
<div class="empty">
  <div class="icon">📌</div>
  <p class="message">
    Navigate to a page and click<br />"Pin this tab" to get started.
  </p>
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
    flex: 1;
  }

  .icon {
    font-size: 32px;
    margin-bottom: 12px;
  }

  .message {
    color: var(--text-secondary);
    line-height: 1.5;
  }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Header and EmptyState side panel components"
```

---

### Task 7: InlineEdit Component

**Files:**
- Create: `src/sidepanel/components/InlineEdit.svelte`

- [ ] **Step 1: Create `src/sidepanel/components/InlineEdit.svelte`**

```svelte
<script lang="ts">
  interface Props {
    value: string;
    onSave: (value: string) => void;
    className?: string;
  }

  let { value, onSave, className = '' }: Props = $props();

  let editing = $state(false);
  let editValue = $state(value);
  let inputEl: HTMLInputElement | undefined = $state(undefined);

  function startEditing() {
    editValue = value;
    editing = true;
    requestAnimationFrame(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function save() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    editing = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') editing = false;
  }
</script>

{#if editing}
  <input
    bind:this={inputEl}
    bind:value={editValue}
    onblur={save}
    onkeydown={handleKeydown}
    class="inline-input {className}"
  />
{:else}
  <span
    class="inline-text {className}"
    ondblclick={startEditing}
    title="Double-click to edit"
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && startEditing()}
  >
    {value}
  </span>
{/if}

<style>
  .inline-input {
    background: var(--bg-secondary);
    border: 1px solid var(--accent-color);
    border-radius: var(--radius-sm);
    padding: 1px 4px;
    outline: none;
    width: 100%;
    min-width: 0;
  }

  .inline-text {
    cursor: text;
    border-radius: var(--radius-sm);
    padding: 1px 4px;
    transition: background 0.15s;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inline-text:hover {
    background: var(--bg-hover);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: InlineEdit component for double-click-to-rename"
```

---

### Task 8: TabRow Component

The key component with the contextual favicon "go home" button interaction.

**Files:**
- Create: `src/sidepanel/components/TabRow.svelte`

- [ ] **Step 1: Create `src/sidepanel/components/TabRow.svelte`**

```svelte
<script lang="ts">
  import type { ManagedTab, TabGroup } from '../../types';
  import { isAtHome } from '../../lib/url';
  import InlineEdit from './InlineEdit.svelte';

  interface Props {
    tab: ManagedTab;
    groups: TabGroup[];
    onUnpin: (id: string) => void;
    onRename: (id: string, name: string) => void;
    onGoHome: (id: string) => void;
    onReopen: (id: string) => void;
    onMoveToGroup: (tabId: string, groupId: string | null) => void;
  }

  let { tab, groups, onUnpin, onRename, onGoHome, onReopen, onMoveToGroup }: Props = $props();

  const isOpen = $derived(tab.tabId !== null);
  const atHome = $derived(isAtHome(tab.currentUrl, tab.homeUrl));
  const canGoHome = $derived(isOpen && !atHome);

  let faviconHovered = $state(false);

  function faviconSrc(): string {
    if (tab.faviconUrl) return tab.faviconUrl;
    try {
      return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.homeUrl)}&size=32`;
    } catch {
      return '';
    }
  }

  function handleFaviconClick() {
    if (canGoHome) {
      onGoHome(tab.id);
    } else if (!isOpen) {
      onReopen(tab.id);
    }
  }

  function focusTab() {
    if (tab.tabId) {
      chrome.tabs.update(tab.tabId, { active: true });
    }
  }
</script>

<div class="tab-row" class:closed={!isOpen}>
  <!-- Favicon: contextual go-home / reopen button -->
  <button
    class="favicon-btn"
    class:can-go-home={canGoHome}
    class:is-closed={!isOpen}
    onclick={handleFaviconClick}
    onmouseenter={() => {
      if (canGoHome || !isOpen) faviconHovered = true;
    }}
    onmouseleave={() => (faviconHovered = false)}
    disabled={isOpen && atHome}
    title={canGoHome ? 'Return to pinned URL' : !isOpen ? 'Reopen tab' : ''}
  >
    <img
      class="favicon-img"
      src={faviconSrc()}
      alt=""
      width="20"
      height="20"
      onerror={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  </button>

  <!-- Title area: shifts up on favicon hover to reveal caption -->
  <div
    class="title-area"
    class:shifted={faviconHovered}
    role="button"
    tabindex="0"
    onclick={focusTab}
    onkeydown={(e) => e.key === 'Enter' && focusTab()}
  >
    <div class="title-line">
      <InlineEdit
        value={tab.customName}
        onSave={(name) => onRename(tab.id, name)}
        className="tab-name"
      />
      {#if !atHome && tab.currentTitle && isOpen}
        <span class="page-title"> - {tab.currentTitle}</span>
      {/if}
    </div>
    {#if faviconHovered && canGoHome}
      <div class="caption">Return to pinned URL</div>
    {:else if faviconHovered && !isOpen}
      <div class="caption">Reopen tab</div>
    {/if}
  </div>

  <!-- Status + controls (visible on row hover) -->
  <div class="actions">
    <span class="status-dot" class:open={isOpen}></span>

    <select
      class="group-select"
      value={tab.groupId ?? ''}
      onchange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        onMoveToGroup(tab.id, val || null);
      }}
      title="Assign to group"
    >
      <option value="">No group</option>
      {#each groups as group}
        <option value={group.id}>{group.name}</option>
      {/each}
    </select>

    <button class="unpin-btn" onclick={() => onUnpin(tab.id)} title="Unpin tab">
      ×
    </button>
  </div>
</div>

<style>
  .tab-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
    transition: background 0.15s;
  }

  .tab-row:hover {
    background: var(--bg-secondary);
  }

  .tab-row.closed {
    opacity: 0.6;
  }

  /* --- Favicon button --- */
  .favicon-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    padding: 4px;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      background 0.15s;
  }

  .favicon-btn.can-go-home:hover {
    transform: scale(1.15) translateY(-1px);
    box-shadow: var(--shadow-md);
    background: var(--bg-hover);
    cursor: pointer;
  }

  .favicon-btn.is-closed:hover {
    transform: scale(1.1);
    background: var(--bg-hover);
    cursor: pointer;
  }

  .favicon-btn:disabled {
    cursor: default;
  }

  .favicon-img {
    width: 20px;
    height: 20px;
    border-radius: 2px;
  }

  /* --- Title area --- */
  .title-area {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s ease;
  }

  .title-area.shifted {
    transform: translateY(-4px);
  }

  .title-line {
    display: flex;
    align-items: baseline;
    min-width: 0;
    overflow: hidden;
  }

  :global(.tab-name) {
    font-weight: 500;
    font-size: 13px;
    flex-shrink: 0;
  }

  .page-title {
    color: var(--text-secondary);
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .caption {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 1px;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* --- Actions --- */
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--closed-color);
  }

  .status-dot.open {
    background: var(--success-color);
  }

  .group-select {
    font-size: 11px;
    padding: 2px 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-secondary);
    max-width: 80px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .tab-row:hover .group-select {
    opacity: 1;
  }

  .unpin-btn {
    font-size: 16px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.15s,
      color 0.15s;
  }

  .tab-row:hover .unpin-btn {
    opacity: 1;
  }

  .unpin-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: TabRow component with contextual favicon go-home button"
```

---

### Task 9: GroupHeader & TabList Components

**Files:**
- Create: `src/sidepanel/components/GroupHeader.svelte`
- Create: `src/sidepanel/components/TabList.svelte`

- [ ] **Step 1: Create `src/sidepanel/components/GroupHeader.svelte`**

```svelte
<script lang="ts">
  import type { TabGroup } from '../../types';
  import InlineEdit from './InlineEdit.svelte';

  interface Props {
    group: TabGroup;
    collapsed: boolean;
    onToggle: () => void;
    onUpdateGroup: (id: string, updates: { name?: string; color?: string }) => void;
    onDeleteGroup: (id: string) => void;
  }

  let { group, collapsed, onToggle, onUpdateGroup, onDeleteGroup }: Props = $props();
</script>

<div class="group-header">
  <button class="toggle-btn" onclick={onToggle} aria-label={collapsed ? 'Expand' : 'Collapse'}>
    <span class="chevron" class:collapsed>{collapsed ? '▶' : '▼'}</span>
  </button>

  <span class="color-dot" style="background: {group.color}"></span>

  <div class="group-name-wrap">
    <InlineEdit
      value={group.name}
      onSave={(name) => onUpdateGroup(group.id, { name })}
      className="group-name"
    />
  </div>

  <button
    class="delete-btn"
    onclick={() => onDeleteGroup(group.id)}
    title="Delete group (tabs move to ungrouped)"
  >
    ×
  </button>
</div>

<style>
  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px 4px;
  }

  .toggle-btn {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--text-secondary);
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .group-name-wrap {
    flex: 1;
    min-width: 0;
  }

  :global(.group-name) {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .delete-btn {
    font-size: 14px;
    color: var(--text-tertiary);
    opacity: 0;
    transition:
      opacity 0.15s,
      color 0.15s;
  }

  .group-header:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--text-primary);
  }
</style>
```

- [ ] **Step 2: Create `src/sidepanel/components/TabList.svelte`**

```svelte
<script lang="ts">
  import type { ManagedTab, TabGroup } from '../../types';
  import TabRow from './TabRow.svelte';
  import GroupHeader from './GroupHeader.svelte';

  interface Props {
    tabs: ManagedTab[];
    groups: TabGroup[];
    onUnpinTab: (id: string) => void;
    onRenameTab: (id: string, name: string) => void;
    onGoHome: (id: string) => void;
    onReopenTab: (id: string) => void;
    onCreateGroup: (name: string, color: string) => void;
    onUpdateGroup: (id: string, updates: { name?: string; color?: string }) => void;
    onDeleteGroup: (id: string) => void;
    onMoveToGroup: (tabId: string, groupId: string | null) => void;
  }

  let {
    tabs,
    groups,
    onUnpinTab,
    onRenameTab,
    onGoHome,
    onReopenTab,
    onCreateGroup,
    onUpdateGroup,
    onDeleteGroup,
    onMoveToGroup,
  }: Props = $props();

  let collapsedGroups = $state<Set<string>>(new Set());
  let showNewGroupForm = $state(false);
  let newGroupName = $state('');
  let newGroupColor = $state('#4285f4');

  const sortedGroups = $derived(
    [...groups].sort((a, b) => a.order - b.order),
  );

  const ungroupedTabs = $derived(
    tabs
      .filter((t) => t.groupId === null)
      .sort((a, b) => a.createdAt - b.createdAt),
  );

  function tabsForGroup(groupId: string): ManagedTab[] {
    return tabs
      .filter((t) => t.groupId === groupId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function toggleGroup(id: string) {
    const next = new Set(collapsedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsedGroups = next;
  }

  function submitNewGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    onCreateGroup(name, newGroupColor);
    newGroupName = '';
    newGroupColor = '#4285f4';
    showNewGroupForm = false;
  }

  const GROUP_COLORS = [
    '#4285f4',
    '#34a853',
    '#fbbc04',
    '#ea4335',
    '#a142f4',
    '#24c1e0',
    '#f538a0',
    '#5f6368',
  ];
</script>

<div class="tab-list">
  {#each sortedGroups as group (group.id)}
    {@const groupTabs = tabsForGroup(group.id)}
    <GroupHeader
      {group}
      collapsed={collapsedGroups.has(group.id)}
      onToggle={() => toggleGroup(group.id)}
      {onUpdateGroup}
      {onDeleteGroup}
    />
    {#if !collapsedGroups.has(group.id)}
      {#if groupTabs.length === 0}
        <div class="empty-group">No tabs in this group</div>
      {:else}
        {#each groupTabs as tab (tab.id)}
          <TabRow
            {tab}
            {groups}
            onUnpin={onUnpinTab}
            onRename={onRenameTab}
            {onGoHome}
            onReopen={onReopenTab}
            {onMoveToGroup}
          />
        {/each}
      {/if}
    {/if}
  {/each}

  {#if ungroupedTabs.length > 0}
    {#if sortedGroups.length > 0}
      <div class="section-label">Ungrouped</div>
    {/if}
    {#each ungroupedTabs as tab (tab.id)}
      <TabRow
        {tab}
        {groups}
        onUnpin={onUnpinTab}
        onRename={onRenameTab}
        {onGoHome}
        onReopen={onReopenTab}
        {onMoveToGroup}
      />
    {/each}
  {/if}

  <div class="add-group-section">
    {#if showNewGroupForm}
      <form
        class="new-group-form"
        onsubmit={(e) => {
          e.preventDefault();
          submitNewGroup();
        }}
      >
        <input
          bind:value={newGroupName}
          placeholder="Group name"
          class="group-name-input"
        />
        <div class="color-picker">
          {#each GROUP_COLORS as color}
            <button
              type="button"
              class="color-swatch"
              class:selected={newGroupColor === color}
              style="background: {color}"
              onclick={() => (newGroupColor = color)}
              aria-label="Color {color}"
            ></button>
          {/each}
        </div>
        <div class="form-actions">
          <button type="submit" class="save-btn">Create</button>
          <button
            type="button"
            class="cancel-btn"
            onclick={() => (showNewGroupForm = false)}>Cancel</button
          >
        </div>
      </form>
    {:else}
      <button
        class="add-group-btn"
        onclick={() => (showNewGroupForm = true)}
      >
        + New Group
      </button>
    {/if}
  </div>
</div>

<style>
  .tab-list {
    flex: 1;
    overflow-y: auto;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 12px 12px 4px;
  }

  .empty-group {
    padding: 8px 12px 8px 42px;
    font-size: 12px;
    color: var(--text-tertiary);
    font-style: italic;
  }

  .add-group-section {
    padding: 8px 12px;
    border-top: 1px solid var(--border-color);
  }

  .add-group-btn {
    color: var(--accent-color);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 0;
  }

  .add-group-btn:hover {
    text-decoration: underline;
  }

  .new-group-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-name-input {
    padding: 6px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    outline: none;
  }

  .group-name-input:focus {
    border-color: var(--accent-color);
  }

  .color-picker {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }

  .color-swatch.selected {
    border-color: var(--text-primary);
    transform: scale(1.15);
  }

  .color-swatch:hover {
    transform: scale(1.15);
  }

  .form-actions {
    display: flex;
    gap: 8px;
  }

  .save-btn {
    padding: 4px 12px;
    background: var(--accent-color);
    color: #fff;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 500;
  }

  .save-btn:hover {
    background: var(--accent-hover);
  }

  .cancel-btn {
    padding: 4px 12px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .cancel-btn:hover {
    color: var(--text-primary);
  }
</style>
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: builds without errors. `dist/` contains all compiled assets.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: GroupHeader and TabList components with group management UI"
```

---

### Task 10: Build Verification & Manual Testing

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: all URL helper tests pass.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: clean build with no errors. `dist/` contains:
- `sidepanel.html`
- `sidepanel.js`
- `background.js`
- `chunks/` (shared code)
- `assets/` (CSS)
- `manifest.json`

- [ ] **Step 3: Verify `dist/` structure**

```bash
ls -la dist/
ls -la dist/chunks/ 2>/dev/null || echo "no chunks dir"
ls -la dist/assets/ 2>/dev/null || echo "no assets dir"
```

Verify that `manifest.json` references match actual filenames. If Vite outputs `background.js` and `sidepanel.html` at the top level of `dist/`, the manifest paths are correct. If the paths differ, update `public/manifest.json` to match.

- [ ] **Step 4: Manual test checklist**

Load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `dist/` folder
4. The FantTab extension should appear with no errors

Test each feature:
- [ ] Click the FantTab toolbar icon → side panel opens with empty state message
- [ ] Navigate to a website → click "Pin this tab" → tab appears in side panel
- [ ] Tab title in Chrome tab strip shows the custom name
- [ ] Navigate to a different page within the tab → title changes to `Custom Name - Page Title`
- [ ] Hover the favicon in the side panel → it raises up, title shifts, "Return to pinned URL" caption appears
- [ ] Click the favicon → tab navigates back to the pinned URL
- [ ] At the pinned URL → favicon is static (not clickable)
- [ ] Double-click the custom name → inline edit mode → type new name → press Enter
- [ ] Chrome tab title updates to reflect new custom name
- [ ] Click "× " on a tab row → tab is unpinned (removed from side panel)
- [ ] Close a managed tab (via Chrome) → it shows as closed (gray dot) in side panel
- [ ] Hover the favicon of a closed tab → "Reopen tab" caption
- [ ] Click the favicon → tab reopens at pinned URL
- [ ] Click "+ New Group" → create a group with name and color
- [ ] Assign a tab to the group via the dropdown → tab moves under group header
- [ ] Collapse/expand a group via the chevron
- [ ] Double-click group name → rename it
- [ ] Delete a group → its tabs move to ungrouped

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: final build verification"
```
