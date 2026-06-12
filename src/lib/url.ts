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

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function isSupportedWebUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

export function isSameSiteAsHomeUrl(targetUrl: string, homeUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const home = new URL(homeUrl);

    if (!isSupportedWebUrl(target) || !isSupportedWebUrl(home)) {
      return false;
    }

    const targetHost = normalizeHostname(target.hostname);
    const homeHost = normalizeHostname(home.hostname);

    return targetHost === homeHost || targetHost.endsWith(`.${homeHost}`);
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
