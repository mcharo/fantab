import { describe, expect, it } from 'vitest';
import {
  hasPlayedAudibly,
  isEligibleVideo,
  isSignificantMedia,
  rejectMediaReason,
  rejectVideoReason,
  trustMediaSession,
  type MediaCandidate,
  type SessionCandidate,
  type VideoCandidate,
} from './mediaEligibility';

function media(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    readyState: 4,
    paused: false,
    ended: false,
    hasPlayed: true,
    duration: 600,
    muted: false,
    volume: 1,
    hasAudioBytes: true,
    audioCounterSupported: true,
    encrypted: false,
    heard: true,
    engaged: false,
    ...overrides,
  };
}

function video(overrides: Partial<VideoCandidate> = {}): VideoCandidate {
  return {
    ...media(),
    videoWidth: 1280,
    videoHeight: 720,
    rectWidth: 854,
    rectHeight: 480,
    hidden: false,
    ...overrides,
  };
}

describe('hasPlayedAudibly', () => {
  it('is true for unmuted playback that decodes audio', () => {
    expect(hasPlayedAudibly(media())).toBe(true);
  });

  it('stays true once paused after playing', () => {
    expect(hasPlayedAudibly(media({ paused: true, hasPlayed: true }))).toBe(true);
  });

  it('is false before anything has played', () => {
    expect(hasPlayedAudibly(media({ paused: true, hasPlayed: false }))).toBe(
      false,
    );
  });

  it('is false while muted or at zero volume', () => {
    // YouTube's home-page previews and feed autoplay run muted.
    expect(hasPlayedAudibly(media({ muted: true }))).toBe(false);
    expect(hasPlayedAudibly(media({ volume: 0 }))).toBe(false);
  });

  it('is false for unmuted playback with no audio track', () => {
    // Google SERP hover previews stream unmuted but never decode audio.
    expect(hasPlayedAudibly(media({ hasAudioBytes: false }))).toBe(false);
  });

  it('trusts DRM-protected media without the audio counter', () => {
    expect(
      hasPlayedAudibly(media({ hasAudioBytes: false, encrypted: true })),
    ).toBe(true);
  });

  it('trusts unmuted playback where the audio counter is unavailable', () => {
    expect(
      hasPlayedAudibly(
        media({ hasAudioBytes: false, audioCounterSupported: false }),
      ),
    ).toBe(true);
  });
});

describe('rejectMediaReason', () => {
  it('accepts media the user has heard', () => {
    expect(rejectMediaReason(media())).toBeNull();
    expect(isSignificantMedia(media())).toBe(true);
  });

  it('keeps media the user heard, then paused or muted', () => {
    expect(rejectMediaReason(media({ paused: true }))).toBeNull();
    expect(rejectMediaReason(media({ muted: true }))).toBeNull();
  });

  it('accepts media the user started even if never heard', () => {
    // A muted lecture watched with captions, a silent screen recording.
    expect(
      rejectMediaReason(
        media({ heard: false, engaged: true, muted: true, hasAudioBytes: false }),
      ),
    ).toBeNull();
  });

  it('accepts a live stream with an infinite duration', () => {
    expect(rejectMediaReason(media({ duration: Infinity }))).toBeNull();
  });

  it('accepts media whose duration is not known yet', () => {
    expect(rejectMediaReason(media({ duration: NaN }))).toBeNull();
  });

  it('rejects media with no source loaded', () => {
    expect(rejectMediaReason(media({ readyState: 0 }))).toBe('not-ready');
  });

  it('rejects preloaded media that never played', () => {
    // Notification sounds and tracking clips sitting in the DOM.
    expect(
      rejectMediaReason(media({ paused: true, hasPlayed: false, heard: false })),
    ).toBe('never-played');
  });

  it('rejects short clips even when heard', () => {
    expect(rejectMediaReason(media({ duration: 2 }))).toBe('short-clip');
    expect(rejectMediaReason(media({ duration: 12 }))).toBe('short-clip');
    expect(rejectMediaReason(media({ duration: 13 }))).toBeNull();
  });

  it('rejects a muted preview the user never heard or started', () => {
    expect(
      rejectMediaReason(media({ muted: true, heard: false, engaged: false })),
    ).toBe('incidental');
  });

  it('reports the first failing rule', () => {
    expect(
      rejectMediaReason(
        media({ readyState: 0, paused: true, hasPlayed: false, heard: false }),
      ),
    ).toBe('not-ready');
  });
});

