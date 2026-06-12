<script lang="ts">
  import {
    SPACE_ICONS,
    iconForSpaceIndex,
    normalizeSpaceIcon,
  } from '../../spaceIcons';
  import type { SpaceIconId, SpaceSummary } from '../../types';
  import { confirmDialog, promptDialog } from '../dialog';
  import Icon from './Icon.svelte';

  interface Props {
    spaces: SpaceSummary[];
    activeSpaceId: string;
    onSwitchSpace: (spaceId: string) => void;
    onCreateSpace: (name: string, icon: SpaceIconId) => void;
    onUpdateSpace: (
      spaceId: string,
      updates: { name?: string; icon?: SpaceIconId },
    ) => void;
    onDeleteSpace: (spaceId: string) => void;
  }

  let {
    spaces,
    activeSpaceId,
    onSwitchSpace,
    onCreateSpace,
    onUpdateSpace,
    onDeleteSpace,
  }: Props = $props();

  let editingSpaceId = $state<string | null>(null);
  let draftName = $state('');
  let draftIcon = $state<SpaceIconId>('circle');

  const editingSpace = $derived(
    spaces.find((space) => space.id === editingSpaceId),
  );

  function openEditor(space: SpaceSummary, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    editingSpaceId = space.id;
    draftName = space.name;
    draftIcon = space.icon;
  }

  function closeEditor() {
    editingSpaceId = null;
  }

  function saveEditor() {
    if (!editingSpaceId) return;

    onUpdateSpace(editingSpaceId, {
      name: draftName,
      icon: draftIcon,
    });
    closeEditor();
  }

  async function createSpace() {
    const result = await promptDialog({
      title: 'New space',
      label: 'Space name',
      value: `Space ${spaces.length + 1}`,
      confirmLabel: 'Create',
    });
    if (result === null) return;

    const name = result.trim();
    if (!name) return;

    onCreateSpace(name, iconForSpaceIndex(spaces.length));
  }

  async function deleteSpace() {
    if (!editingSpace || spaces.length <= 1) return;

    const confirmed = await confirmDialog({
      title: 'Delete space',
      message: `Delete "${editingSpace.name}"? Pins in this space will be removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    onDeleteSpace(editingSpace.id);
    closeEditor();
  }
</script>

<footer class="space-dock-shell" aria-label="Spaces">
  {#if editingSpace}
    <div class="space-popover">
      <div class="editor-row">
        <input
          class="space-name-input"
          value={draftName}
          placeholder="Space name"
          oninput={(event) =>
            (draftName = (event.target as HTMLInputElement).value)}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              saveEditor();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              closeEditor();
            }
          }}
        />
        <button class="editor-btn primary" onclick={saveEditor}>Save</button>
      </div>

      <div class="icon-grid" aria-label="Space icons">
        {#each SPACE_ICONS as icon (icon.id)}
          <button
            class="icon-choice"
            class:selected={draftIcon === icon.id}
            onclick={() => (draftIcon = icon.id)}
            title={icon.label}
            aria-label={icon.label}
          >
            <Icon name={icon.id} size={18} />
          </button>
        {/each}
      </div>

      <div class="editor-actions">
        <button class="editor-btn" onclick={closeEditor}>Cancel</button>
        <button
          class="editor-btn danger"
          onclick={deleteSpace}
          disabled={spaces.length <= 1}
        >
          Delete
        </button>
      </div>
    </div>
  {/if}

  <div class="space-dock">
    {#each spaces as space (space.id)}
      <button
        class="space-btn"
        class:active={space.id === activeSpaceId}
        onclick={() => onSwitchSpace(space.id)}
        ondblclick={(event) => openEditor(space, event)}
        oncontextmenu={(event) => openEditor(space, event)}
        title={`${space.name} - double-click or right-click to edit`}
        aria-label={space.name}
      >
        <Icon name={normalizeSpaceIcon(space.icon)} size={18} />
      </button>
    {/each}

    <button class="add-space-btn" onclick={createSpace} title="New space">
      <Icon name="plus" size={18} />
    </button>
  </div>
</footer>

<style>
  .space-dock-shell {
    position: relative;
    flex-shrink: 0;
    padding: 8px 10px 10px;
    border-top: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  }

  .space-dock {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 42px;
  }

  .space-btn,
  .add-space-btn,
  .icon-choice {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
  }

  .space-btn {
    width: 34px;
    height: 34px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    transition:
      background 0.15s,
      color 0.15s,
      transform 0.15s;
  }

  .space-btn:hover {
    color: var(--text-primary);
    transform: translateY(-1px);
  }

  .space-btn.active {
    background: var(--active-bg);
    color: var(--accent-color);
  }

  .add-space-btn {
    width: 0;
    height: 34px;
    margin-left: -8px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    background: var(--bg-secondary);
    color: var(--text-primary);
    transition:
      width 0.15s,
      margin 0.15s,
      opacity 0.15s,
      background 0.15s;
  }

  .space-dock-shell:hover .add-space-btn,
  .space-dock-shell:focus-within .add-space-btn {
    width: 34px;
    margin-left: 0;
    opacity: 1;
    pointer-events: auto;
  }

  .add-space-btn:hover {
    background: var(--bg-hover);
  }

  .space-popover {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: calc(100% + 6px);
    z-index: 4;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    box-shadow: var(--shadow-md);
  }

  .editor-row,
  .editor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .space-name-input {
    min-width: 0;
    flex: 1;
    height: 30px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    outline: none;
    padding: 0 8px;
  }

  .space-name-input:focus {
    border-color: var(--accent-color);
  }

  .editor-btn {
    height: 30px;
    padding: 0 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-weight: 650;
  }

  .editor-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .editor-btn.primary {
    background: var(--active-bg);
    color: var(--accent-color);
  }

  .editor-btn.danger {
    margin-left: auto;
    color: var(--danger-text);
  }

  .editor-btn:disabled {
    cursor: default;
    opacity: 0.35;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
  }

  .icon-choice {
    aspect-ratio: 1;
    min-width: 0;
    background: var(--bg-secondary);
    color: var(--text-secondary);
  }

  .icon-choice:hover,
  .icon-choice.selected {
    background: var(--active-bg);
    color: var(--accent-color);
  }
</style>
