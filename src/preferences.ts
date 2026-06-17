export const PREFERENCES_KEY = 'fantab_preferences';

export const MIN_TAB_TITLE_FONT_SIZE = 12;
export const MAX_TAB_TITLE_FONT_SIZE = 20;
export const DEFAULT_TAB_TITLE_FONT_SIZE = 15;

export type ThemePreference = 'system' | 'light' | 'dark';
export type DensityPreference = 'comfortable' | 'compact';

export const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];
export const DENSITY_OPTIONS: DensityPreference[] = ['comfortable', 'compact'];

export const DEFAULT_THEME: ThemePreference = 'system';
export const DEFAULT_DENSITY: DensityPreference = 'comfortable';

export interface Preferences {
  /** Font size, in pixels, used for tab titles in the side panel list. */
  tabTitleFontSize: number;
  /** Color theme override; 'system' follows the OS preference. */
  theme: ThemePreference;
  /** Vertical spacing of tab rows in the list. */
  density: DensityPreference;
}

export const DEFAULT_PREFERENCES: Preferences = {
  tabTitleFontSize: DEFAULT_TAB_TITLE_FONT_SIZE,
  theme: DEFAULT_THEME,
  density: DEFAULT_DENSITY,
};

export function clampTabTitleFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TAB_TITLE_FONT_SIZE;
  }

  const bounded = Math.min(
    MAX_TAB_TITLE_FONT_SIZE,
    Math.max(MIN_TAB_TITLE_FONT_SIZE, value),
  );
  return Math.round(bounded);
}

export function normalizeTheme(value: unknown): ThemePreference {
  return THEME_OPTIONS.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : DEFAULT_THEME;
}

export function normalizeDensity(value: unknown): DensityPreference {
  return DENSITY_OPTIONS.includes(value as DensityPreference)
    ? (value as DensityPreference)
    : DEFAULT_DENSITY;
}

export function normalizePreferences(value: unknown): Preferences {
  const candidate = (value ?? {}) as Partial<Preferences>;
  return {
    tabTitleFontSize: clampTabTitleFontSize(candidate.tabTitleFontSize),
    theme: normalizeTheme(candidate.theme),
    density: normalizeDensity(candidate.density),
  };
}

export async function loadPreferences(): Promise<Preferences> {
  const result = await chrome.storage.local.get(PREFERENCES_KEY);
  return normalizePreferences(result[PREFERENCES_KEY]);
}

export async function savePreferences(
  preferences: Preferences,
): Promise<void> {
  await chrome.storage.local.set({
    [PREFERENCES_KEY]: normalizePreferences(preferences),
  });
}
