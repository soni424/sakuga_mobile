import { createFramesPlaybackController } from '../util/framePlaybackController';

describe('Frames Playback Controller', () => {
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

  it('keeps the previous preview until the latest requested frame is decoded', async () => {
    const resolves = {};
    const requestPreview = jest.fn(
      (frame) => new Promise((resolve) => {
        resolves[frame] = resolve;
      }),
    );
    const controller = createFramesPlaybackController({ duration: 10, fps: 24, seek: jest.fn(), requestPreview });

    controller.seekFrame(1);
    controller.seekFrame(2);
    resolves[1]('frame-1.png');
    await Promise.resolve();

    expect(controller.getState()).toMatchObject({ playheadFrame: 2, previewLoading: true, previewUri: null });

    resolves[2]('frame-2.png');
    await Promise.resolve();
    expect(controller.getState()).toMatchObject({ previewLoading: false, previewUri: 'frame-2.png' });
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
