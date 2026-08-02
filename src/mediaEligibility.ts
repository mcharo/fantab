// Which <video> elements count as "the video on this page".
//
// Pages are full of videos that are not the one the user is watching: Google
// result-page hover previews (full duration, often unmuted, no audio track),
// muted ambient loops behind hero images, tiny thumbnails, offscreen players
// kept warm by a carousel. Treating those as real media makes the tab claim the
// player bar, lights up the video/PiP buttons, and hands the mirror a source it
// can do nothing with.
//
// This module is imported only by the content script (and its tests) so Rollup
// folds it into the content-script entry rather than emitting a shared chunk,
// which a manifest content script can't load.

/** Minimum rendered width, in CSS pixels, for a video to count. */
export const MIN_VIDEO_WIDTH = 200;
/** Minimum rendered height, in CSS pixels, for a video to count. */
export const MIN_VIDEO_HEIGHT = 120;
/** Silent clips at or under this many seconds are treated as previews. */
export const MAX_PREVIEW_SECONDS = 12;

/** Plain snapshot of a `<video>`, so the rules stay DOM-free and testable. */
export interface VideoCandidate {
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  /** Rendered size from getBoundingClientRect. */
  rectWidth: number;
  rectHeight: number;
  /** display:none, visibility:hidden, or fully transparent. */
  hidden: boolean;
  /** Seconds; NaN when unknown, Infinity for live streams. */
  duration: number;
  muted: boolean;
  loop: boolean;
  disablePictureInPicture: boolean;
  /** Whether the element has decoded any audio (Chrome-only counter). */
  hasAudioBytes: boolean;
  /**
   * Whether `webkitAudioDecodedByteCount` exists on the element. When false,
   * callers fall back to muted short/loop heuristics (non-Chromium).
   */
  audioCounterSupported: boolean;
}

export type VideoRejection =
  | 'not-ready'
  | 'hidden'
  | 'too-small'
  | 'pip-disabled'
  | 'silent-clip';

/**
 * Why this video should be ignored, or null when it's a real player.
 *
 * Thresholds are deliberately generous: a false reject loses the player bar for
 * a page, which is worse than occasionally accepting an oddity.
 */
export function rejectVideoReason(
  candidate: VideoCandidate,
): VideoRejection | null {
  if (
    candidate.readyState < 2 ||
    candidate.videoWidth <= 0 ||
    candidate.videoHeight <= 0
  ) {
    return 'not-ready';
  }

  if (
    candidate.hidden ||
    candidate.rectWidth <= 0 ||
    candidate.rectHeight <= 0
  ) {
    return 'hidden';
  }

  if (
    candidate.rectWidth < MIN_VIDEO_WIDTH ||
    candidate.rectHeight < MIN_VIDEO_HEIGHT
  ) {
    return 'too-small';
  }

  // Sites that opt out of picture-in-picture are either decorative (hover
  // previews, background loops) or would reject the PiP request anyway.
  if (candidate.disablePictureInPicture) return 'pip-disabled';

  // No decoded audio ⇒ decorative loop, hover preview, or a silent source.
  // Chromium exposes webkitAudioDecodedByteCount even while muted, so a real
  // player (YouTube watched muted, etc.) clears this once audio has decoded.
  // Google SERP hover previews stream the full duration, often unmuted, but
  // never produce audio bytes — that used to look like a feature film.
  //
  // Without the counter (non-Chromium), fall back to muted short/loop only so
  // we don't reject every video.
  const isShort =
    Number.isFinite(candidate.duration) &&
    candidate.duration > 0 &&
    candidate.duration <= MAX_PREVIEW_SECONDS;
  if (!candidate.hasAudioBytes) {
    if (candidate.audioCounterSupported) return 'silent-clip';
    if (candidate.muted && (candidate.loop || isShort)) return 'silent-clip';
  }

  return null;
}

export function isEligibleVideo(candidate: VideoCandidate): boolean {
  return rejectVideoReason(candidate) === null;
}
