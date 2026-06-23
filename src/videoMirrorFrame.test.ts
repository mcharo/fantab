import { describe, expect, it } from 'vitest';

import {
  reduceVideoMirrorFrame,
  type VideoMirrorFrameState,
} from './videoMirrorFrame';

function frameState(
  overrides: Partial<VideoMirrorFrameState> = {},
): VideoMirrorFrameState {
  return {
    lastFrameUrl: null,
    showLastFrame: false,
    ...overrides,
  };
}

describe('reduceVideoMirrorFrame', () => {
  it('keeps the last frame visible while reconnecting', () => {
    const state = reduceVideoMirrorFrame(
      frameState({ lastFrameUrl: 'data:image/jpeg;base64,last-frame' }),
      { type: 'hold' },
    );

    expect(state).toEqual({
      lastFrameUrl: 'data:image/jpeg;base64,last-frame',
      showLastFrame: true,
    });
  });

  it('does not show a blank frame placeholder when no frame has been captured', () => {
    const state = reduceVideoMirrorFrame(frameState(), { type: 'hold' });

    expect(state).toEqual({
      lastFrameUrl: null,
      showLastFrame: false,
    });
  });

  it('keeps the previous frame over the live video until explicitly released', () => {
    const held = reduceVideoMirrorFrame(
      frameState({ lastFrameUrl: 'data:image/jpeg;base64,last-frame' }),
      { type: 'hold' },
    );

    const released = reduceVideoMirrorFrame(held, { type: 'release' });

    expect(released).toEqual({
      lastFrameUrl: 'data:image/jpeg;base64,last-frame',
      showLastFrame: false,
    });
  });

  it('stores newly captured frames without forcing the overlay visible', () => {
    const state = reduceVideoMirrorFrame(frameState(), {
      type: 'capture',
      frameUrl: 'data:image/jpeg;base64,next-frame',
    });

    expect(state).toEqual({
      lastFrameUrl: 'data:image/jpeg;base64,next-frame',
      showLastFrame: false,
    });
  });
});