describe('rejectVideoReason', () => {
  it('accepts a normal player', () => {
    expect(rejectVideoReason(video())).toBeNull();
    expect(isEligibleVideo(video())).toBe(true);
  });

  it('ignores disablePictureInPicture-style opt-outs', () => {
    // Disney+ and Hulu flag their main player; the PiP action clears it. The
    // candidate deliberately doesn't carry the flag.
    expect('disablePictureInPicture' in video()).toBe(false);
  });

  it('applies the media rules first', () => {
    expect(rejectVideoReason(video({ heard: false }))).toBe('incidental');
    expect(rejectVideoReason(video({ duration: 6 }))).toBe('short-clip');
  });

  it('rejects a video with no decoded frame', () => {
    expect(rejectVideoReason(video({ readyState: 1 }))).toBe('no-frame');
    expect(rejectVideoReason(video({ videoWidth: 0 }))).toBe('no-frame');
    expect(rejectVideoReason(video({ videoHeight: 0 }))).toBe('no-frame');
  });

  it('rejects hidden and unlaid-out videos', () => {
    expect(rejectVideoReason(video({ hidden: true }))).toBe('hidden');
    expect(rejectVideoReason(video({ rectWidth: 0 }))).toBe('hidden');
    expect(rejectVideoReason(video({ rectHeight: 0 }))).toBe('hidden');
  });

  it('still counts a hidden video as media when it is heard', () => {
    const hiddenPlayer = video({ hidden: true });
    expect(isSignificantMedia(hiddenPlayer)).toBe(true);
    expect(isEligibleVideo(hiddenPlayer)).toBe(false);
  });

  it('rejects thumbnails rendered below the size floor', () => {
    expect(rejectVideoReason(video({ rectWidth: 160, rectHeight: 90 }))).toBe(
      'too-small',
    );
    expect(rejectVideoReason(video({ rectHeight: 110 }))).toBe('too-small');
  });
});

describe('trustMediaSession', () => {
  function session(overrides: Partial<SessionCandidate> = {}): SessionCandidate {
    return {
      hasSession: true,
      playbackState: 'playing',
      title: 'Track',
      ...overrides,
    };
  }

  const noDomMedia = { hasSignificant: false, hasPlayedIncidental: false };

  it('ignores a missing or empty session', () => {
    expect(trustMediaSession(null, noDomMedia)).toBe(false);
    expect(trustMediaSession(session({ hasSession: false }), noDomMedia)).toBe(
      false,
    );
  });

  it('trusts a session alongside accepted DOM media', () => {
    expect(
      trustMediaSession(session({ playbackState: 'none', title: '' }), {
        hasSignificant: true,
        hasPlayedIncidental: true,
      }),
    ).toBe(true);
  });

  it('ignores a session that belongs to an incidental preview', () => {
    expect(
      trustMediaSession(session(), {
        hasSignificant: false,
        hasPlayedIncidental: true,
      }),
    ).toBe(false);
  });

  it('trusts a session for media outside the DOM once it announces something', () => {
    // Detached `new Audio()` or Web Audio players (SoundCloud, Spotify).
    expect(trustMediaSession(session({ title: '' }), noDomMedia)).toBe(true);
    expect(
      trustMediaSession(session({ playbackState: 'none' }), noDomMedia),
    ).toBe(true);
  });

  it('ignores a session that only registered handlers', () => {
    expect(
      trustMediaSession(
        session({ playbackState: 'none', title: '  ' }),
        noDomMedia,
      ),
    ).toBe(false);
  });
});
