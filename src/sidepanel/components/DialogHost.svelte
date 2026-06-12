<script lang="ts">
  import {
    cancelDialog,
    dialogRequest,
    submitConfirm,
    submitPrompt,
  } from '../dialog';

  let inputEl: HTMLInputElement | undefined = $state();
  let confirmBtn: HTMLButtonElement | undefined = $state();
  let draft = $state('');

  // Seed the input and move focus whenever a new dialog opens.
  $effect(() => {
    const request = $dialogRequest;
    if (!request) return;

    if (request.kind === 'prompt') {
      draft = request.value;
      requestAnimationFrame(() => {
        inputEl?.focus();
        inputEl?.select();
      });
    } else {
      requestAnimationFrame(() => confirmBtn?.focus());
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    if (!$dialogRequest) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancelDialog();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $dialogRequest}
  {@const request = $dialogRequest}
  <div class="dialog-overlay" role="presentation" onpointerdown={cancelDialog}>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onpointerdown={(event) => event.stopPropagation()}
    >
      <h2 class="dialog-title">{request.title}</h2>

      {#if request.kind === 'prompt'}
        {#if request.label}
          <label class="dialog-label" for="dialog-input">{request.label}</label>
        {/if}
        <input
          id="dialog-input"
          bind:this={inputEl}
          class="dialog-input"
          bind:value={draft}
          placeholder={request.placeholder}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitPrompt(draft);
            }
          }}
        />
      {:else}
        <p class="dialog-message">{request.message}</p>
      {/if}

      <div class="dialog-actions">
        <button class="dialog-btn" onclick={cancelDialog}>Cancel</button>
        {#if request.kind === 'prompt'}
          <button class="dialog-btn primary" onclick={() => submitPrompt(draft)}>
            {request.confirmLabel}
          </button>
        {:else}
          <button
            bind:this={confirmBtn}
            class="dialog-btn"
            class:primary={!request.danger}
            class:danger={request.danger}
            onclick={() => submitConfirm(true)}
          >
            {request.confirmLabel}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.4);
  }

  .dialog {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 320px;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    box-shadow: var(--shadow-md);
  }

  .dialog-title {
    font-size: 14px;
    font-weight: 650;
    color: var(--text-primary);
  }

  .dialog-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .dialog-message {
    font-size: 13px;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .dialog-input {
    width: 100%;
    height: 32px;
    padding: 0 9px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
  }

  .dialog-input:focus {
    border-color: var(--accent-color);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .dialog-btn {
    height: 30px;
    padding: 0 14px;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-weight: 600;
  }

  .dialog-btn:hover {
    background: var(--bg-hover);
  }

  .dialog-btn.primary {
    background: var(--active-bg);
    color: var(--accent-color);
  }

  .dialog-btn.danger {
    background: var(--danger-bg);
    color: var(--danger-text);
  }
</style>
