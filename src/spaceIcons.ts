import { DEFAULT_SPACE_ICON, type SpaceIcon, type SpaceIconId } from './types';

export interface SpaceIconOption {
  id: SpaceIconId;
  label: string;
}

export const SPACE_ICONS: SpaceIconOption[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'spark', label: 'Spark' },
  { id: 'briefcase', label: 'Work' },
  { id: 'book', label: 'Book' },
  { id: 'code', label: 'Code' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'moon', label: 'Moon' },
  { id: 'sun', label: 'Sun' },
  { id: 'heart', label: 'Heart' },
  { id: 'grid', label: 'Grid' },
  { id: 'compass', label: 'Compass' },
];

/** Curated emoji palette offered alongside the built-in icons. */
export const SPACE_EMOJIS: string[] = [
  '😀', '😎', '🤖', '👾', '🦊', '🐱', '🐶', '🦉',
  '🌟', '🔥', '⚡', '🌈', '🌙', '☀️', '🌊', '🍀',
  '🌸', '🌵', '🍎', '🍕', '☕', '🍩', '🎮', '🎧',
  '🎨', '🎬', '📚', '📝', '💡', '💼', '🚀', '✈️',
  '🏠', '🏔️', '⚽', '🎯', '❤️', '⭐', '🔑', '🧪',
];

const SPACE_ICON_IDS = new Set<string>(SPACE_ICONS.map((icon) => icon.id));

export function isSpaceIconId(icon: string): icon is SpaceIconId {
  return SPACE_ICON_IDS.has(icon);
}

function isEmojiIcon(value: string): boolean {
  // A single emoji (incl. ZWJ / modifier sequences): short, and containing at
  // least one pictographic code point so it can't be mistaken for an icon id.
  if (!value || [...value].length > 8) return false;
  return /\p{Extended_Pictographic}/u.test(value);
}

export function normalizeSpaceIcon(icon: unknown): SpaceIcon {
  if (typeof icon !== 'string') return DEFAULT_SPACE_ICON;

  const trimmed = icon.trim();
  if (isSpaceIconId(trimmed)) return trimmed;
  if (isEmojiIcon(trimmed)) return trimmed;
  return DEFAULT_SPACE_ICON;
}

export function iconForSpaceIndex(index: number): SpaceIconId {
  return SPACE_ICONS[index % SPACE_ICONS.length].id;
}
