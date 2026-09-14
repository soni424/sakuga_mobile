const previewKey = (frame, time) => `${frame}_${time.toFixed(6)}`;

export const createFramePreviewAdapter = ({ url, directory, ffmpeg, fs, capacity = 15 }) => {
  const cache = new Map();
  let active = null;
  let disposed = false;

  const remember = async (key, path) => {
    cache.delete(key);
    cache.set(key, path);
    while (cache.size > capacity) {
      const oldestKey = cache.keys().next().value;
      const oldestPath = cache.get(oldestKey);
      cache.delete(oldestKey);
      try {
        await fs.unlink(oldestPath);
      } catch (error) {
        // Cache eviction is best effort.
      }
    }
  };

  const request = async (frame, time) => {
    if (disposed) {
      throw new Error('Frame preview adapter has been disposed');
    }
    const key = previewKey(frame, time);
    if (cache.has(key)) {
      const path = cache.get(key);
      cache.delete(key);
      cache.set(key, path);
      return path;
    }

    if (active) {
      ffmpeg.cancelExecution(active.executionId);
      active.reject(new Error('Frame preview superseded'));
      active = null;
    }

    await fs.mkdir(directory);
    const path = `${directory}/frame_${key}.png`;
    const fastSeek = Math.max(0, time - 1);
    const accurateSeek = time - fastSeek;
    const args = [
      '-y',
      '-nostats',
      '-loglevel',
      '0',
      '-ss',
      fastSeek.toFixed(6),
      '-i',
      url,
      '-ss',
      accurateSeek.toFixed(6),
      '-frames:v',
      '1',
      '-vsync',
      '0',
      path,
    ];

    return new Promise(async (resolve, reject) => {
      const finish = async ({ returnCode }) => {
        if (active && active.key === key) {
          active = null;
        }
        if (disposed || returnCode !== 0 || !(await fs.exists(path))) {
          reject(new Error(`Frame preview extraction failed with code ${returnCode}`));
          return;
        }
        await remember(key, path);
        resolve(path);
      };
      try {
        const executionId = await ffmpeg.executeAsyncWithArguments(args, finish);
        active = { key, executionId, reject };
      } catch (error) {
        reject(error);
      }
    });
  };

  const dispose = async () => {
    disposed = true;
    if (active) {
      ffmpeg.cancelExecution(active.executionId);
      active.reject(new Error('Frame preview adapter disposed'));
      active = null;
    }
    cache.clear();
    try {
      if (await fs.exists(directory)) {
        await fs.unlink(directory);
      }
    } catch (error) {
      // Session cache cleanup is best effort.
    }
  };

  const clear = async () => {
    if (active) {
      ffmpeg.cancelExecution(active.executionId);
      active.reject(new Error('Frame preview cache invalidated'));
      active = null;
    }
    const paths = Array.from(cache.values());
    cache.clear();
    await Promise.all(paths.map((path) => fs.unlink(path).catch(() => {})));
  };

  const prefetch = async (centerFrame, fps, frameCount) => {
    for (const offset of [1, -1, 2, -2, 3, -3]) {
      if (disposed) return;
      const frame = centerFrame + offset;
      if (frame < 0 || frame >= frameCount) continue;
      try {
        await request(frame, frame / fps);
      } catch (error) {
        // A user request cancels idle prefetching and takes priority.
        return;
      }
    }
  };

  return { request, prefetch, clear, dispose };
};
