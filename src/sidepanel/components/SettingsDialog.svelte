<script lang="ts">
  import {
    DENSITY_OPTIONS,
    MAX_CLOSE_ALL_RESTORE_SECONDS,
    MAX_TAB_TITLE_FONT_SIZE,
    MIN_CLOSE_ALL_RESTORE_SECONDS,
    MIN_TAB_TITLE_FONT_SIZE,
    THEME_OPTIONS,
    type DensityPreference,
    type ThemePreference,
  } from '../../preferences';
  import Icon from './Icon.svelte';

  interface Props {
    busy?: boolean;
    statusMessage?: string | null;
    errorMessage?: string | null;
    tabTitleFontSize: number;
    theme: ThemePreference;
    density: DensityPreference;
    syncEnabled: boolean;
    closeAllRestoreSeconds: number;
    closeAllHoldToConfirm: boolean;
    onClose: () => void;
    onExport: () => void;
    onImport: (file: File) => void;
    onReset: () => void;
    onTabTitleFontSizeChange: (size: number) => void;
    onThemeChange: (theme: ThemePreference) => void;
    onDensityChange: (density: DensityPreference) => void;
    onSyncEnabledChange: (enabled: boolean) => void;
    onCloseAllRestoreSecondsChange: (seconds: number) => void;
    onCloseAllHoldToConfirmChange: (hold: boolean) => void;
    onEditShortcuts: () => void;
  }

  let {
    busy = false,
    statusMessage = null,
    errorMessage = null,
    tabTitleFontSize,
    theme,
    density,
    syncEnabled,
    closeAllRestoreSeconds,
    closeAllHoldToConfirm,
    onClose,
    onExport,
    onImport,
    onReset,
    onTabTitleFontSizeChange,
    onThemeChange,
    onDensityChange,
    onSyncEnabledChange,
    onCloseAllRestoreSecondsChange,
    onCloseAllHoldToConfirmChange,
    onEditShortcuts,
  }: Props = $props();

  const THEME_LABELS: Record<ThemePreference, string> = {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  };

  const DENSITY_LABELS: Record<DensityPreference, string> = {
    comfortable: 'Comfortable',
    compact: 'Compact',
  };

  let fileInput: HTMLInputElement | undefined = $state();

  function chooseImportFile() {
    fileInput?.click();
  }

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) onImport(file);
  }

  function handleFontSizeInput(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value)) onTabTitleFontSizeChange(value);
  }

  function handleRestoreSecondsInput(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value)) onCloseAllRestoreSecondsChange(value);
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }}
/>

<div
  class="settings-panel"
  role="dialog"
  aria-modal="true"
  aria-label="Settings"
