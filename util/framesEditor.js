const FALLBACK_FPS = 24;

const parseRate = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const [numerator, denominator = '1'] = value.split('/').map(Number);
  const result = numerator / denominator;
  return Number.isFinite(result) && result > 0 ? result : null;
};

export const parseSourceFrameRate = (streams = []) => {
  const videoStream = streams.find((stream) => stream.codec_type === 'video') || streams[0] || {};
  return parseRate(videoStream.avg_frame_rate) || parseRate(videoStream.r_frame_rate) || FALLBACK_FPS;
};

export const getTotalFrames = (duration, fps) => {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(duration * fps));
};

export const timeToFrame = (time, fps, totalFrames) => {
  if (!Number.isFinite(time) || !Number.isFinite(fps) || fps <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(totalFrames, Math.round(time * fps)));
};

export const frameToTime = (frame, fps, duration) => {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(duration, frame / fps));
};
