import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DENSITY,
  DEFAULT_PREFERENCES,
  DEFAULT_TAB_TITLE_FONT_SIZE,
  DEFAULT_THEME,
  MAX_TAB_TITLE_FONT_SIZE,
  MIN_TAB_TITLE_FONT_SIZE,
  PREFERENCES_KEY,
  clampTabTitleFontSize,
  loadPreferences,
  normalizeDensity,
  normalizePreferences,
  normalizeTheme,
  savePreferences,
} from './preferences';

describe('clampTabTitleFontSize', () => {
  it('keeps in-range integers untouched', () => {
    expect(clampTabTitleFontSize(15)).toBe(15);
  });

  it('rounds fractional values', () => {
    expect(clampTabTitleFontSize(14.4)).toBe(14);
    expect(clampTabTitleFontSize(14.6)).toBe(15);
  });

  it('clamps to the supported bounds', () => {
    expect(clampTabTitleFontSize(2)).toBe(MIN_TAB_TITLE_FONT_SIZE);
    expect(clampTabTitleFontSize(99)).toBe(MAX_TAB_TITLE_FONT_SIZE);
  });

  it('falls back to the default for non-numeric input', () => {
    expect(clampTabTitleFontSize('big')).toBe(DEFAULT_TAB_TITLE_FONT_SIZE);
    expect(clampTabTitleFontSize(NaN)).toBe(DEFAULT_TAB_TITLE_FONT_SIZE);
    expect(clampTabTitleFontSize(undefined)).toBe(DEFAULT_TAB_TITLE_FONT_SIZE);
  });
});

describe('normalizeTheme', () => {
  it('keeps supported values', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('system');
  });

  it('falls back to the default for unknown values', () => {
    expect(normalizeTheme('neon')).toBe(DEFAULT_THEME);
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
  });
});

describe('normalizeDensity', () => {
  it('keeps supported values', () => {
    expect(normalizeDensity('compact')).toBe('compact');
    expect(normalizeDensity('comfortable')).toBe('comfortable');
  });

  it('falls back to the default for unknown values', () => {
    expect(normalizeDensity('tiny')).toBe(DEFAULT_DENSITY);
    expect(normalizeDensity(undefined)).toBe(DEFAULT_DENSITY);
  });
});

describe('normalizePreferences', () => {
  it('fills missing fields with defaults', () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES);
  });

  it('clamps and validates stored values', () => {
    expect(
      normalizePreferences({
        tabTitleFontSize: 999,
        theme: 'dark',
        density: 'compact',
      }),
    ).toEqual({
      tabTitleFontSize: MAX_TAB_TITLE_FONT_SIZE,
      theme: 'dark',
      density: 'compact',
      syncEnabled: false,
      closeAllRestoreSeconds: 5,
      closeAllHoldToConfirm: true,
      enableVideoPreview: false,
    });
  });

  it('defaults closeAllHoldToConfirm on and keeps explicit booleans', () => {
    expect(normalizePreferences({}).closeAllHoldToConfirm).toBe(true);
    expect(
      normalizePreferences({ closeAllHoldToConfirm: 'no' }).closeAllHoldToConfirm,
    ).toBe(true);
    expect(
      normalizePreferences({ closeAllHoldToConfirm: false }).closeAllHoldToConfirm,
    ).toBe(false);
  });

  it('clamps the close-all restore window', () => {
    expect(normalizePreferences({}).closeAllRestoreSeconds).toBe(5);
    expect(normalizePreferences({ closeAllRestoreSeconds: 0 }).closeAllRestoreSeconds).toBe(2);
    expect(normalizePreferences({ closeAllRestoreSeconds: 999 }).closeAllRestoreSeconds).toBe(20);
    expect(normalizePreferences({ closeAllRestoreSeconds: 8.6 }).closeAllRestoreSeconds).toBe(9);
  });

  it('drops invalid theme/density values', () => {
    expect(
      normalizePreferences({ theme: 'sepia', density: 'roomy' }),
    ).toEqual(DEFAULT_PREFERENCES);
  });

  it('defaults syncEnabled to false and keeps explicit booleans', () => {
    expect(normalizePreferences({}).syncEnabled).toBe(false);
    expect(normalizePreferences({ syncEnabled: 'yes' }).syncEnabled).toBe(false);
    expect(normalizePreferences({ syncEnabled: true }).syncEnabled).toBe(true);
  });

  it('defaults experimental video preview off and keeps explicit booleans', () => {
    expect(normalizePreferences({}).enableVideoPreview).toBe(false);
    expect(normalizePreferences({ enableVideoPreview: 'yes' }).enableVideoPreview).toBe(false);
    expect(normalizePreferences({ enableVideoPreview: true }).enableVideoPreview).toBe(true);
  });
});

describe('loadPreferences / savePreferences', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reads and normalizes the stored preferences', async () => {
    const get = vi.fn().mockResolvedValue({
      [PREFERENCES_KEY]: { tabTitleFontSize: 18, theme: 'dark' },
    });
    vi.stubGlobal('chrome', { storage: { local: { get, set: vi.fn() } } });

    await expect(loadPreferences()).resolves.toEqual({
      tabTitleFontSize: 18,
      theme: 'dark',
      density: DEFAULT_DENSITY,
      syncEnabled: false,
      closeAllRestoreSeconds: 5,
      closeAllHoldToConfirm: true,
      enableVideoPreview: false,
    });
    expect(get).toHaveBeenCalledWith(PREFERENCES_KEY);
  });

  it('returns defaults when nothing is stored', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
    });

    await expect(loadPreferences()).resolves.toEqual(DEFAULT_PREFERENCES);
  });

  it('persists a normalized copy under the preferences key', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(), set } },
    });

    await savePreferences({
      tabTitleFontSize: 4,
      theme: 'light',
      density: 'compact',
      syncEnabled: true,
      closeAllRestoreSeconds: 8,
      closeAllHoldToConfirm: false,
      enableVideoPreview: true,
    });

    expect(set).toHaveBeenCalledWith({
      [PREFERENCES_KEY]: {
        tabTitleFontSize: MIN_TAB_TITLE_FONT_SIZE,
        theme: 'light',
        density: 'compact',
        syncEnabled: true,
        closeAllRestoreSeconds: 8,
        closeAllHoldToConfirm: false,
        enableVideoPreview: true,
      },
    });
  });
});
