interface CopyToClipboardMessage {
  action: 'COPY_TO_CLIPBOARD';
  target: 'offscreen';
  payload: {
    text: string;
  };
}

interface CopyToClipboardResponse {
  copied: boolean;
  error?: string;
}

function isCopyToClipboardMessage(
  message: unknown,
): message is CopyToClipboardMessage {
  if (!message || typeof message !== 'object') return false;

  const candidate = message as Partial<CopyToClipboardMessage>;
  return (
    candidate.action === 'COPY_TO_CLIPBOARD' &&
    candidate.target === 'offscreen' &&
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
      // Fall through to the textarea route for Chrome contexts that expose
      // navigator.clipboard but still reject this particular write.
    }
  }

  if (!fallbackCopyText(text)) {
    throw new Error('Clipboard write failed');
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isCopyToClipboardMessage(message)) return false;

  copyText(message.payload.text)
    .then(() => {
      const response: CopyToClipboardResponse = { copied: true };
      sendResponse(response);
    })
    .catch((error: unknown) => {
      const response: CopyToClipboardResponse = {
        copied: false,
        error: error instanceof Error ? error.message : 'Clipboard write failed',
      };
      sendResponse(response);
    });

  return true;
});
