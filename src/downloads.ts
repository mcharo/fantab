/**
 * A completed download distilled to what the downloads fan needs to render and
 * act on it. Kept separate from the chrome.downloads.DownloadItem so the view
 * layer doesn't depend on the full (and partly unstable) Chrome shape.
 */
export interface RecentDownload {
  id: number;
  basename: string;
  filename: string;
  url: string;
  mime: string;
  /** Completion time in epoch ms (falls back to start time), or null if unknown. */
  completedAt: number | null;
}

export const DEFAULT_RECENT_DOWNLOADS_LIMIT = 5;

/**
 * Last path segment of a download's on-disk path. Chrome reports POSIX paths on
 * macOS/Linux and Windows-style paths (with `\`) on Windows, so split on both.
 */
export function downloadBasename(filename: string): string {
  const segments = filename.split(/[/\\]/);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (segment) return segment;
  }
  return filename;
}

/**
 * The newest completed downloads whose file still exists on disk, mapped to the
 * lightweight {@link RecentDownload} view model. In-progress, interrupted, and
 * already-removed files are excluded so every item the fan shows is openable.
 */
export function selectRecentDownloads(
  items: chrome.downloads.DownloadItem[],
  limit = DEFAULT_RECENT_DOWNLOADS_LIMIT,
): RecentDownload[] {
  return items
    .filter((item) => item.state === 'complete' && item.exists && !!item.filename)
    .sort((a, b) => (downloadCompletedAt(b) ?? 0) - (downloadCompletedAt(a) ?? 0))
    .slice(0, Math.max(0, limit))
    .map((item) => ({
      id: item.id,
      basename: downloadBasename(item.filename),
      filename: item.filename,
      url: item.finalUrl || item.url || '',
      mime: item.mime ?? '',
      completedAt: downloadCompletedAt(item),
    }));
}

// Prefer the completion time; fall back to the start time for records that
// somehow lack an endTime. Returns null for missing/unparsable timestamps.
function downloadCompletedAt(item: chrome.downloads.DownloadItem): number | null {
  const stamp = item.endTime ?? item.startTime;
  if (!stamp) return null;
  const parsed = Date.parse(stamp);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Human-friendly "time since" label for a download, e.g. "Just now",
 * "45 seconds ago", "2 minutes ago", "Yesterday". Older items fall back to a
 * short calendar date.
 */
export function formatRelativeAge(
  timestampMs: number,
  nowMs: number = Date.now(),
): string {
  const seconds = Math.floor(Math.max(0, nowMs - timestampMs) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${plural(minutes, 'minute')} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'hour')} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${plural(weeks, 'week')} ago`;
  }

  return new Date(timestampMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function plural(value: number, unit: string): string {
  return value === 1 ? unit : `${unit}s`;
}
