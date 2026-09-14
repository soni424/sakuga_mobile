const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const WINDOW_SIZE = 25;
const CACHE_CAPACITY = 50;
const REFILL_DISTANCE = 6;

export const createFramesPlaybackController = ({
  duration,
  fps,
  seek,
  frameWindowAdapter = null,
  onChange = () => {},
  onDiagnostic = () => {},
}) => {
  let currentFps = fps;
  let frameCount = Math.max(1, Math.ceil(duration * currentFps));
  let tolerance = 0.5 / currentFps;
  let ready = false;
  let disposed = false;
  let pendingSeek = null;
  let progressFloor = null;
  let lastProgressTime = null;
  let requestedFrame = 0;
  let previewRequest = 0;
  let preparationTimer = null;
  let backgroundPending = false;
  const cache = new Map();
  let state = {
    frameCount,
    playheadFrame: 0,
    inFrame: 0,
    outFrame: frameCount,
    playing: false,
    ready: false,
    seeking: false,
    previewPreparing: false,
    previewUri: null,
    error: null,
  };

  const publish = (nextState) => {
    state = nextState;
    onChange({ ...state });
  };
  const record = (event, details = {}) => onDiagnostic({ event, ...details });
  const clearPreparationTimer = () => {
    if (preparationTimer) clearTimeout(preparationTimer);
    preparationTimer = null;
  };
  const touch = (frame) => {
    if (!cache.has(frame)) return null;
    const uri = cache.get(frame);
    cache.delete(frame);
    cache.set(frame, uri);
    return uri;
  };
  const rememberWindow = (frames) => {
    frames.forEach(({ frame, uri }) => {
      cache.delete(frame);
      cache.set(frame, uri);
    });
    while (cache.size > CACHE_CAPACITY) {
      const oldest = cache.keys().next().value;
      const uri = cache.get(oldest);
      cache.delete(oldest);
      frameWindowAdapter?.removePreview?.(uri);
    }
  };
  const windowStartFor = (frame) => {
    const count = Math.min(WINDOW_SIZE, frameCount);
    return clamp(frame - Math.floor(count / 2), 0, Math.max(0, frameCount - count));
  };

  const extractWindow = async (targetFrame, priority, initial = false, forcedStart = null) => {
    if (!frameWindowAdapter || disposed) return null;
    const count = Math.min(WINDOW_SIZE, frameCount);
    const startFrame = forcedStart === null ? windowStartFor(targetFrame) : clamp(forcedStart, 0, frameCount - count);
    const startedAt = Date.now();
    record('preview-window-started', { startFrame, count, priority });
    try {
      const result = await frameWindowAdapter.extractWindow({ startFrame, count, fps: currentFps, priority });
      if (disposed) return null;
      rememberWindow(result.frames);
      record('preview-window-completed', {
        startFrame,
        count: result.frames.length,
        durationMs: result.durationMs ?? Date.now() - startedAt,
        priority,
      });
      return result;
    } catch (error) {
      const cancelled = /superseded|busy|invalidated|disposed/i.test(error.message || '');
      record(cancelled ? 'preview-window-cancelled' : 'preview-window-failed', {
        startFrame,
        priority,
        durationMs: Date.now() - startedAt,
      });
      if (!cancelled && initial && !disposed) {
        publish({ ...state, previewPreparing: false, error: 'Could not prepare exact frames' });
      }
      throw error;
    }
  };

  const refillNearEdge = (frame) => {
    if (!frameWindowAdapter || backgroundPending || cache.size === 0) return;
    const frames = Array.from(cache.keys()).sort((a, b) => a - b);
    const low = frames[0];
    const high = frames[frames.length - 1];
    let start = null;
    if (frame >= high - REFILL_DISTANCE && high < frameCount - 1) start = high + 1;
    else if (frame <= low + REFILL_DISTANCE && low > 0) start = Math.max(0, low - WINDOW_SIZE);
    if (start === null) return;
    backgroundPending = true;
    extractWindow(frame, 'background', false, start)
      .catch(() => {})
      .then(() => {
        backgroundPending = false;
      });
  };

  const runPendingSeek = () => {
    if (ready && pendingSeek && !pendingSeek.nativeRequested) {
      pendingSeek.nativeRequested = true;
      pendingSeek.requestedAt = Date.now();
      record('seek-requested', { frame: pendingSeek.frame, time: pendingSeek.time });
      seek(pendingSeek.time);
    }
  };
  const finishPendingSeek = () => {
    if (!pendingSeek || !pendingSeek.nativeAcknowledged || !pendingSeek.exactReady) return;
    const completed = pendingSeek;
    pendingSeek = null;
    progressFloor = completed.playAfter ? completed.time - tolerance : null;
    lastProgressTime = completed.playAfter ? completed.time : null;
    publish({ ...state, playing: completed.playAfter, seeking: false });
  };
  const commitExactFrame = (frame, uri, requestId) => {
    if (requestId !== previewRequest || disposed) return;
    clearPreparationTimer();
    requestedFrame = frame;
    if (pendingSeek && pendingSeek.requestId === requestId) pendingSeek.exactReady = true;
    publish({ ...state, playheadFrame: frame, previewUri: uri, previewPreparing: false, error: null });
    refillNearEdge(frame);
    finishPendingSeek();
  };

  const requestSeek = (frame, playAfter, showPreview = false) => {
    const targetFrame = clamp(Math.round(frame), 0, frameCount - 1);
    requestedFrame = targetFrame;
    const requestId = ++previewRequest;
    const cachedUri = showPreview ? touch(targetFrame) : null;
    const exactReady = !showPreview || !frameWindowAdapter || Boolean(cachedUri);
    pendingSeek = {
      frame: targetFrame,
      time: targetFrame / currentFps,
      playAfter,
      requestId,
      exactReady,
      nativeAcknowledged: false,
      nativeRequested: false,
      requestedAt: null,
    };
    progressFloor = null;
    lastProgressTime = null;
    publish({
      ...state,
      ...(exactReady ? { playheadFrame: targetFrame } : {}),
      ...(cachedUri ? { previewUri: cachedUri } : {}),
      playing: false,
      seeking: true,
      previewPreparing: false,
      error: null,
    });
    runPendingSeek();

    if (!showPreview || !frameWindowAdapter) return Promise.resolve();
    if (cachedUri) {
      record('preview-cache-hit', { frame: targetFrame });
      refillNearEdge(targetFrame);
      return Promise.resolve(cachedUri);
    }

    record('preview-cache-miss', { frame: targetFrame });
    clearPreparationTimer();
    preparationTimer = setTimeout(() => {
      if (requestId === previewRequest && !disposed) publish({ ...state, previewPreparing: true });
    }, 250);
    return extractWindow(targetFrame, 'foreground')
      .then(() => {
        const uri = touch(targetFrame);
        if (!uri) throw new Error('Requested exact frame was not extracted');
        commitExactFrame(targetFrame, uri, requestId);
        return uri;
      })
      .catch((error) => {
        if (requestId !== previewRequest || disposed) return null;
        clearPreparationTimer();
        publish({ ...state, previewPreparing: false, seeking: false, error: 'Could not decode this frame' });
        return null;
      });
  };

  const updateRange = (inFrame, outFrame, message = 'Trim range must be at least one frame') => {
    const nextIn = clamp(Math.round(inFrame), 0, frameCount - 1);
    const nextOut = clamp(Math.round(outFrame), 1, frameCount);
    if (nextOut <= nextIn) return { ok: false, message };
    publish({ ...state, inFrame: nextIn, outFrame: nextOut });
    return { ok: true };
  };

  const prepare = async () => {
    if (!frameWindowAdapter || disposed) return;
    const requestId = ++previewRequest;
    publish({ ...state, previewPreparing: true, error: null });
    try {
      await extractWindow(requestedFrame, 'foreground', true);
      const uri = touch(requestedFrame);
      if (uri) commitExactFrame(requestedFrame, uri, requestId);
    } catch (error) {
      // Extraction has already published a useful state and diagnostic.
    }
  };

  return {
    getState: () => ({ ...state }),
    prepare,
    pause: () => publish({ ...state, playing: false }),
    seekFrame: (frame) => requestSeek(frame, false, true),
    stepFrames: (frames) => requestSeek(requestedFrame + frames, false, true),
    setRange: (inFrame, outFrame) => updateRange(inFrame, outFrame),
    setIn: () => updateRange(state.playheadFrame, state.outFrame, 'In must be before Out'),
    setOut: () => updateRange(state.inFrame, state.playheadFrame, 'Out must be after In'),
    setFps: (nextFps) => {
      if (!Number.isFinite(nextFps) || nextFps <= 0 || nextFps === currentFps) return;
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
      requestedFrame = playheadFrame;
      pendingSeek = null;
      previewRequest += 1;
      clearPreparationTimer();
      cache.clear();
      frameWindowAdapter?.clear?.();
      publish({
        ...state,
        frameCount,
        playheadFrame,
        inFrame,
        outFrame,
        playing: false,
        seeking: false,
        previewPreparing: false,
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
      if (!pendingSeek || !Number.isFinite(seekTime) || Math.abs(seekTime - pendingSeek.time) > tolerance) return;
      pendingSeek.nativeAcknowledged = true;
      record('seek-acknowledged', {
        frame: pendingSeek.frame,
        time: seekTime,
        durationMs: pendingSeek.requestedAt ? Date.now() - pendingSeek.requestedAt : null,
      });
      finishPendingSeek();
    },
    onProgress: ({ currentTime }) => {
      if (!state.playing || pendingSeek || !Number.isFinite(currentTime)) return;
      if (progressFloor !== null && currentTime < progressFloor) return;
      if (lastProgressTime !== null && currentTime + tolerance < lastProgressTime) return;
      progressFloor = null;
      if (currentTime < state.inFrame / currentFps - tolerance || currentTime >= state.outFrame / currentFps) {
        requestSeek(state.inFrame, true);
        return;
      }
      lastProgressTime = currentTime;
      requestedFrame = clamp(Math.round(currentTime * currentFps), 0, frameCount - 1);
      publish({ ...state, playheadFrame: requestedFrame });
    },
    onEnd: () => requestSeek(state.inFrame, true),
    onError: () => {
      pendingSeek = null;
      record('playback-error');
      publish({ ...state, playing: false, seeking: false, error: 'Video playback failed' });
    },
    dispose: () => {
      disposed = true;
      ready = false;
      pendingSeek = null;
      previewRequest += 1;
      clearPreparationTimer();
      cache.clear();
      frameWindowAdapter?.dispose?.();
    },
  };
};
