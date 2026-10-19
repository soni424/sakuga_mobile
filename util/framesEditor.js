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

// Horizontal drag distance on the video that moves the playhead by one frame.
export const SCRUB_PIXELS_PER_FRAME = 14;

export const scrubTargetFrame = (startFrame, dx, frameCount, pixelsPerFrame = SCRUB_PIXELS_PER_FRAME) => {
  if (!Number.isFinite(dx) || frameCount <= 0) return Math.max(0, startFrame);
  return Math.max(0, Math.min(frameCount - 1, startFrame + Math.trunc(dx / pixelsPerFrame)));
};

// Largest odd number of filmstrip items that fits, so the playhead can sit in the middle.
export const filmstripSlots = (width, itemWidth) => {
  const fit = Math.floor(width / itemWidth);
  return Math.max(1, fit % 2 === 1 ? fit : fit - 1);
};

// Frames shown in the filmstrip: centred on the playhead, shifted at the ends so the strip stays full.
export const filmstripFrames = (playheadFrame, frameCount, slots) => {
  const count = Math.max(1, Math.min(slots, frameCount));
  const start = Math.max(0, Math.min(frameCount - count, playheadFrame - Math.floor(count / 2)));
  return Array.from({ length: count }, (_, index) => start + index);
};
