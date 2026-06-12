import { DEFAULT_SPACE_ICON, type SpaceIconId } from './types';

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

const SPACE_ICON_IDS = new Set<string>(SPACE_ICONS.map((icon) => icon.id));

export function normalizeSpaceIcon(icon: unknown): SpaceIconId {
  return typeof icon === 'string' && SPACE_ICON_IDS.has(icon)
    ? (icon as SpaceIconId)
    : DEFAULT_SPACE_ICON;
}

export function iconForSpaceIndex(index: number): SpaceIconId {
  return SPACE_ICONS[index % SPACE_ICONS.length].id;
}
