const pad = (value) => String(value).padStart(3, '0');

export const createFramePreviewAdapter = ({ url, directory, ffmpeg, fs, maxWidth = 1080 }) => {
  let active = null;
  let disposed = false;
  let sequence = 0;
  let cleanup = null;

  const cancelActive = (reason) => {
    if (!active) return;
    const cancelled = active;
    active = null;
    cancelled.cancelled = true;
    if (cancelled.executionId !== null) ffmpeg.cancelExecution(cancelled.executionId);
    cancelled.reject(new Error(reason));
  };

  const extractWindow = async ({ startFrame, count, fps, priority = 'foreground' }) => {
    if (disposed) throw new Error('Frame preview adapter has been disposed');
    if (active) {
      if (priority === 'background' || (active.priority === 'foreground' && priority !== 'foreground')) {
        throw new Error('Frame preview adapter is busy');
      }
      cancelActive('Frame preview extraction superseded');
    }

    if (cleanup) await cleanup;
    if (disposed) throw new Error('Frame preview adapter has been disposed');
    await fs.mkdir(directory);
    const windowId = ++sequence;
    const startTime = startFrame / fps;
    const fastSeek = Math.max(0, startTime - 1);
    const accurateSeek = startTime - fastSeek;
    const outputPattern = `${directory}/window_${windowId}_%03d.png`;
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
      '-vf',
      `fps=${fps.toFixed(6)}:round=near,scale='min(${maxWidth},iw)':-2`,
      '-frames:v',
      String(count),
      '-start_number',
      '1',
      outputPattern,
    ];
    const startedAt = Date.now();

    return new Promise(async (resolve, reject) => {
      const job = { executionId: null, priority, windowId, reject, cancelled: false };
      active = job;
      const finish = async ({ returnCode }) => {
        if (job.cancelled || !active || active.windowId !== windowId) return;
        active = null;
        if (disposed || returnCode !== 0) {
          reject(new Error(`Frame preview extraction failed with code ${returnCode}`));
          return;
        }
        const frames = [];
        for (let index = 1; index <= count; index += 1) {
          const uri = `${directory}/window_${windowId}_${pad(index)}.png`;
          if (await fs.exists(uri)) frames.push({ frame: startFrame + index - 1, uri });
        }
        if (!frames.length) {
          reject(new Error('Frame preview extraction produced no images'));
          return;
        }
        resolve({ startFrame, frames, durationMs: Date.now() - startedAt });
      };

      try {
        const executionId = await ffmpeg.executeAsyncWithArguments(args, finish);
        job.executionId = executionId;
        if (job.cancelled) {
          ffmpeg.cancelExecution(executionId);
          return;
        }
        if (disposed) {
          ffmpeg.cancelExecution(executionId);
          reject(new Error('Frame preview adapter has been disposed'));
          return;
        }
      } catch (error) {
        if (active === job) active = null;
        reject(error);
      }
    });
  };

  const clear = async () => {
    cancelActive('Frame preview cache invalidated');
    cleanup = (async () => {
      try {
        if (await fs.exists(directory)) await fs.unlink(directory);
      } catch (error) {
        // Session cache cleanup is best effort.
      }
    })();
    await cleanup;
  };

  const dispose = async () => {
    disposed = true;
    cancelActive('Frame preview adapter disposed');
    cleanup = (async () => {
      try {
        if (await fs.exists(directory)) await fs.unlink(directory);
      } catch (error) {
        // Session cache cleanup is best effort.
      }
    })();
    await cleanup;
  };

  const removePreview = (uri) => fs.unlink(uri).catch(() => {});

  return { extractWindow, removePreview, clear, dispose };
};
