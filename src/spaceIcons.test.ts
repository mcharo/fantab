import { describe, expect, it } from 'vitest';
import { isSpaceIconId, normalizeSpaceIcon } from './spaceIcons';
import { DEFAULT_SPACE_ICON } from './types';

describe('isSpaceIconId', () => {
  it('recognizes built-in icon ids', () => {
    expect(isSpaceIconId('circle')).toBe(true);
    expect(isSpaceIconId('compass')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isSpaceIconId('🦊')).toBe(false);
    expect(isSpaceIconId('nope')).toBe(false);
    expect(isSpaceIconId('')).toBe(false);
  });
});

describe('normalizeSpaceIcon', () => {
  it('keeps built-in icon ids', () => {
    expect(normalizeSpaceIcon('book')).toBe('book');
  });

  it('keeps emoji (incl. ZWJ / variation-selector sequences)', () => {
    expect(normalizeSpaceIcon('🦊')).toBe('🦊');
    expect(normalizeSpaceIcon('☀️')).toBe('☀️');
    expect(normalizeSpaceIcon('🚀')).toBe('🚀');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSpaceIcon('  🍀 ')).toBe('🍀');
    expect(normalizeSpaceIcon(' circle ')).toBe('circle');
  });

  it('falls back to the default for non-emoji junk strings', () => {
    expect(normalizeSpaceIcon('hello')).toBe(DEFAULT_SPACE_ICON);
    expect(normalizeSpaceIcon('123')).toBe(DEFAULT_SPACE_ICON);
  });

  it('rejects over-long strings that merely contain an emoji', () => {
    expect(normalizeSpaceIcon('🦊 my favorite space name')).toBe(
      DEFAULT_SPACE_ICON,
    );
  });

  it('falls back to the default for non-string input', () => {
    expect(normalizeSpaceIcon(undefined)).toBe(DEFAULT_SPACE_ICON);
    expect(normalizeSpaceIcon(42)).toBe(DEFAULT_SPACE_ICON);
    expect(normalizeSpaceIcon(null)).toBe(DEFAULT_SPACE_ICON);
  });
});
