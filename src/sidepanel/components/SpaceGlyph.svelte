<script lang="ts">
  import { isSpaceIconId } from '../../spaceIcons';
  import type { SpaceIcon } from '../../types';
  import Icon from './Icon.svelte';

  interface Props {
    icon: SpaceIcon;
    size?: number;
  }

  let { icon, size = 18 }: Props = $props();
</script>

{#if isSpaceIconId(icon)}
  <Icon name={icon} {size} />
{:else}
  <span
    class="emoji"
    style="font-size: {Math.round(size * 0.9)}px; line-height: 1;"
  >
    {icon}
  </span>
{/if}

<style>
  .emoji {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
</style>
