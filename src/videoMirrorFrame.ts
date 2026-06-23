export interface VideoMirrorFrameState {
  lastFrameUrl: string | null;
  showLastFrame: boolean;
}

export type VideoMirrorFrameEvent =
  | { type: 'capture'; frameUrl: string }
  | { type: 'hold' }
  | { type: 'release' };

export function reduceVideoMirrorFrame(
  state: VideoMirrorFrameState,
  event: VideoMirrorFrameEvent,
): VideoMirrorFrameState {
  if (event.type === 'capture') {
    return {
      lastFrameUrl: event.frameUrl,
      showLastFrame: state.showLastFrame,
    };
  }

  if (event.type === 'hold') {
    return {
      ...state,
      showLastFrame: state.lastFrameUrl !== null,
    };
  }

  return {
    ...state,
    showLastFrame: false,
  };
}
