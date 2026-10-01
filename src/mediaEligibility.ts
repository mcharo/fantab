// Which media elements count as "the media on this page".
//
// Pages are full of media the user isn't consuming: Google result-page hover
// previews (full duration, often unmuted, no audio track), YouTube's muted
// home-page previews, muted feed autoplay, ambient loops behind hero images,
// preloaded UI sounds and tracking clips that never play. Treating those as real
// media makes the tab claim the player bar, grow a play/pause control, light up
// the PiP button, and hand the mirror a source it can do nothing with.
//
// The rule is "media the user has heard, or deliberately started": an element
// counts once it has played audibly (unmuted, non-zero volume, actually decoding
// audio), or once the user's own click landed on it as it started or unmuted, or
// it went fullscreen / picture-in-picture. Those latches live in the content
// script; this module only judges snapshots.
//
// This module is imported only by the content script (and its tests) so Rollup
// folds it into the content-script entry rather than emitting a shared chunk,
// which a manifest content script can't load.

/** Minimum rendered width, in CSS pixels, for a video to be shown/PiP'd. */
export const MIN_VIDEO_WIDTH = 200;
/** Minimum rendered height, in CSS pixels, for a video to be shown/PiP'd. */
export const MIN_VIDEO_HEIGHT = 120;
/**
 * Clips at or under this many seconds are UI sounds, pronunciations, or preview
 * loops, never something worth a play/pause control.
 */
export const MAX_INCIDENTAL_SECONDS = 12;

/** Plain snapshot of an `<audio>`/`<video>`, so the rules stay DOM-free. */
export interface MediaCandidate {
  readyState: number;
  paused: boolean;
  ended: boolean;
  /** Any of the media has played (`played.length > 0`). */
  hasPlayed: boolean;
  /** Seconds; NaN when unknown, Infinity for live streams. */
  duration: number;
  muted: boolean;
  volume: number;
  /** Whether the element has decoded any audio (Chrome-only counter). */
  hasAudioBytes: boolean;
  /**
   * Whether `webkitAudioDecodedByteCount` exists on the element. Without it
   * (non-Chromium) unmuted playback is taken at face value.
   */
  audioCounterSupported: boolean;
  /** DRM-protected (`mediaKeys` attached); decorative previews never are. */
  encrypted: boolean;
  /** Latched by the content script: has been observed playing audibly. */
  heard: boolean;
  /**
   * Latched by the content script: the user's click landed on it as it
   * started or (un)muted, or it went fullscreen / picture-in-picture.
   */
  engaged: boolean;
}

export interface VideoCandidate extends MediaCandidate {
  videoWidth: number;
  videoHeight: number;
  /** Rendered size from getBoundingClientRect. */
  rectWidth: number;
  rectHeight: number;
  /** display:none, visibility:hidden, or fully transparent. */
  hidden: boolean;
}

export type MediaRejection =
  /** No source loaded (or it was torn down). */
  | 'not-ready'
  /** Loaded but never started: a preloaded sound, an unplayed player. */
  | 'never-played'
  | 'short-clip'
  /** Only ever played muted or silent, without the user starting it. */
  | 'incidental';

export type VideoRejection =
  | MediaRejection
  /** No decoded frame to show. */
  | 'no-frame'
  | 'hidden'
  | 'too-small';

/**
 * Whether the element has played with sound the user could hear: it has
 * played, it's unmuted at a non-zero volume, and it has real audio. The content
 * script latches this into {@link MediaCandidate.heard}, so muting a video the
 * user was listening to doesn't make it disappear.
 *
 * Chromium's audio counter is the tell for hover previews: Google SERP previews
 * stream unmuted but never decode an audio track. DRM'd media is trusted
 * regardless, in case a protected pipeline doesn't feed the counter.
 */
export function hasPlayedAudibly(candidate: MediaCandidate): boolean {
  if (candidate.paused && !candidate.hasPlayed) return false;
  if (candidate.muted || candidate.volume <= 0) return false;
  return (
    candidate.hasAudioBytes ||
    candidate.encrypted ||
    !candidate.audioCounterSupported
  );
}

/**
 * Why this element isn't media the user is consuming, or null when it is. An
 * accepted element drives the tab's play/pause control and the player bar.
 */
export function rejectMediaReason(
  candidate: MediaCandidate,
): MediaRejection | null {
  if (candidate.readyState === 0) return 'not-ready';
  if (candidate.paused && !candidate.hasPlayed) return 'never-played';

  if (
    Number.isFinite(candidate.duration) &&
    candidate.duration > 0 &&
    candidate.duration <= MAX_INCIDENTAL_SECONDS
  ) {
    return 'short-clip';
  }

  if (!candidate.heard && !candidate.engaged) return 'incidental';
  return null;
}

/**
 * Why this video shouldn't be offered for picture-in-picture or mirroring, or
 * null when it can be. Applies {@link rejectMediaReason} first, then requires a
 * visible, reasonably sized frame — a hidden `<video>` that's playing audio
 * still counts as media, just not as video.
 *
 * Deliberately ignores `disablePictureInPicture`: Disney+ and Hulu set it on
 * their main player, and the PiP action clears it before requesting.
 */
export function rejectVideoReason(
  candidate: VideoCandidate,
): VideoRejection | null {
  const mediaRejection = rejectMediaReason(candidate);
  if (mediaRejection) return mediaRejection;

  if (
    candidate.readyState < 2 ||
    candidate.videoWidth <= 0 ||
    candidate.videoHeight <= 0
  ) {
    return 'no-frame';
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

  return null;
}

/** What the main-world bridge relays about `navigator.mediaSession`. */
export interface SessionCandidate {
  hasSession: boolean;
  playbackState: 'none' | 'paused' | 'playing';
  title: string;
}

/** What the page's own media elements amount to, per {@link rejectMediaReason}. */
export interface DomMediaSummary {
  /** At least one element passed. */
  hasSignificant: boolean;
  /** At least one element has played but was rejected as incidental. */
  hasPlayedIncidental: boolean;
}

/**
 * Whether the page's MediaSession should count as media. Sessions matter for
 * players we can't see in the DOM (detached `new Audio()`, Web Audio), but a
 * site's player library can register one for a muted preview too. So:
 *
 * - Alongside accepted DOM media, the session just describes it.
 * - If the only media that has played was incidental, the session most likely
 *   belongs to that (YouTube's home-page previews), so it's ignored.
 * - With no visible media at all, the site has to have announced something —
 *   a playback state or a title — not merely registered handlers.
 */
export function trustMediaSession(
  session: SessionCandidate | null,
  dom: DomMediaSummary,
): boolean {
  if (!session?.hasSession) return false;
  if (dom.hasSignificant) return true;
  if (dom.hasPlayedIncidental) return false;
  return session.playbackState !== 'none' || session.title.trim() !== '';
}

export function isSignificantMedia(candidate: MediaCandidate): boolean {
  return rejectMediaReason(candidate) === null;
}

export function isEligibleVideo(candidate: VideoCandidate): boolean {
  return rejectVideoReason(candidate) === null;
}
