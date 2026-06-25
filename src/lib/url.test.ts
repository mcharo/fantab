import { describe, it, expect } from 'vitest';
import {
  isAtHome,
  computeTitle,
  buildFaviconUrl,
  isSameSiteAsHomeUrl,
  normalizeHomeUrl,
} from './url';

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
  it('returns just alias when at home', () => {
    expect(computeTitle('My Tab', 'Some Page', true)).toBe('My Tab');
  });

  it('returns alias - pageTitle when navigated away', () => {
    expect(computeTitle('My Tab', 'Some Page', false)).toBe('My Tab - Some Page');
  });

  it('returns just alias when pageTitle is null', () => {
    expect(computeTitle('My Tab', null, false)).toBe('My Tab');
  });
});

describe('isSameSiteAsHomeUrl', () => {
  it('returns true for the same host', () => {
    expect(
      isSameSiteAsHomeUrl('https://cnbc.com/markets', 'https://cnbc.com/'),
    ).toBe(true);
  });

  it('normalizes leading www prefixes', () => {
    expect(
      isSameSiteAsHomeUrl('https://www.cnbc.com/markets', 'https://cnbc.com/'),
    ).toBe(true);
    expect(
      isSameSiteAsHomeUrl('https://cnbc.com/markets', 'https://www.cnbc.com/'),
    ).toBe(true);
  });

  it('returns true for subdomains of the home host', () => {
    expect(
      isSameSiteAsHomeUrl(
        'https://watch.cnbc.com/live',
        'https://cnbc.com/',
      ),
    ).toBe(true);
  });

  it('matches a parent domain when the home pin is on a subdomain', () => {
    // A home pin on play.hbomax.com that redirects to www.hbomax.com (or the
    // bare apex) should still be considered the same site.
    expect(
      isSameSiteAsHomeUrl('https://www.hbomax.com/', 'https://play.hbomax.com/'),
    ).toBe(true);
    expect(
      isSameSiteAsHomeUrl('https://hbomax.com/', 'https://play.hbomax.com/'),
    ).toBe(true);
  });

  it('matches sibling subdomains of the same base domain', () => {
    expect(
      isSameSiteAsHomeUrl(
        'https://auth.hbomax.com/login',
        'https://play.hbomax.com/',
      ),
    ).toBe(true);
  });

  it('returns false for lookalike host suffixes', () => {
    expect(
      isSameSiteAsHomeUrl(
        'https://cnbc.com.evil.test/article',
        'https://cnbc.com/',
      ),
    ).toBe(false);
  });

  it('keeps distinct sites under a multi-label public suffix separate', () => {
    expect(
      isSameSiteAsHomeUrl('https://gov.co.uk/', 'https://bbc.co.uk/'),
    ).toBe(false);
    expect(
      isSameSiteAsHomeUrl('https://news.bbc.co.uk/', 'https://bbc.co.uk/'),
    ).toBe(true);
  });

  it('returns false for unsupported schemes and invalid URLs', () => {
    expect(isSameSiteAsHomeUrl('mailto:test@example.com', 'https://cnbc.com/')).toBe(false);
    expect(isSameSiteAsHomeUrl('not-a-url', 'https://cnbc.com/')).toBe(false);
  });
});

describe('normalizeHomeUrl', () => {
  it('keeps a full https url', () => {
    expect(normalizeHomeUrl('https://example.com/path')).toBe(
      'https://example.com/path',
    );
  });

  it('prepends https:// when the scheme is omitted', () => {
    expect(normalizeHomeUrl('example.com')).toBe('https://example.com/');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeHomeUrl('  https://example.com  ')).toBe(
      'https://example.com/',
    );
  });

  it('preserves non-web schemes that include ://', () => {
    expect(normalizeHomeUrl('chrome://settings')).toBe('chrome://settings');
  });

  it('returns null for blank input', () => {
    expect(normalizeHomeUrl('   ')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(normalizeHomeUrl('http://')).toBeNull();
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
