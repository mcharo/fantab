export function isAtHome(currentUrl: string | null, homeUrl: string): boolean {
  if (!currentUrl) return false;
  try {
    const current = new URL(currentUrl);
    const home = new URL(homeUrl);
    return current.origin === home.origin && current.pathname === home.pathname;
  } catch {
    return false;
  }
}

// Common multi-label public suffixes. Not the full Public Suffix List — just
// enough that, e.g., "bbc.co.uk" and "gov.co.uk" resolve to distinct base
// domains rather than both collapsing to "co.uk".
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'net.uk', 'sch.uk', 'ltd.uk',
  'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr',
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in',
  'co.za', 'org.za',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'com.mx', 'com.sg', 'com.hk', 'com.tw', 'com.tr', 'com.ar', 'com.pl',
  'co.id', 'co.il', 'co.th',
]);

function isSupportedWebUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Whether a string is a safe http(s) URL — used to vet URLs arriving from
 * dropped drag payloads (which may originate from arbitrary pages) before
 * opening them, so schemes like `javascript:` or `data:` are never launched.
 */
export function isHttpUrl(value: string): boolean {
  try {
    return isSupportedWebUrl(new URL(value));
  } catch {
    return false;
  }
}

/**
 * The registrable ("base") domain of a hostname — the part a user would
 * recognize as "the site" (e.g. `play.hbomax.com` -> `hbomax.com`,
 * `news.bbc.co.uk` -> `bbc.co.uk`). Uses a small public-suffix list to handle
 * common multi-label TLDs; everything else falls back to the last two labels.
 */
export function getRegistrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (labels.length <= 2) return host;

  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * Whether `targetUrl` belongs to the same site as `homeUrl`, compared by
 * registrable (base) domain. This deliberately treats sibling/parent
 * subdomains as the same site (e.g. a home pin on `play.hbomax.com` stays
 * "home" when the site redirects to `www.hbomax.com`), so cross-subdomain
 * redirects don't spill into new tabs.
 */
export function isSameSiteAsHomeUrl(targetUrl: string, homeUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const home = new URL(homeUrl);

    if (!isSupportedWebUrl(target) || !isSupportedWebUrl(home)) {
      return false;
    }

    const targetDomain = getRegistrableDomain(target.hostname);
    const homeDomain = getRegistrableDomain(home.hostname);

    return targetDomain !== '' && targetDomain === homeDomain;
  } catch {
    return false;
  }
}

export function normalizeHomeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Assume https:// when the user omits a scheme (e.g. "example.com").
  const candidate = /:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(candidate).href;
  } catch {
    return null;
  }
}

export function computeTitle(
  alias: string,
  pageTitle: string | null,
  atHome: boolean,
): string {
  if (atHome || !pageTitle) return alias;
  return `${alias} - ${pageTitle}`;
}

export function buildFaviconUrl(extensionId: string, pageUrl: string): string {
  return `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
}

export function getFaviconUrl(pageUrl: string): string {
  return buildFaviconUrl(chrome.runtime.id, pageUrl);
}
