(() => {
  interface LinkRoutingPolicy {
    isHomePin: boolean;
    homeUrl: string | null;
  }

  interface PolicyUpdatedMessage {
    action: 'LINK_ROUTING_POLICY_UPDATED';
    payload: LinkRoutingPolicy;
  }

  interface OpenExternalLinkResponse {
    opened: boolean;
  }

  interface CopyTextToClipboardMessage {
    action: 'COPY_TEXT_TO_CLIPBOARD';
    payload: {
      text: string;
    };
  }

  interface CopyTextToClipboardResponse {
    copied: boolean;
    error?: string;
  }

  const emptyPolicy: LinkRoutingPolicy = {
    isHomePin: false,
    homeUrl: null,
  };

  let policy: LinkRoutingPolicy | null = null;
  let pendingPolicyRefresh: Promise<void> | null = null;
  let contextInvalidated = false;

  // After the extension is reloaded/updated, this already-injected content
  // script is orphaned: chrome.runtime.id becomes undefined and any
  // sendMessage call throws "Extension context invalidated". Detect that and
  // stop reaching for the runtime.
  function extensionContextValid(): boolean {
    if (contextInvalidated) return false;

    let valid = false;
    try {
      valid = Boolean(chrome.runtime?.id);
    } catch {
      valid = false;
    }

    if (!valid) {
      contextInvalidated = true;
      teardown();
    }

    return valid;
  }

  function normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^www\./, '');
  }

  function isSupportedWebUrl(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  function isSameSiteAsHomeUrl(targetUrl: string, homeUrl: string): boolean {
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

  function isPolicy(value: unknown): value is LinkRoutingPolicy {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<LinkRoutingPolicy>;
    return (
      typeof candidate.isHomePin === 'boolean' &&
      (candidate.homeUrl === null || typeof candidate.homeUrl === 'string')
    );
  }

  function isPolicyUpdatedMessage(
    message: unknown,
  ): message is PolicyUpdatedMessage {
    if (!message || typeof message !== 'object') return false;

    const candidate = message as Partial<PolicyUpdatedMessage>;
    return (
      candidate.action === 'LINK_ROUTING_POLICY_UPDATED' &&
      isPolicy(candidate.payload)
    );
  }

  function isCopyTextToClipboardMessage(
    message: unknown,
  ): message is CopyTextToClipboardMessage {
    if (!message || typeof message !== 'object') return false;

    const candidate = message as Partial<CopyTextToClipboardMessage>;
    return (
      candidate.action === 'COPY_TEXT_TO_CLIPBOARD' &&
      !!candidate.payload &&
      typeof candidate.payload.text === 'string'
    );
  }

  function fallbackCopyText(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';

    document.body.append(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }

  async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Content scripts can still sometimes copy through execCommand when
        // navigator.clipboard rejects the write.
      }
    }

    if (!fallbackCopyText(text)) {
      throw new Error('Clipboard write failed');
    }
  }

  function refreshPolicy(): Promise<void> {
    if (!extensionContextValid()) {
      policy = emptyPolicy;
      return Promise.resolve();
    }

    pendingPolicyRefresh ??= requestPolicy();
    return pendingPolicyRefresh;
  }

  async function requestPolicy(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GET_LINK_ROUTING_POLICY',
        payload: {},
      });
      policy = isPolicy(response) ? response : emptyPolicy;
    } catch {
      // The extension was likely reloaded/updated; fall back to a no-op policy
      // and re-check so listeners get torn down if the context is gone.
      policy = emptyPolicy;
      extensionContextValid();
    } finally {
      pendingPolicyRefresh = null;
    }
  }

  function getAnchor(target: EventTarget | null): HTMLAnchorElement | null {
    if (!(target instanceof Element)) return null;

    const anchor = target.closest('a[href]');
    return anchor instanceof HTMLAnchorElement ? anchor : null;
  }

  function getWebUrl(anchor: HTMLAnchorElement): string | null {
    if (anchor.download) return null;

    try {
      const url = new URL(anchor.href);
      return isSupportedWebUrl(url) ? url.href : null;
    } catch {
      return null;
    }
  }

  function isPlainPrimaryClick(event: MouseEvent): boolean {
    return (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    );
  }

  function shouldStayInPinnedTab(
    anchor: HTMLAnchorElement,
    targetUrl: string,
    homeUrl: string,
  ): boolean {
    return (
      isSameSiteAsHomeUrl(targetUrl, homeUrl) &&
      !!anchor.target &&
      anchor.target.toLowerCase() !== '_self'
    );
  }

  function openInCurrentTab(url: string): void {
    window.location.assign(url);
  }

  async function openExternalLink(url: string): Promise<void> {
    if (!extensionContextValid()) {
      openInCurrentTab(url);
      return;
    }

    try {
      const response = (await chrome.runtime.sendMessage({
        action: 'OPEN_EXTERNAL_LINK_FROM_HOME_PIN',
        payload: { url },
      })) as OpenExternalLinkResponse | undefined;

      if (!response?.opened) {
        openInCurrentTab(url);
      }
    } catch {
      openInCurrentTab(url);
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (!getAnchor(event.target)) return;

    void refreshPolicy();
  }

  function handlePageShow(): void {
    void refreshPolicy();
  }

  function handleFocus(): void {
    void refreshPolicy();
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      void refreshPolicy();
    }
  }

  function teardown(): void {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('click', handleClick, true);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  function handleClick(event: MouseEvent): void {
    if (!isPlainPrimaryClick(event)) return;

    const anchor = getAnchor(event.target);
    if (!anchor) return;

    const targetUrl = getWebUrl(anchor);
    if (!targetUrl) return;

    void refreshPolicy();

    if (!policy?.isHomePin || !policy.homeUrl) return;

    if (shouldStayInPinnedTab(anchor, targetUrl, policy.homeUrl)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openInCurrentTab(targetUrl);
      return;
    }

    if (isSameSiteAsHomeUrl(targetUrl, policy.homeUrl)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    void openExternalLink(targetUrl);
  }

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isPolicyUpdatedMessage(message)) {
      policy = message.payload;
      return false;
    }

    if (isCopyTextToClipboardMessage(message)) {
      copyText(message.payload.text)
        .then(() => {
          const response: CopyTextToClipboardResponse = { copied: true };
          sendResponse(response);
        })
        .catch((error: unknown) => {
          const response: CopyTextToClipboardResponse = {
            copied: false,
            error:
              error instanceof Error ? error.message : 'Clipboard write failed',
          };
          sendResponse(response);
        });

      return true;
    }

    return false;
  });

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('click', handleClick, true);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  void refreshPolicy();
})();
