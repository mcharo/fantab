<script lang="ts">
  interface Props {
    onPinTab: () => void;
    isActiveTabPinned: boolean;
  }

  let { onPinTab, isActiveTabPinned }: Props = $props();
</script>

<header class="header">
  <h1 class="title">FantTab</h1>
  <button
    class="pin-btn"
    onclick={onPinTab}
    disabled={isActiveTabPinned}
    title={isActiveTabPinned
      ? 'This tab is already pinned'
      : 'Pin the current tab'}
  >
    {isActiveTabPinned ? 'Pinned' : '+ Pin this tab'}
  </button>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
  }

  .pin-btn {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    background: var(--accent-color);
    color: #fff;
    font-weight: 500;
    font-size: 12px;
    transition: background 0.15s;
  }

  .pin-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .pin-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
