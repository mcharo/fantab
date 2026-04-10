<script lang="ts">
  interface Props {
    value: string;
    onSave: (value: string) => void;
    className?: string;
  }

  let { value, onSave, className = '' }: Props = $props();

  let editing = $state(false);
  let editValue = $state('');
  let inputEl: HTMLInputElement | undefined = $state(undefined);

  $effect(() => {
    if (!editing) editValue = value;
  });

  function startEditing() {
    editValue = value;
    editing = true;
    requestAnimationFrame(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function save() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    editing = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') editing = false;
  }
</script>

{#if editing}
  <input
    bind:this={inputEl}
    bind:value={editValue}
    onblur={save}
    onkeydown={handleKeydown}
    class="inline-input {className}"
  />
{:else}
  <span
    class="inline-text {className}"
    ondblclick={startEditing}
    title="Double-click to edit"
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && startEditing()}
  >
    {value}
  </span>
{/if}

<style>
  .inline-input {
    background: var(--bg-secondary);
    border: 1px solid var(--accent-color);
    border-radius: var(--radius-sm);
    padding: 1px 4px;
    outline: none;
    width: 100%;
    min-width: 0;
  }

  .inline-text {
    cursor: text;
    border-radius: var(--radius-sm);
    padding: 1px 4px;
    transition: background 0.15s;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inline-text:hover {
    background: var(--bg-hover);
  }
</style>
