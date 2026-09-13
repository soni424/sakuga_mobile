import { getTotalFrames, parseSourceFrameRate, frameToTime, timeToFrame } from '../util/framesEditor';

describe('Frames editor timing', () => {
  it('reads fractional FPS from the video stream even when audio is listed first', () => {
    const streams = [
      { codec_type: 'audio', avg_frame_rate: '0/0' },
      { codec_type: 'video', avg_frame_rate: '24000/1001' },
    ];

    expect(parseSourceFrameRate(streams)).toBeCloseTo(23.976, 3);
  });

  it('falls back to 24 FPS when metadata has no valid video frame rate', () => {
    expect(parseSourceFrameRate([{ codec_type: 'video', avg_frame_rate: '0/0' }])).toBe(24);
  });

  it('converts through frame indexes without drifting and clamps to the video bounds', () => {
    expect(getTotalFrames(26.69, 24)).toBe(641);
    expect(timeToFrame(1, 24, 641)).toBe(24);
    expect(frameToTime(24, 24, 26.69)).toBe(1);
    expect(frameToTime(-3, 24, 26.69)).toBe(0);
    expect(frameToTime(9999, 24, 26.69)).toBe(26.69);
  });
});
