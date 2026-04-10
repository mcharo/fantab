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
