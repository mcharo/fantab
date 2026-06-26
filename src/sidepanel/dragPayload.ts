import { isHttpUrl } from '../lib/url';

/**
 * Custom drag MIME carrying fantab tab metadata (url + optional custom title)
 * across fantab instances. Same-origin so it survives drags between windows of
 * the same profile; cross-profile/external drops fall back to the standard
 * `text/uri-list` and `text/plain` types, which only carry the url.
 */
export const FANTAB_TABS_MIME = 'application/x-fantab-tabs';

export interface DragTabPayload {
  url: string;
  /** A user-chosen rename, carried so a sibling fantab can apply it. */
  title?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Populate a drag's dataTransfer so the dragged tab(s) can drop usefully into:
 * another fantab (url + title via the custom type), another Chrome window/the
 * tab strip (url via the standard link types), or a text field (url text).
 * Always sets `text/plain` so the in-app drag stays valid even when no tab has
 * an http(s) url to export.
 */
export function setTabDragData(
  dataTransfer: DataTransfer,
  tabs: DragTabPayload[],
): void {
  const exportable = tabs.filter((tab) => isHttpUrl(tab.url));

  if (exportable.length > 0) {
    dataTransfer.setData(FANTAB_TABS_MIME, JSON.stringify(exportable));
    const urls = exportable.map((tab) => tab.url);
    dataTransfer.setData('text/uri-list', urls.join('\r\n'));
    dataTransfer.setData('text/plain', urls.join('\n'));
    dataTransfer.setData(
      'text/html',
      exportable
        .map((tab) => `<a href="${escapeHtml(tab.url)}">${escapeHtml(tab.title ?? tab.url)}</a>`)
        .join(''),
    );
  } else {
    // Some data is still required for a valid drag; in-app detection uses the
    // drag store, so the exact value is irrelevant.
    dataTransfer.setData('text/plain', tabs[0]?.title ?? ' ');
  }
}

/**
 * Recover tab payloads from a drop that didn't originate in this fantab
 * instance: the custom fantab type when present (carries titles), otherwise any
 * http(s) urls from the standard link/text types. Returns an empty list when
 * nothing droppable (e.g. files or plain text) is present.
 */
export function readTabDragData(dataTransfer: DataTransfer): DragTabPayload[] {
  const fantab = dataTransfer.getData(FANTAB_TABS_MIME);
  if (fantab) {
    try {
      const parsed: unknown = JSON.parse(fantab);
      if (Array.isArray(parsed)) {
        const items = parsed
          .filter(
            (entry): entry is { url: string; title?: unknown } =>
              !!entry && typeof entry.url === 'string',
          )
          .filter((entry) => isHttpUrl(entry.url))
          .map((entry) => ({
            url: entry.url,
            title: typeof entry.title === 'string' ? entry.title : undefined,
          }));
        if (items.length > 0) return items;
      }
    } catch {
      // Fall through to the standard types.
    }
  }

  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    const urls = uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .filter(isHttpUrl);
    if (urls.length > 0) return urls.map((url) => ({ url }));
  }

  const text = dataTransfer.getData('text/plain').trim();
  if (text && isHttpUrl(text)) return [{ url: text }];

  return [];
}
