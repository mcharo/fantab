import { describe, expect, it } from 'vitest';
import {
  downloadBasename,
  formatRelativeAge,
  selectRecentDownloads,
} from './downloads';

function item(
  overrides: Partial<chrome.downloads.DownloadItem>,
): chrome.downloads.DownloadItem {
  return {
    id: 1,
    state: 'complete',
    exists: true,
    filename: '/Users/me/Downloads/file.pdf',
    url: 'https://example.com/file.pdf',
    finalUrl: 'https://example.com/file.pdf',
    mime: 'application/pdf',
    startTime: '2026-01-01T00:00:00.000Z',
    paused: false,
    canResume: false,
    incognito: false,
    danger: 'safe',
    bytesReceived: 0,
    totalBytes: 0,
    fileSize: 0,
    ...overrides,
  } as chrome.downloads.DownloadItem;
}

describe('downloadBasename', () => {
  it('returns the last segment of a POSIX path', () => {
    expect(downloadBasename('/Users/me/Downloads/report.pdf')).toBe('report.pdf');
  });

  it('returns the last segment of a Windows path', () => {
    expect(downloadBasename('C:\\Users\\me\\Downloads\\report.pdf')).toBe(
      'report.pdf',
    );
  });

  it('returns the whole string when there is no separator', () => {
    expect(downloadBasename('report.pdf')).toBe('report.pdf');
  });

  it('ignores a trailing separator', () => {
    expect(downloadBasename('/Users/me/Downloads/')).toBe('Downloads');
  });
});

describe('selectRecentDownloads', () => {
  it('excludes in-progress and interrupted downloads', () => {
    const result = selectRecentDownloads([
      item({ id: 1, state: 'complete' }),
      item({ id: 2, state: 'in_progress' }),
      item({ id: 3, state: 'interrupted' }),
    ]);

    expect(result.map((d) => d.id)).toEqual([1]);
  });

  it('excludes downloads whose file no longer exists', () => {
    const result = selectRecentDownloads([
      item({ id: 1, exists: true }),
      item({ id: 2, exists: false }),
    ]);

    expect(result.map((d) => d.id)).toEqual([1]);
  });

  it('orders by completion time, newest first', () => {
    const result = selectRecentDownloads([
      item({ id: 1, endTime: '2026-01-01T10:00:00.000Z' }),
      item({ id: 2, endTime: '2026-01-03T10:00:00.000Z' }),
      item({ id: 3, endTime: '2026-01-02T10:00:00.000Z' }),
    ]);

    expect(result.map((d) => d.id)).toEqual([2, 3, 1]);
  });

  it('falls back to startTime when endTime is absent', () => {
    const result = selectRecentDownloads([
      item({ id: 1, endTime: undefined, startTime: '2026-01-01T00:00:00.000Z' }),
      item({ id: 2, endTime: undefined, startTime: '2026-01-05T00:00:00.000Z' }),
    ]);

    expect(result.map((d) => d.id)).toEqual([2, 1]);
  });

  it('respects the limit', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      item({ id: index + 1, endTime: `2026-01-0${index + 1}T00:00:00.000Z` }),
    );

    expect(selectRecentDownloads(items, 3)).toHaveLength(3);
  });

  it('maps to the RecentDownload view model with the basename', () => {
    const [download] = selectRecentDownloads([
      item({
        id: 7,
        filename: '/Users/me/Downloads/photo.png',
        finalUrl: 'https://cdn.example.com/photo.png',
        mime: 'image/png',
      }),
    ]);

    expect(download).toEqual({
      id: 7,
      basename: 'photo.png',
      filename: '/Users/me/Downloads/photo.png',
      url: 'https://cdn.example.com/photo.png',
      mime: 'image/png',
      completedAt: Date.parse('2026-01-01T00:00:00.000Z'),
    });
  });
});

describe('formatRelativeAge', () => {
  const now = Date.parse('2026-06-24T12:00:00.000Z');
  const ago = (ms: number) => now - ms;
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('says "Just now" for the last few seconds', () => {
    expect(formatRelativeAge(ago(2 * SECOND), now)).toBe('Just now');
  });

  it('reports seconds', () => {
    expect(formatRelativeAge(ago(45 * SECOND), now)).toBe('45 seconds ago');
  });

  it('reports minutes with singular/plural', () => {
    expect(formatRelativeAge(ago(MINUTE), now)).toBe('1 minute ago');
    expect(formatRelativeAge(ago(5 * MINUTE), now)).toBe('5 minutes ago');
  });

  it('reports hours', () => {
    expect(formatRelativeAge(ago(3 * HOUR), now)).toBe('3 hours ago');
  });

  it('says "Yesterday" for one day', () => {
    expect(formatRelativeAge(ago(DAY), now)).toBe('Yesterday');
  });

  it('reports several days', () => {
    expect(formatRelativeAge(ago(3 * DAY), now)).toBe('3 days ago');
  });

  it('reports weeks', () => {
    expect(formatRelativeAge(ago(14 * DAY), now)).toBe('2 weeks ago');
  });

  it('falls back to a calendar date for old downloads', () => {
    const label = formatRelativeAge(ago(60 * DAY), now);
    expect(label).not.toContain('ago');
    expect(label.length).toBeGreaterThan(0);
  });

  it('clamps future timestamps to "Just now"', () => {
    expect(formatRelativeAge(now + 10 * SECOND, now)).toBe('Just now');
  });
});
