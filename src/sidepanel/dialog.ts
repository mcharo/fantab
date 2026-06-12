import { get, writable } from 'svelte/store';

export interface PromptOptions {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export type DialogRequest =
  | {
      kind: 'prompt';
      title: string;
      label: string;
      value: string;
      placeholder: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      danger: boolean;
      resolve: (value: boolean) => void;
    };

export const dialogRequest = writable<DialogRequest | null>(null);

function cancelCurrent(): void {
  const current = get(dialogRequest);
  if (!current) return;

  if (current.kind === 'prompt') current.resolve(null);
  else current.resolve(false);
}

/** Ask for a line of text. Resolves with the entered value, or null if cancelled. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    cancelCurrent();
    dialogRequest.set({
      kind: 'prompt',
      title: options.title,
      label: options.label ?? '',
      value: options.value ?? '',
      placeholder: options.placeholder ?? '',
      confirmLabel: options.confirmLabel ?? 'OK',
      resolve,
    });
  });
}

/** Ask for confirmation. Resolves true if confirmed, false otherwise. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    cancelCurrent();
    dialogRequest.set({
      kind: 'confirm',
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'OK',
      danger: options.danger ?? false,
      resolve,
    });
  });
}

export function submitPrompt(value: string): void {
  const current = get(dialogRequest);
  if (current?.kind !== 'prompt') return;

  current.resolve(value);
  dialogRequest.set(null);
}

export function submitConfirm(result: boolean): void {
  const current = get(dialogRequest);
  if (current?.kind !== 'confirm') return;

  current.resolve(result);
  dialogRequest.set(null);
}

export function cancelDialog(): void {
  cancelCurrent();
  dialogRequest.set(null);
}
