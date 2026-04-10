# FantTab -- Chrome Extension Design

A Chrome extension (Manifest V3) that provides custom tab behaviors via a side panel: tab renaming with persistent prefixes, "pinned URL" tabs that can navigate freely but reset to a home URL on demand, and custom tab grouping.

## Architecture

Four components:

1. **Service Worker** (`src/background.ts`) -- Listens to Chrome tab events (`onUpdated`, `onRemoved`, `onActivated`), applies custom title prefixes to managed tabs, manages state in `chrome.storage.local`, and communicates with the side panel via `chrome.runtime` messaging.

2. **Side Panel** (Svelte app, entry at `src/sidepanel/`) -- The user-facing UI. Displays managed tabs organized by custom groups with controls for pinning, renaming, navigating home, and group management.

3. **Storage Layer** (`chrome.storage.local`) -- Persists managed tabs and groups across sessions. Source of truth for all state.

4. **Manifest** (`public/manifest.json`, Manifest V3) -- Declares permissions and extension metadata.

## Data Model

```typescript
interface ManagedTab {
  id: string;              // UUID, stable across sessions
  homeUrl: string;         // the "pinned" URL
  customName: string;      // user-chosen display name
  groupId: string | null;  // reference to TabGroup.id, or null for ungrouped
  tabId: number | null;    // Chrome tab ID, null when tab is closed
  faviconUrl: string;      // cached favicon URL of homeUrl
  currentUrl: string | null;   // tab's current URL (null when closed)
  currentTitle: string | null; // tab's current page title (null when closed)
  createdAt: number;       // timestamp for ordering
}

interface TabGroup {
  id: string;              // UUID
  name: string;            // user-chosen group name
  color: string;           // hex color for the group badge in the side panel
  order: number;           // for sorting groups
}

interface AppState {
  tabs: ManagedTab[];
  groups: TabGroup[];
}
```

## Permissions

```json
{
  "permissions": ["tabs", "sidePanel", "storage", "favicon"],
  "host_permissions": ["<all_urls>"]
}
```

- `tabs`: read tab URL/title, update tab title
- `sidePanel`: render the side panel UI
- `storage`: persist state across sessions
- `favicon`: fetch site favicons for display in the side panel
- `host_permissions: <all_urls>`: required for `chrome.tabs.update()` to set titles on any domain and for the favicon API to work universally

## Key Behaviors

### Pinning a tab

User navigates to a page, opens the side panel, clicks "Pin this tab." The service worker:
1. Reads the active tab's URL, title, and favicon
2. Creates a `ManagedTab` with a new UUID, the URL as `homeUrl`, the page title as initial `customName`
3. Saves to storage and broadcasts updated state
4. Immediately sets the Chrome tab title to the `customName`

### Title format (Chrome tab strip)

- **At home URL:** `Custom Name`
- **Navigated away:** `Custom Name - Page Title`

The service worker listens to `chrome.tabs.onUpdated`. When a managed tab's URL or title changes, it:
1. Updates `currentUrl` and `currentTitle` in storage
2. Compares `currentUrl` to `homeUrl` (origin + pathname match, ignoring query/hash) to determine `isAtHome`
3. Applies the appropriate title format to the Chrome tab
4. A guard prevents infinite loops (skip update if the title already matches the expected format)

### Go Home

The favicon in the side panel tab row doubles as the "go home" button (see Side Panel UI). Clicking it sends `GO_HOME` + tab UUID to the service worker, which calls `chrome.tabs.update(tabId, { url: homeUrl })`.

### Tab closure detection

Service worker listens to `chrome.tabs.onRemoved`. When a managed tab is closed, its `tabId` is set to `null` in storage. The tab is NOT removed from the managed list.

### Reopening a closed tab

Side panel shows closed tabs with a "reopen" button. Clicking it:
1. Creates a new Chrome tab at the `homeUrl`
2. Updates the `ManagedTab.tabId` with the new Chrome tab ID
3. Applies the title prefix

### Session persistence

On Chrome restart, all `ManagedTab` entries persist in `chrome.storage.local`. Their `tabId` values are stale. On service worker startup, the worker checks all managed tabs: if a `tabId` doesn't correspond to an existing Chrome tab, it sets `tabId = null`. The side panel shows these as "closed" with reopen buttons.

### Renaming

Click the custom name in the side panel to edit inline. On confirm, update `customName` in storage and re-apply the title prefix to the Chrome tab (if open).

## Side Panel UI

### Layout

**Header area:**
- Extension name/logo
- "Pin this tab" button (pins the currently active tab)

**Tab list** (scrollable):
- Tabs grouped under collapsible group headers
- "Ungrouped" section for tabs not assigned to any group
- Each group header: colored dot + group name (click to edit) + collapse toggle

**Each managed tab row:**

Layout: `[FAVICON] Custom Name` or `[FAVICON] Custom Name - Page Title`

