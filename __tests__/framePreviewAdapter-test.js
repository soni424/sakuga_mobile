import { createFramePreviewAdapter } from '../util/framePreviewAdapter';

describe('Frame Preview Window Adapter', () => {
  it('extracts one exact, scaled window and maps its numbered PNGs to frames', async () => {
    let complete;
    const ffmpeg = {
      executeAsyncWithArguments: jest.fn((args, callback) => {
        complete = callback;
        return Promise.resolve(7);
      }),
      cancelExecution: jest.fn(),
    };
    const fs = {
      mkdir: jest.fn(() => Promise.resolve()),
      exists: jest.fn(() => Promise.resolve(true)),
      unlink: jest.fn(() => Promise.resolve()),
    };
    const adapter = createFramePreviewAdapter({
      url: 'https://example.com/video name.mp4?x=1&y=2',
      directory: '/cache/preview',
      ffmpeg,
      fs,
    });

    const result = adapter.extractWindow({ startFrame: 10, count: 25, fps: 24, priority: 'foreground' });
    await Promise.resolve();
    const args = ffmpeg.executeAsyncWithArguments.mock.calls[0][0];
    expect(args).toEqual(
      expect.arrayContaining([
        '-i',
        'https://example.com/video name.mp4?x=1&y=2',
        '-vf',
        "fps=24.000000:round=near,scale='min(1080,iw)':-2",
        '-frames:v',
        '25',
      ]),
    );
    complete({ returnCode: 0 });

    await expect(result).resolves.toMatchObject({
      startFrame: 10,
      frames: expect.arrayContaining([
        { frame: 10, uri: expect.stringContaining('window_1_001.png') },
        { frame: 34, uri: expect.stringContaining('window_1_025.png') },
      ]),
    });
  });

  it('lets foreground work cancel background but never the reverse', async () => {
    const callbacks = [];
    const ffmpeg = {
      executeAsyncWithArguments: jest.fn((args, callback) => {
        callbacks.push(callback);
        return Promise.resolve(callbacks.length);
      }),
      cancelExecution: jest.fn(),
    };
    const fs = {
      mkdir: jest.fn(() => Promise.resolve()),
      exists: jest.fn(() => Promise.resolve(true)),
      unlink: jest.fn(() => Promise.resolve()),
    };
    const adapter = createFramePreviewAdapter({ url: 'video.mp4', directory: '/cache/session', ffmpeg, fs });

    const background = adapter.extractWindow({ startFrame: 0, count: 25, fps: 24, priority: 'background' });
    await Promise.resolve();
    const foreground = adapter.extractWindow({ startFrame: 25, count: 25, fps: 24, priority: 'foreground' });
    await expect(background).rejects.toThrow('superseded');
    expect(ffmpeg.cancelExecution).toHaveBeenCalledWith(1);
    await Promise.resolve();
    callbacks[1]({ returnCode: 0 });
    await expect(foreground).resolves.toMatchObject({ startFrame: 25 });

    const nextBackground = adapter.extractWindow({ startFrame: 50, count: 25, fps: 24, priority: 'background' });
    await Promise.resolve();
    expect(ffmpeg.cancelExecution).toHaveBeenCalledTimes(1);
    callbacks[2]({ returnCode: 0 });
    await expect(nextBackground).resolves.toMatchObject({ startFrame: 50 });
  });
});
