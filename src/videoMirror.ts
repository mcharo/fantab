// Shared contract for mirroring a tab's playing video into the side panel.
//
// The side panel can't reference another tab's <video>, so it opens a port to
// the tab's content script (chrome.tabs.connect) and the two negotiate a
// loopback WebRTC connection: the content script captures the video with
// HTMLVideoElement.captureStream() and sends it; the panel renders the received
// track. Audio is intentionally left to the page so it isn't duplicated.

export const VIDEO_MIRROR_PORT = 'fantab-video-mirror';

export type VideoMirrorSignal =
  // content script -> panel: the producer's SDP offer
  | { type: 'offer'; description: RTCSessionDescriptionInit }
  // panel -> content script: the consumer's SDP answer
  | { type: 'answer'; description: RTCSessionDescriptionInit }
  // both directions: a trickled ICE candidate (null marks end-of-candidates)
  | { type: 'ice'; candidate: RTCIceCandidateInit | null }
  // content script -> panel: capture failed or isn't possible (e.g. DRM)
  | { type: 'error'; message: string }
  // content script -> panel: the source track ended (playback stopped)
  | { type: 'ended' }
  // panel -> content script: stop mirroring and release the capture
  | { type: 'stop' };
