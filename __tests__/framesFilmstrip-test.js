import React from 'react';
import renderer from 'react-test-renderer';
import { FramesFilmstrip } from '../components/framesFilmstrip';
import { filmstripFrames, filmstripSlots, scrubTargetFrame } from '../util/framesEditor';
import { createFramesPlaybackController } from '../util/framePlaybackController';

describe('Frame scrubbing helpers', () => {
  it('moves one frame per 14px of drag and clamps to the clip', () => {
    expect(scrubTargetFrame(10, 13, 100)).toBe(10);
    expect(scrubTargetFrame(10, 14, 100)).toBe(11);
    expect(scrubTargetFrame(10, -42, 100)).toBe(7);
    expect(scrubTargetFrame(2, -500, 100)).toBe(0);
    expect(scrubTargetFrame(98, 500, 100)).toBe(99);
  });

  it('fits an odd number of filmstrip slots', () => {
    expect(filmstripSlots(354, 54)).toBe(5);
    expect(filmstripSlots(400, 54)).toBe(7);
    expect(filmstripSlots(20, 54)).toBe(1);
  });

  it('centres the strip on the playhead and keeps it full at the ends', () => {
    expect(filmstripFrames(50, 100, 7)).toEqual([47, 48, 49, 50, 51, 52, 53]);
    expect(filmstripFrames(1, 100, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(filmstripFrames(99, 100, 7)).toEqual([93, 94, 95, 96, 97, 98, 99]);
    expect(filmstripFrames(0, 3, 7)).toEqual([0, 1, 2]);
  });
});

describe('FramesFilmstrip', () => {
  it('shows cached thumbnails, 1-based labels, and selects tapped frames', () => {
    const onSelectFrame = jest.fn();
    const tree = renderer.create(
      <FramesFilmstrip
        frameCount={100}
        playheadFrame={50}
        inFrame={0}
        outFrame={100}
        cachedFrames={{ 50: '/cache/frame_50.png' }}
        flipped={false}
        onSelectFrame={onSelectFrame}
      />,
    );
    const current = tree.root.findByProps({ testID: 'filmstrip-frame-50' });
    expect(tree.root.findAllByType('Image')).toHaveLength(1);
    expect(tree.root.findAllByProps({ children: 51 }).length).toBeGreaterThan(0);

    current.props.onPress();
    expect(onSelectFrame).toHaveBeenCalledWith(50);
  });
});

describe('Frames playback controller cache reporting', () => {
  it('reports cached frames after a window is extracted and clears them on FPS change', async () => {
    const onCacheChange = jest.fn();
    const adapter = {
      extractWindow: jest.fn(({ startFrame, count }) =>
        Promise.resolve({
          startFrame,
          frames: Array.from({ length: count }, (_, i) => ({ frame: startFrame + i, uri: `f${startFrame + i}.png` })),
        }),
      ),
      clear: jest.fn(),
    };
    const controller = createFramesPlaybackController({
      duration: 10,
      fps: 24,
      seek: jest.fn(),
      frameWindowAdapter: adapter,
      onCacheChange,
    });

    await controller.prepare();
    const reported = onCacheChange.mock.calls[onCacheChange.mock.calls.length - 1][0];
    expect(Object.keys(reported)).toHaveLength(25);
    expect(reported[3]).toBe('f3.png');

    controller.setFps(30);
    expect(onCacheChange).toHaveBeenCalledWith({});
  });
});
