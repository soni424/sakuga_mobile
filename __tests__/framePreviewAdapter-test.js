import { createFramePreviewAdapter } from '../util/framePreviewAdapter';

describe('Frame Preview Adapter', () => {
  it('decodes with safe arguments and reuses a cached exact frame', async () => {
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

    const first = adapter.request(24, 1);
    await Promise.resolve();
    expect(ffmpeg.executeAsyncWithArguments.mock.calls[0][0]).toEqual(
      expect.arrayContaining(['-i', 'https://example.com/video name.mp4?x=1&y=2', '-frames:v', '1']),
    );
    complete({ returnCode: 0 });
    await expect(first).resolves.toBe('/cache/preview/frame_24_1.000000.png');

    await expect(adapter.request(24, 1)).resolves.toBe('/cache/preview/frame_24_1.000000.png');
    expect(ffmpeg.executeAsyncWithArguments).toHaveBeenCalledTimes(1);
  });

  it('cancels an older extraction when a newer frame is requested', async () => {
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
    const oldRequest = adapter.request(1, 1 / 24);
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks).toHaveLength(1);
    const latestRequest = adapter.request(2, 2 / 24);
    await Promise.resolve();
    await Promise.resolve();
    await expect(oldRequest).rejects.toThrow('superseded');
    expect(ffmpeg.cancelExecution).toHaveBeenCalledWith(1);
    callbacks[1]({ returnCode: 0 });
    await expect(latestRequest).resolves.toContain('frame_2_');
  });
});