>
  <header class="settings-header">
    <h2>Settings</h2>
    <button class="icon-btn" onclick={onClose} title="Close settings">
      <Icon name="x" size={17} />
    </button>
  </header>

  <div class="settings-body">
    <section class="group">
      <div class="group-head">
        <h3>Appearance</h3>
        <p class="group-desc">How the tab list looks.</p>
      </div>

      <div class="field">
        <span class="field-label">Theme</span>
        <div class="segmented" role="group" aria-label="Theme">
          {#each THEME_OPTIONS as option (option)}
            <button
              class="segment"
              class:active={theme === option}
              aria-pressed={theme === option}
              onclick={() => onThemeChange(option)}
            >
              {THEME_LABELS[option]}
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span class="field-label">Density</span>
        <div class="segmented" role="group" aria-label="Density">
          {#each DENSITY_OPTIONS as option (option)}
            <button
              class="segment"
              class:active={density === option}
              aria-pressed={density === option}
              onclick={() => onDensityChange(option)}
            >
              {DENSITY_LABELS[option]}
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <div class="field-head">
          <label for="tab-title-size">Tab title size</label>
          <span class="field-value">{tabTitleFontSize}px</span>
        </div>
        <input
          id="tab-title-size"
          class="slider"
          type="range"
          min={MIN_TAB_TITLE_FONT_SIZE}
          max={MAX_TAB_TITLE_FONT_SIZE}
          step="1"
          value={tabTitleFontSize}
          oninput={handleFontSizeInput}
        />
        <div class="preview" aria-hidden="true">
          <span class="preview-favicon"></span>
          <span class="preview-title" style="font-size: {tabTitleFontSize}px;">
            Example tab title
          </span>
        </div>
      </div>
    </section>

    <section class="group">
      <div class="group-head">
        <h3>Tabs</h3>
        <p class="group-desc">Behavior when closing tabs.</p>
      </div>

      <label class="toggle-row">
        <span class="toggle-text">
          <span class="toggle-title">Hold “Close all” to confirm</span>
          <span class="toggle-hint">When off, a single click closes them.</span>
        </span>
        <input
          class="toggle"
          type="checkbox"
          role="switch"
          checked={closeAllHoldToConfirm}
          onchange={(event) =>
            onCloseAllHoldToConfirmChange(
              (event.currentTarget as HTMLInputElement).checked,
            )}
        />
      </label>

      <div class="field">
        <div class="field-head">
          <label for="close-all-restore">Close all · restore window</label>
          <span class="field-value">{closeAllRestoreSeconds}s</span>
        </div>
        <input
          id="close-all-restore"
          class="slider"
          type="range"
          min={MIN_CLOSE_ALL_RESTORE_SECONDS}
          max={MAX_CLOSE_ALL_RESTORE_SECONDS}
          step="1"
          value={closeAllRestoreSeconds}
          oninput={handleRestoreSecondsInput}
        />
        <p class="group-desc">
          How long “Close all” waits — with an option to restore — before the
          tabs actually close.
        </p>
      </div>
    </section>

    <section class="group">
      <div class="group-head">
        <h3>Shortcuts</h3>
        <p class="group-desc">
          Bind keys to switch spaces and copy the current URL. Chrome manages
          these on its shortcuts page.
        </p>
      </div>

      <div class="actions">
        <button class="btn" onclick={onEditShortcuts}>
          Edit keyboard shortcuts
        </button>
      </div>
    </section>

    <section class="group">
      <div class="group-head">
        <h3>Space data</h3>
        <p class="group-desc">
          Back up your spaces, home pins, and tabs, or restore them from a file.
        </p>
      </div>

      <div class="actions">
        <button class="btn" onclick={onExport} disabled={busy}>
          Export
        </button>
        <button class="btn primary" onclick={chooseImportFile} disabled={busy}>
          Import
        </button>
      </div>

      <div class="actions">
        <button class="btn danger" onclick={onReset} disabled={busy}>
          Reset to defaults
        </button>
      </div>

      {#if statusMessage}
        <p class="status">{statusMessage}</p>
      {/if}

      {#if errorMessage}
        <p class="status error">{errorMessage}</p>
      {/if}
    </section>

    <section class="group">
      <div class="group-head">
        <h3>Sync</h3>
        <p class="group-desc">
          Mirror your spaces, home pins, and appearance settings across your
          machines. Requires Chrome Sync to be enabled in your browser.
        </p>
      </div>

      <label class="toggle-row">
        <span class="toggle-text">
          <span class="toggle-title">Sync across devices</span>
          <span class="toggle-hint">Open tabs stay on each device.</span>
        </span>
        <input
          class="toggle"
          type="checkbox"
          role="switch"
          checked={syncEnabled}
          onchange={(event) =>
            onSyncEnabledChange(
              (event.currentTarget as HTMLInputElement).checked,
            )}
        />
      </label>
    </section>
  </div>

  <input
    bind:this={fileInput}
    class="file-input"
    type="file"
    accept="application/json,.json"
    onchange={handleFileChange}
  />
</div>

<style>
  .settings-panel {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-primary);
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color);
  }

  h2 {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 650;
  }

  .settings-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 16px 12px 24px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group-head {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  h3 {
    color: var(--text-primary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .group-desc {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.4;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
  }

  .field-label {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
  }

  .field-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .field-head label {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
  }

  .field-value {
    color: var(--text-secondary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .segmented {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
  }

  .segment {
    flex: 1;
    height: 28px;
    border-radius: calc(var(--radius-sm) - 1px);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  .segment:hover:not(.active) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .segment.active {
    background: var(--active-bg);
    color: var(--accent-color);
  }

  .slider {
    width: 100%;
    height: 18px;
    margin: 0;
    accent-color: var(--accent-color);
    cursor: pointer;
  }

  .preview {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--bg-primary);
  }

  .preview-favicon {
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--bg-hover);
  }

  .preview-title {
    color: var(--text-primary);
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    flex: 1;
    height: 32px;
    padding: 0 12px;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-weight: 600;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .btn.primary {
    background: var(--active-bg);
    color: var(--accent-color);
  }

  .btn.danger {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  .btn.danger:hover:not(:disabled) {
    background: var(--danger-bg);
    filter: brightness(0.96);
  }

  .btn:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .status {
    padding: 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .status.error {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  .file-input {
    display: none;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    cursor: pointer;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .toggle-title {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
  }

  .toggle-hint {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .toggle {
    flex: 0 0 auto;
    position: relative;
    width: 38px;
    height: 22px;
    border-radius: 999px;
    background: var(--bg-hover);
    cursor: pointer;
    transition: background 0.15s ease;
    appearance: none;
  }

  .toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--bg-primary);
    transition: transform 0.15s ease;
  }

  .toggle:checked {
    background: var(--accent-color);
  }

  .toggle:checked::after {
    transform: translateX(16px);
  }
</style>
