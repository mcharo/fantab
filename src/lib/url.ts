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

export function computeTitle(
  customName: string,
  pageTitle: string | null,
  atHome: boolean,
): string {
  if (atHome || !pageTitle) return customName;
  return `${customName} - ${pageTitle}`;
}

export function buildFaviconUrl(extensionId: string, pageUrl: string): string {
  return `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
}

export function getFaviconUrl(pageUrl: string): string {
  return buildFaviconUrl(chrome.runtime.id, pageUrl);
}
