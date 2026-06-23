<script lang="ts">
  import { untrack } from 'svelte';

  import { VIDEO_MIRROR_PORT, type VideoMirrorSignal } from '../../videoMirror';
  import {
    reduceVideoMirrorFrame,
    type VideoMirrorFrameState,
  } from '../../videoMirrorFrame';

  interface Props {
    tabId: number;
    transitionKey?: number;
  }

  let { tabId, transitionKey = 0 }: Props = $props();

  let videoEl: HTMLVideoElement | undefined = $state();
  let status = $state<'connecting' | 'live' | 'error' | 'ended'>('connecting');
  let statusMessage = $state('Connecting\u2026');
  let frame = $state<VideoMirrorFrameState>({
    lastFrameUrl: null,
    showLastFrame: false,
  });

  let port: chrome.runtime.Port | undefined;
  let pc: RTCPeerConnection | undefined;
  let remoteReady = false;
  let pendingIce: RTCIceCandidateInit[] = [];
  let releaseFrameTimer: number | undefined;
  let captureFrameTimer: number | undefined;
  let lastTransitionKey: number | undefined;

  function updateFrame(event: Parameters<typeof reduceVideoMirrorFrame>[1]) {
    frame = reduceVideoMirrorFrame(frame, event);
  }

  function clearReleaseFrameTimer() {
    if (releaseFrameTimer !== undefined) {
      window.clearTimeout(releaseFrameTimer);
      releaseFrameTimer = undefined;
    }
  }

  function clearCaptureFrameTimer() {
    if (captureFrameTimer !== undefined) {
      window.clearInterval(captureFrameTimer);
      captureFrameTimer = undefined;
    }
  }

  function captureLastFrame(): boolean {
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      return false;
    }

    try {
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / videoEl.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(videoEl.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(videoEl.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return false;

      context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      updateFrame({
        type: 'capture',
        frameUrl: canvas.toDataURL('image/jpeg', 0.82),
      });
      return true;
    } catch {
      return false;
    }
  }

  function holdLastFrame() {
    const captured = captureLastFrame();
    if (captured || frame.lastFrameUrl) updateFrame({ type: 'hold' });
  }

  function releaseLastFrameAfter(delayMs: number) {
    clearReleaseFrameTimer();
    releaseFrameTimer = window.setTimeout(() => {
      updateFrame({ type: 'release' });
      releaseFrameTimer = undefined;
    }, delayMs);
  }

  function releaseAfterNextRenderedFrame() {
    const callback = () => {
      captureLastFrame();
      releaseLastFrameAfter(120);
    };
    const videoWithCallback = videoEl as
      | (HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        })
      | undefined;

    if (videoWithCallback?.requestVideoFrameCallback) {
      videoWithCallback.requestVideoFrameCallback(callback);
    } else {
      window.setTimeout(callback, 120);
    }
  }

  function teardown() {
    clearReleaseFrameTimer();
    clearCaptureFrameTimer();
    remoteReady = false;
    pendingIce = [];
    if (pc) {
      try {
        pc.close();
      } catch {
        // already closed
      }
      pc = undefined;
    }
    if (port) {
      try {
        port.postMessage({ type: 'stop' } satisfies VideoMirrorSignal);
      } catch {
        // port already gone
      }
      try {
        port.disconnect();
      } catch {
        // already disconnected
      }
      port = undefined;
    }
    if (videoEl) videoEl.srcObject = null;
  }

  function post(signal: VideoMirrorSignal) {
    try {
      port?.postMessage(signal);
    } catch {
      // port closed mid-negotiation
    }
  }

  async function handleSignal(message: VideoMirrorSignal) {
    if (!pc) return;
    try {
      if (message.type === 'offer') {
        await pc.setRemoteDescription(message.description);
        remoteReady = true;
        for (const candidate of pendingIce) {
          await pc.addIceCandidate(candidate).catch(() => {});
        }
        pendingIce = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        post({
          type: 'answer',
          description: { type: answer.type, sdp: answer.sdp },
        });
      } else if (message.type === 'ice' && message.candidate) {
        if (remoteReady) await pc.addIceCandidate(message.candidate);
        else pendingIce.push(message.candidate);
      } else if (message.type === 'error') {
        status = 'error';
        statusMessage = message.message || 'Unable to mirror video';
      } else if (message.type === 'ended') {
        status = 'ended';
        statusMessage = 'Playback ended';
      }
    } catch {
      status = 'error';
      statusMessage = 'Unable to mirror video';
    }
  }

  function start(targetTabId: number) {
    holdLastFrame();
    teardown();
    status = 'connecting';
    statusMessage = 'Connecting\u2026';

    const connection = chrome.tabs.connect(targetTabId, {
      name: VIDEO_MIRROR_PORT,
    });
    port = connection;

    const peer = new RTCPeerConnection();
    pc = peer;

    peer.addEventListener('icecandidate', (event) => {
      post({
        type: 'ice',
        candidate: event.candidate ? event.candidate.toJSON() : null,
      });
    });
    peer.addEventListener('track', (event) => {
      if (!videoEl) return;
      videoEl.srcObject =
        event.streams[0] ?? new MediaStream([event.track]);
      status = 'live';
      void videoEl.play().catch(() => {});
      releaseAfterNextRenderedFrame();
    });
    peer.addEventListener('connectionstatechange', () => {
      if (peer.connectionState === 'failed') {
        status = 'error';
        statusMessage = 'Connection failed';
      }
    });

    connection.onMessage.addListener((message: VideoMirrorSignal) => {
      void handleSignal(message);
    });
    connection.onDisconnect.addListener(() => {
      if (port === connection && status !== 'error') {
        status = 'ended';
        statusMessage = 'Stopped';
      }
    });

    captureFrameTimer = window.setInterval(() => {
      if (status === 'live') captureLastFrame();
    }, 1000);
  }

  // Restart whenever the tab we mirror changes; tear down on unmount.
  $effect(() => {
    const id = tabId;
    untrack(() => start(id));
    return () => untrack(() => teardown());
  });

  $effect(() => {
    const key = transitionKey;
    untrack(() => {
      if (lastTransitionKey === undefined) {
        lastTransitionKey = key;
        return;
      }
      if (key === lastTransitionKey) return;
      lastTransitionKey = key;
      holdLastFrame();
      releaseLastFrameAfter(550);
    });
  });
</script>

<div class="mirror" class:live={status === 'live'}>
  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={videoEl} autoplay muted playsinline></video>
  {#if frame.showLastFrame && frame.lastFrameUrl}
    <img class="last-frame" src={frame.lastFrameUrl} alt="" />
  {/if}
  {#if status !== 'live'}
    <div
      class="overlay"
      class:compact={frame.showLastFrame && frame.lastFrameUrl}
    >
      {statusMessage}
    </div>
  {/if}
</div>

<style>
  .mirror {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: #000;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .last-frame {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }

  .overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    text-align: center;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-secondary);
  }

  .overlay.compact {
    inset: auto auto 8px 8px;
    padding: 4px 7px;
    border-radius: 999px;
    font-size: 11px;
    color: white;
    background: rgba(0, 0, 0, 0.58);
    backdrop-filter: blur(8px);
  }
</style>
