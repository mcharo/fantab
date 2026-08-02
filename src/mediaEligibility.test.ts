import { describe, expect, it } from 'vitest';
import {
  isEligibleVideo,
  rejectVideoReason,
  type VideoCandidate,
} from './mediaEligibility';

function candidate(overrides: Partial<VideoCandidate> = {}): VideoCandidate {
  return {
    readyState: 4,
    videoWidth: 1280,
    videoHeight: 720,
    rectWidth: 854,
    rectHeight: 480,
    hidden: false,
    duration: 600,
    muted: false,
    loop: false,
    disablePictureInPicture: false,
    hasAudioBytes: true,
    audioCounterSupported: true,
    ...overrides,
  };
}

describe('rejectVideoReason', () => {
  it('accepts a normal player', () => {
    expect(rejectVideoReason(candidate())).toBeNull();
    expect(isEligibleVideo(candidate())).toBe(true);
  });

  it('accepts a live stream with an infinite duration', () => {
    expect(rejectVideoReason(candidate({ duration: Infinity }))).toBeNull();
  });

  it('accepts a long muted video once audio has been decoded', () => {
    expect(
      rejectVideoReason(
        candidate({ muted: true, hasAudioBytes: true, duration: 3600 }),
      ),
    ).toBeNull();
  });

  it('accepts a muted looping video that carries audio', () => {
    expect(
      rejectVideoReason(candidate({ muted: true, loop: true })),
    ).toBeNull();
  });

  it('rejects a full-length hover preview with no decoded audio', () => {
    // Google SERP thumbnails stream the real duration, often unmuted, but never
    // decode an audio track — previously treated as a muted feature film.
    expect(
      rejectVideoReason(
        candidate({
          muted: false,
          hasAudioBytes: false,
          duration: 101,
          loop: false,
        }),
      ),
    ).toBe('silent-clip');
  });

  it('rejects a long muted video that has never decoded audio', () => {
    expect(
      rejectVideoReason(
        candidate({ muted: true, hasAudioBytes: false, duration: 3600 }),
      ),
    ).toBe('silent-clip');
  });

  it('falls back to muted short/loop rules when the audio counter is unavailable', () => {
    expect(
      rejectVideoReason(
        candidate({
          audioCounterSupported: false,
          muted: true,
          hasAudioBytes: false,
          duration: 3600,
        }),
      ),
    ).toBeNull();
    expect(
      rejectVideoReason(
        candidate({
          audioCounterSupported: false,
          muted: true,
          hasAudioBytes: false,
          duration: 6,
        }),
      ),
    ).toBe('silent-clip');
  });

  it('rejects a video that has not loaded a frame', () => {
    expect(rejectVideoReason(candidate({ readyState: 1 }))).toBe('not-ready');
    expect(rejectVideoReason(candidate({ videoWidth: 0 }))).toBe('not-ready');
    expect(rejectVideoReason(candidate({ videoHeight: 0 }))).toBe('not-ready');
  });

  it('rejects hidden and unlaid-out videos', () => {
    expect(rejectVideoReason(candidate({ hidden: true }))).toBe('hidden');
    expect(rejectVideoReason(candidate({ rectWidth: 0 }))).toBe('hidden');
    expect(rejectVideoReason(candidate({ rectHeight: 0 }))).toBe('hidden');
  });

  it('rejects thumbnails rendered below the size floor', () => {
    expect(
      rejectVideoReason(candidate({ rectWidth: 160, rectHeight: 90 })),
    ).toBe('too-small');
    expect(rejectVideoReason(candidate({ rectHeight: 110 }))).toBe('too-small');
  });

  it('rejects videos that opt out of picture-in-picture', () => {
    expect(
      rejectVideoReason(candidate({ disablePictureInPicture: true })),
    ).toBe('pip-disabled');
  });

  it('rejects silent decorative loops', () => {
    expect(
      rejectVideoReason(
        candidate({
          muted: true,
          loop: true,
          hasAudioBytes: false,
          duration: 240,
        }),
      ),
    ).toBe('silent-clip');
  });

  it('rejects short silent previews', () => {
    expect(
      rejectVideoReason(
        candidate({ muted: true, hasAudioBytes: false, duration: 6 }),
      ),
    ).toBe('silent-clip');
  });

  it('reports the first failing rule', () => {
    expect(
      rejectVideoReason(
        candidate({ readyState: 0, hidden: true, rectWidth: 10 }),
      ),
    ).toBe('not-ready');
  });
});
