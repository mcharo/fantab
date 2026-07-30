<script lang="ts">
  import { untrack } from 'svelte';

  import type { ActiveMedia } from '../../types';
  import Icon from './Icon.svelte';
  import VideoMirror from './VideoMirror.svelte';

  interface Props {
    media: ActiveMedia;
    onPlayPause: () => void;
    onNext: () => void;
    onPrev: () => void;
    onSetVolume: (volume: number, muted: boolean) => void;
    onActivate: () => void;
    onTogglePiP: () => void;
    enableVideoPreview?: boolean;
  }

  let {
    media,
    onPlayPause,
    onNext,
    onPrev,
    onSetVolume,
    onActivate,
    onTogglePiP,
    enableVideoPreview = false,
  }: Props = $props();

  // Embedded live preview of the playing tab's video, toggled by the user
  // (off by default since mirroring has a cost). Hidden automatically for
  // audio-only sources.
  let showVideo = $state(false);
  let videoTransitionKey = $state(0);

  // A report can briefly drop hasVideo mid-stream (ad transitions, a player
  // swapping its <video>), and unmounting the mirror on that would kill a live
  // stream for good. Latch it for as long as we're pointed at the same tab.
  let latchedVideoTabId = $state<number | null>(null);
  let latchedHasVideo = $state(false);
  const canShowVideo = $derived(media.hasVideo || latchedHasVideo);

  // While dragging the slider, show the local value so incoming reports (which
  // echo our own volume writes back) don't fight the drag.
  let dragging = $state(false);
  let localVolume = $state(1);

  const sliderVolume = $derived(dragging ? localVolume : media.volume);
  const isSilent = $derived(media.muted || media.volume === 0);

  $effect(() => {
    if (!dragging) localVolume = media.volume;
  });

  $effect(() => {
    if (!enableVideoPreview && showVideo) showVideo = false;
  });

  $effect(() => {
    const { tabId, hasVideo } = media;
    untrack(() => {
      if (tabId !== latchedVideoTabId) {
        latchedVideoTabId = tabId;
        latchedHasVideo = hasVideo;
        return;
      }
      if (hasVideo) latchedHasVideo = true;
    });
  });

  function handleVolumeInput(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    localVolume = value;
    dragging = true;
    onSetVolume(value, value === 0);
  }

  function commitVolume() {
    dragging = false;
  }

  function toggleMute() {
    onSetVolume(media.volume, !media.muted);
  }

  function toggleVideo() {
    showVideo = !showVideo;
    // Hiding drops the latch, so re-enabling later starts from what the tab
    // actually reports rather than a stale "it had video once".
    if (!showVideo) latchedHasVideo = media.hasVideo;
  }

  function handlePlayPause() {
    if (!showVideo || !canShowVideo) {
      onPlayPause();
      return;
    }

    videoTransitionKey += 1;
    window.setTimeout(() => onPlayPause(), 0);
  }
</script>

<section class="player-bar" aria-label="Media controls">
  {#if enableVideoPreview && showVideo && canShowVideo}
    <VideoMirror tabId={media.tabId} transitionKey={videoTransitionKey} />
  {/if}

  <div class="now-playing">
    <button
      class="track"
      onclick={onActivate}
      title={media.artist ? `${media.title} — ${media.artist}` : media.title}
    >
      {#if media.faviconUrl}
        <img class="favicon" src={media.faviconUrl} alt="" />
      {:else}
        <span class="favicon favicon-fallback" aria-hidden="true"></span>
      {/if}
      <span class="labels">
        <span class="title">{media.title}</span>
        {#if media.artist}
          <span class="artist">{media.artist}</span>
        {/if}
      </span>
    </button>

    <!-- The preview toggle follows the latch so it stays available to switch a
         mirror off after the page's video is really gone. -->
    {#if enableVideoPreview && canShowVideo}
      <button
        class="ctrl-btn"
        class:active={showVideo}
        onclick={toggleVideo}
        title={showVideo ? 'Hide video' : 'Show video'}
        aria-label={showVideo ? 'Hide video' : 'Show video'}
        aria-pressed={showVideo}
      >
        <Icon name={showVideo ? 'video-off' : 'video'} size={16} />
      </button>
    {/if}
    {#if media.hasVideo}
      <button
        class="ctrl-btn"
        onclick={onTogglePiP}
        title="Picture-in-picture"
        aria-label="Picture-in-picture"
      >
        <Icon name="pip" size={16} />
      </button>
    {/if}
  </div>

  <div class="controls">
    <div class="transport">
      <button
        class="ctrl-btn"
        onclick={onPrev}
        disabled={!media.canPrev}
        title="Previous track"
        aria-label="Previous track"
      >
        <Icon name="skip-back" size={17} />
      </button>

      <button
        class="ctrl-btn play"
        onclick={handlePlayPause}
        title={media.isPlaying ? 'Pause' : 'Play'}
        aria-label={media.isPlaying ? 'Pause' : 'Play'}
      >
        <Icon name={media.isPlaying ? 'pause' : 'play'} size={18} />
      </button>

      <button
        class="ctrl-btn"
        onclick={onNext}
        disabled={!media.canNext}
        title="Next track"
        aria-label="Next track"
      >
        <Icon name="skip-forward" size={17} />
      </button>
    </div>

    <div class="volume">
      <button
        class="ctrl-btn"
        onclick={toggleMute}
        title={isSilent ? 'Unmute' : 'Mute'}
        aria-label={isSilent ? 'Unmute' : 'Mute'}
      >
        <Icon name={isSilent ? 'volume-x' : 'volume-2'} size={16} />
      </button>
      <input
        class="volume-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={sliderVolume}
        oninput={handleVolumeInput}
        onchange={commitVolume}
        onpointerup={commitVolume}
        aria-label="Volume"
      />
    </div>
  </div>
</section>

<style>
  .player-bar {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-top: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  }

  .now-playing {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .track {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    text-align: left;
    color: var(--text-primary);
  }

  .track:hover {
    background: var(--bg-hover);
  }

  .favicon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border-radius: 4px;
    object-fit: cover;
  }

  .favicon-fallback {
    background: var(--bg-secondary);
  }

  .labels {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.2;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .artist {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .transport {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .volume {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    transition:
      background 0.15s,
      color 0.15s;
  }

  .ctrl-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .ctrl-btn.play {
    color: var(--text-primary);
  }

  .ctrl-btn.active {
    background: var(--active-bg);
    color: var(--accent-color);
  }

  .ctrl-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .volume-slider {
    flex: 1;
    min-width: 0;
    height: 4px;
    accent-color: var(--accent-color);
    cursor: pointer;
  }
</style>
