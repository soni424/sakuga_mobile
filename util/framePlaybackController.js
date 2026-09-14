const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const createFramesPlaybackController = ({
  duration,
  fps,
  seek,
  requestPreview = null,
  prefetchPreview = null,
  onChange = () => {},
  onDiagnostic = () => {},
}) => {
  let currentFps = fps;
  let frameCount = Math.max(1, Math.ceil(duration * currentFps));
  let tolerance = 0.5 / currentFps;
  let ready = false;
  let pendingSeek = null;
  let progressFloor = null;
  let lastProgressTime = null;
  let previewRequest = 0;
  let state = {
    frameCount,
    playheadFrame: 0,
    inFrame: 0,
    outFrame: frameCount,
    playing: false,
    ready: false,
    seeking: false,
    previewLoading: false,
    previewUri: null,
    error: null,
  };

  const publish = (nextState) => {
    state = nextState;
    onChange({ ...state });
  };

  const record = (event, details = {}) => onDiagnostic({ event, ...details });

  const runPendingSeek = () => {
    if (ready && pendingSeek) {
      record('seek-requested', { frame: pendingSeek.frame, time: pendingSeek.time });
      seek(pendingSeek.time);
    }
  };

  const requestFramePreview = (frame) => {
    if (!requestPreview) {
      return;
    }
    const requestId = ++previewRequest;
    publish({ ...state, previewLoading: true, error: null });
    Promise.resolve(requestPreview(frame, frame / currentFps))
      .then((previewUri) => {
        if (requestId === previewRequest) {
          publish({ ...state, previewLoading: false, previewUri });
          if (prefetchPreview) {
            Promise.resolve(prefetchPreview(frame, currentFps, frameCount)).catch(() => {});
          }
        }
      })
      .catch(() => {
        if (requestId === previewRequest) {
          publish({ ...state, previewLoading: false, error: 'Could not decode this frame' });
        }
      });
  };

  const requestSeek = (frame, playAfter, showPreview = false) => {
    const playheadFrame = clamp(Math.round(frame), 0, frameCount - 1);
    pendingSeek = { frame: playheadFrame, time: playheadFrame / currentFps, playAfter };
    progressFloor = null;
    lastProgressTime = null;
    publish({ ...state, playheadFrame, playing: false, seeking: true, error: null });
    runPendingSeek();
    if (showPreview) {
      requestFramePreview(playheadFrame);
    }
  };

  const updateRange = (inFrame, outFrame, message = 'Trim range must be at least one frame') => {
    const nextIn = clamp(Math.round(inFrame), 0, frameCount - 1);
    const nextOut = clamp(Math.round(outFrame), 1, frameCount);
    if (nextOut <= nextIn) {
      return { ok: false, message };
    }
    publish({ ...state, inFrame: nextIn, outFrame: nextOut });
    return { ok: true };
  };

  return {
    getState: () => ({ ...state }),
    pause: () => publish({ ...state, playing: false }),
    seekFrame: (frame) => requestSeek(frame, false, true),
    stepFrames: (frames) => requestSeek(state.playheadFrame + frames, false, true),
    setRange: (inFrame, outFrame) => updateRange(inFrame, outFrame),
    setIn: () => updateRange(state.playheadFrame, state.outFrame, 'In must be before Out'),
    setOut: () => updateRange(state.inFrame, state.playheadFrame, 'Out must be after In'),
    setFps: (nextFps) => {
      if (!Number.isFinite(nextFps) || nextFps <= 0 || nextFps === currentFps) {
        return;
      }
      const previousFps = currentFps;
      currentFps = nextFps;
      frameCount = Math.max(1, Math.ceil(duration * currentFps));
      tolerance = 0.5 / currentFps;
      const playheadFrame = clamp(Math.round((state.playheadFrame / previousFps) * currentFps), 0, frameCount - 1);
      const inFrame = clamp(Math.round((state.inFrame / previousFps) * currentFps), 0, frameCount - 1);
      const outFrame = clamp(
        Math.max(inFrame + 1, Math.round((state.outFrame / previousFps) * currentFps)),
        1,
        frameCount,
      );
      pendingSeek = null;
      progressFloor = null;
      lastProgressTime = null;
      previewRequest += 1;
      publish({
        ...state,
        frameCount,
        playheadFrame,
        inFrame,
        outFrame,
        playing: false,
        seeking: false,
        previewLoading: false,
        previewUri: null,
      });
      requestSeek(playheadFrame, false, true);
    },
    togglePlay: () => {
      if (state.playing) {
        publish({ ...state, playing: false });
        return;
      }
      const frame =
        state.playheadFrame < state.inFrame || state.playheadFrame >= state.outFrame
          ? state.inFrame
          : state.playheadFrame;
      requestSeek(frame, true);
    },
    onPlayerReady: () => {
      ready = true;
      record('player-ready');
      publish({ ...state, ready: true });
      runPendingSeek();
    },
    onSeek: ({ seekTime }) => {
      if (!pendingSeek || !Number.isFinite(seekTime) || Math.abs(seekTime - pendingSeek.time) > tolerance) {
        return;
      }
      const completed = pendingSeek;
      record('seek-acknowledged', { frame: completed.frame, time: seekTime });
      pendingSeek = null;
      progressFloor = completed.playAfter ? completed.time - tolerance : null;
      lastProgressTime = completed.playAfter ? completed.time : null;
      publish({
        ...state,
        // Native decoders may acknowledge a nearby keyframe. The requested integer
        // frame remains authoritative and the FFmpeg preview supplies its exact image.
        playheadFrame: completed.frame,
        playing: completed.playAfter,
        seeking: false,
      });
    },
    onProgress: ({ currentTime }) => {
      if (!state.playing || pendingSeek || !Number.isFinite(currentTime)) {
        return;
      }
      if (progressFloor !== null && currentTime < progressFloor) {
        return;
      }
      if (lastProgressTime !== null && currentTime + tolerance < lastProgressTime) {
        return;
      }
      progressFloor = null;
      if (currentTime < state.inFrame / currentFps - tolerance || currentTime >= state.outFrame / currentFps) {
        requestSeek(state.inFrame, true);
        return;
      }
      lastProgressTime = currentTime;
      publish({ ...state, playheadFrame: clamp(Math.round(currentTime * currentFps), 0, frameCount - 1) });
    },
    onEnd: () => requestSeek(state.inFrame, true),
    onError: () => {
      pendingSeek = null;
      record('playback-error');
      publish({ ...state, playing: false, seeking: false, error: 'Video playback failed' });
    },
    dispose: () => {
      ready = false;
      pendingSeek = null;
      previewRequest += 1;
    },
  };
};
