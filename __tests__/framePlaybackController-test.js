import { createFramesPlaybackController } from '../util/framePlaybackController';

describe('Frames Playback Controller', () => {
  const createWindowAdapter = () => {
    const pending = [];
    return {
      pending,
      extractWindow: jest.fn((request) => new Promise((resolve, reject) => pending.push({ request, resolve, reject }))),
      clear: jest.fn(() => Promise.resolve()),
      dispose: jest.fn(() => Promise.resolve()),
    };
  };

  const resolveWindow = (pending, index, startFrame, count = 25) => {
    pending[index].resolve({
      startFrame,
      frames: Array.from({ length: count }, (_, offset) => ({
        frame: startFrame + offset,
        uri: `frame-${startFrame + offset}.png`,
      })),
      durationMs: 100,
    });
  };

  it('prepares 25 frames and commits cached stepping without a preparation state', async () => {
    const adapter = createWindowAdapter();
    const controller = createFramesPlaybackController({
      duration: 10,
      fps: 24,
      seek: jest.fn(),
      frameWindowAdapter: adapter,
    });

    const priming = controller.prepare();
    expect(adapter.extractWindow).toHaveBeenCalledWith(
      expect.objectContaining({ startFrame: 0, count: 25, priority: 'foreground' }),
    );
    resolveWindow(adapter.pending, 0, 0);
    await priming;
    expect(controller.getState()).toMatchObject({
      playheadFrame: 0,
      previewUri: 'frame-0.png',
      previewPreparing: false,
    });

    controller.stepFrames(3);
    expect(controller.getState()).toMatchObject({
      playheadFrame: 3,
      previewUri: 'frame-3.png',
      previewPreparing: false,
    });
    expect(adapter.extractWindow).toHaveBeenCalledTimes(1);
  });

  it('keeps the confirmed frame on a cache miss until the latest exact preview is ready', async () => {
    jest.useFakeTimers();
    const adapter = createWindowAdapter();
    const controller = createFramesPlaybackController({
      duration: 10,
      fps: 24,
      seek: jest.fn(),
      frameWindowAdapter: adapter,
    });
    const priming = controller.prepare();
    resolveWindow(adapter.pending, 0, 0);
    await priming;

    const jump = controller.seekFrame(120);
    expect(controller.getState()).toMatchObject({
      playheadFrame: 0,
      previewUri: 'frame-0.png',
      previewPreparing: false,
    });
    jest.advanceTimersByTime(251);
    expect(controller.getState()).toMatchObject({ playheadFrame: 0, previewPreparing: true });
    resolveWindow(adapter.pending, 1, 108);
    await jump;
    expect(controller.getState()).toMatchObject({
      playheadFrame: 120,
      previewUri: 'frame-120.png',
      previewPreparing: false,
    });
    jest.useRealTimers();
  });

  it('refills forward in one background window near the buffered edge', async () => {
    const adapter = createWindowAdapter();
    const controller = createFramesPlaybackController({
      duration: 10,
      fps: 24,
      seek: jest.fn(),
      frameWindowAdapter: adapter,
    });
    const priming = controller.prepare();
    resolveWindow(adapter.pending, 0, 0);
    await priming;

    controller.seekFrame(18);
    expect(adapter.extractWindow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startFrame: 25,
        count: 25,
        priority: 'background',
      }),
    );
    resolveWindow(adapter.pending, 1, 25);
    await Promise.resolve();
  });

  it('ignores a superseded foreground window when rapid jumps finish out of order', async () => {
    const adapter = createWindowAdapter();
    const controller = createFramesPlaybackController({
      duration: 20,
      fps: 24,
      seek: jest.fn(),
      frameWindowAdapter: adapter,
    });
    const priming = controller.prepare();
    resolveWindow(adapter.pending, 0, 0);
    await priming;

    const first = controller.seekFrame(120);
    const latest = controller.seekFrame(240);
    resolveWindow(adapter.pending, 1, 108);
    await first;
    expect(controller.getState().playheadFrame).toBe(0);
    resolveWindow(adapter.pending, 2, 228);
    await latest;
    expect(controller.getState()).toMatchObject({ playheadFrame: 240, previewUri: 'frame-240.png' });
  });

  it('records cache, window, and native seek timing diagnostics without media identifiers', async () => {
    const diagnostics = [];
    const adapter = createWindowAdapter();
    const controller = createFramesPlaybackController({
      duration: 10,
      fps: 24,
      seek: jest.fn(),
      frameWindowAdapter: adapter,
      onDiagnostic: (event) => diagnostics.push(event),
    });
    const priming = controller.prepare();
    resolveWindow(adapter.pending, 0, 0);
    await priming;
    controller.onPlayerReady();
    controller.stepFrames(1);
    controller.onSeek({ seekTime: 1 / 24 });

    expect(diagnostics.map(({ event }) => event)).toEqual(
      expect.arrayContaining([
        'preview-window-started',
        'preview-window-completed',
        'preview-cache-hit',
        'seek-requested',
        'seek-acknowledged',
      ]),
    );
    expect(JSON.stringify(diagnostics)).not.toMatch(/https?:|account|url/i);
  });

  it('queues a frame seek until the native player is ready', () => {
    const seek = jest.fn();
    const controller = createFramesPlaybackController({ duration: 10, fps: 24, seek });

    controller.seekFrame(120);

    expect(controller.getState()).toMatchObject({ playheadFrame: 120, playing: false, seeking: true });
    expect(seek).not.toHaveBeenCalled();

    controller.onPlayerReady();

    expect(seek).toHaveBeenCalledWith(5);
  });

  it('waits for seek acknowledgement and ignores stale zero progress before playing', () => {
    const seek = jest.fn();
    const controller = createFramesPlaybackController({ duration: 10, fps: 24, seek });
    controller.onPlayerReady();
    controller.seekFrame(120);
    controller.onSeek({ seekTime: 5, currentTime: 5 });

    controller.togglePlay();
    controller.onProgress({ currentTime: 0 });

    expect(seek).toHaveBeenLastCalledWith(5);
    expect(controller.getState()).toMatchObject({ playheadFrame: 120, playing: false, seeking: true });

    controller.onSeek({ seekTime: 5, currentTime: 5 });
    controller.onProgress({ currentTime: 0 });

    expect(controller.getState()).toMatchObject({ playheadFrame: 120, playing: true, seeking: false });
  });

  it('loops at the exclusive Out boundary without accepting progress from zero', () => {
    const seek = jest.fn();
    const controller = createFramesPlaybackController({ duration: 20, fps: 24, seek });
    controller.onPlayerReady();
    expect(controller.setRange(120, 240)).toEqual({ ok: true });
    controller.seekFrame(180);
    controller.onSeek({ seekTime: 7.5, currentTime: 7.5 });
    controller.togglePlay();
    controller.onSeek({ seekTime: 7.5, currentTime: 7.5 });

    controller.onProgress({ currentTime: 10 });

    expect(seek).toHaveBeenLastCalledWith(5);
    expect(controller.getState()).toMatchObject({ playheadFrame: 120, playing: false, seeking: true });

    controller.onProgress({ currentTime: 0 });
    controller.onSeek({ seekTime: 5, currentTime: 5 });
    expect(controller.getState()).toMatchObject({ playheadFrame: 120, playing: true, seeking: false });
  });

  it('ignores delayed out-of-order progress while playing', () => {
    const controller = createFramesPlaybackController({ duration: 10, fps: 24, seek: jest.fn() });
    controller.onPlayerReady();
    controller.seekFrame(120);
    controller.onSeek({ seekTime: 5, currentTime: 5 });
    controller.togglePlay();
    controller.onSeek({ seekTime: 5, currentTime: 5 });
    controller.onProgress({ currentTime: 6 });
    controller.onProgress({ currentTime: 5.2 });
    expect(controller.getState().playheadFrame).toBe(144);
  });

  it('steps from the authoritative frame and clamps at both video boundaries', () => {
    const controller = createFramesPlaybackController({ duration: 1, fps: 24, seek: jest.fn() });

    controller.stepFrames(-3);
    expect(controller.getState().playheadFrame).toBe(0);

    controller.seekFrame(22);
    controller.stepFrames(3);
    expect(controller.getState().playheadFrame).toBe(23);
  });

  it('keeps the requested frame authoritative when Android reports a nearby decoded time', () => {
    const controller = createFramesPlaybackController({ duration: 10, fps: 24, seek: jest.fn() });
    controller.onPlayerReady();
    controller.seekFrame(121);
    controller.onSeek({ seekTime: 121 / 24, currentTime: 5 });
    expect(controller.getState().playheadFrame).toBe(121);
  });

  it('preserves playhead and trim times when the effective FPS changes', () => {
    const controller = createFramesPlaybackController({ duration: 10, fps: 24, seek: jest.fn() });
    controller.setRange(48, 192);
    controller.seekFrame(120);

    controller.setFps(30);

    expect(controller.getState()).toMatchObject({
      frameCount: 300,
      playheadFrame: 150,
      inFrame: 60,
      outFrame: 240,
      playing: false,
    });
  });

  it('sets In and Out without seeking or accepting an empty range', () => {
    const seek = jest.fn();
    const controller = createFramesPlaybackController({ duration: 10, fps: 24, seek });
    controller.seekFrame(100);
    seek.mockClear();

    expect(controller.setIn()).toEqual({ ok: true });
    controller.seekFrame(180);
    seek.mockClear();
    expect(controller.setOut()).toEqual({ ok: true });
    expect(controller.getState()).toMatchObject({ inFrame: 100, outFrame: 180 });
    expect(seek).not.toHaveBeenCalled();

    controller.seekFrame(100);
    expect(controller.setOut()).toEqual({ ok: false, message: 'Out must be after In' });
    expect(controller.getState().outFrame).toBe(180);
  });
});