- **Favicon** (left side): Displays the site's favicon. Doubles as a contextual "go home" button:
  - **When at home URL:** Static, non-interactive. Just a visual identifier.
  - **When navigated away from home:** Becomes a button. On hover, it visually raises/highlights (elevated shadow, slight scale-up) to indicate it's clickable. The text to the right shifts up and a caption appears beneath it describing the action (e.g., "Return to pinned URL"). Clicking navigates the tab back to the home URL.
  - **When tab is closed:** Static, dimmed.
- **Title area** (right of favicon):
  - Top line: custom name (click to edit inline). When away from home, appends ` - Page Title` in a dimmer weight.
  - On favicon hover (when away from home): the title shifts upward and a small caption appears below (e.g., "Return to pinned URL"), matching the macOS media control interaction pattern.
- **Status indicator:** Green dot = open, gray dot = closed.
- **Unpin button** (x icon, on row hover) -- removes tab from management.

**Group management:**
- "+" button to create a new group (name + color picker)
- Each tab has a group dropdown to assign/reassign it to a group
- Delete group moves its tabs to ungrouped

**Empty state:**
- "Navigate to a page and click 'Pin this tab' to get started."

### Styling

Compact design suited to the ~350px-wide side panel. Use CSS custom properties for theming. Match Chrome's side panel aesthetic (clean, neutral, system font). Light/dark mode support via `prefers-color-scheme`.

## Communication Protocol

Side panel and service worker communicate via `chrome.runtime.sendMessage` / `onMessage`.

### Messages from Side Panel to Service Worker

| Action | Payload |
|---|---|
| `PIN_TAB` | `{ tabId: number }` |
| `UNPIN_TAB` | `{ id: string }` |
| `RENAME_TAB` | `{ id: string, customName: string }` |
| `GO_HOME` | `{ id: string }` |
| `REOPEN_TAB` | `{ id: string }` |
| `CREATE_GROUP` | `{ name: string, color: string }` |
| `UPDATE_GROUP` | `{ id: string, name?: string, color?: string }` |
| `DELETE_GROUP` | `{ id: string }` |
| `MOVE_TO_GROUP` | `{ tabId: string, groupId: string \| null }` |
| `GET_STATE` | `{}` |

### Messages from Service Worker to Side Panel

| Action | Payload |
|---|---|
| `STATE_UPDATED` | `AppState` |

The side panel also listens to `chrome.storage.onChanged` as a secondary sync mechanism (handles edge cases where the panel reconnects after service worker restart).

## Build Setup

- **Vite** as bundler with `@sveltejs/vite-plugin-svelte`
- **Svelte 5** for the side panel UI
- **TypeScript** throughout
- Two build entry points:
  - `src/sidepanel/index.html` → `dist/sidepanel.html` (Svelte app)
  - `src/background.ts` → `dist/background.js` (service worker, no DOM APIs)
- `public/manifest.json` copied as-is to `dist/`
- `public/icons/` for extension icons (16, 48, 128px)
- Output to `dist/` -- load as unpacked extension at `chrome://extensions`

### Development workflow

1. `npm run dev` -- Vite watches and rebuilds on changes
2. Load `dist/` as unpacked extension in Chrome
3. After changes, click "reload" on the extension card in `chrome://extensions`

## File Structure

```
fantab/
├── public/
│   ├── manifest.json
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
├── src/
│   ├── background.ts          # service worker
│   ├── types.ts               # shared TypeScript interfaces
│   ├── storage.ts             # chrome.storage.local helpers
│   ├── messaging.ts           # message type definitions
│   └── sidepanel/
│       ├── index.html          # side panel entry HTML
│       ├── main.ts             # Svelte app bootstrap
│       ├── App.svelte          # root component
│       ├── components/
│       │   ├── Header.svelte
│       │   ├── TabList.svelte
│       │   ├── TabRow.svelte
│       │   ├── GroupHeader.svelte
│       │   ├── EmptyState.svelte
│       │   └── InlineEdit.svelte
│       └── styles/
│           └── global.css
├── vite.config.ts
├── svelte.config.js
├── tsconfig.json
├── package.json
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-09-fantab-design.md
```

## Edge Cases

- **Duplicate pinning:** If user tries to pin a tab that's already managed, show a notice rather than creating a duplicate.
- **Title update loops:** Guard against infinite loops by checking if the title already has the correct prefix before calling `chrome.tabs.update`.
- **Service worker lifecycle:** MV3 service workers can be terminated. All state is in `chrome.storage.local`, so the worker is stateless on restart. It re-reads storage on activation.
- **Tab ID reuse:** Chrome may reuse tab IDs across sessions. On startup, validate that stored `tabId` values actually correspond to tabs with matching URLs before trusting them.
- **Side panel closed:** The service worker operates independently. Title prefixing and tab tracking work whether the side panel is open or not.
