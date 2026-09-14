import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { FramesTimeline } from '../components/framesTimeline';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('rn-range-slider', () => 'RangeSlider');

describe('FramesTimeline', () => {
  it('seeks with the playhead without changing the selected trim range', () => {
    const onSeekFrame = jest.fn();
    const onRangeChangeFrames = jest.fn();
    const onInteractionStart = jest.fn();
    const onInteractionEnd = jest.fn();
    const tree = renderer.create(
      <FramesTimeline
        frameCount={1440}
        fps={24}
        playheadFrame={240}
        inFrame={120}
        outFrame={960}
        onSeekFrame={onSeekFrame}
        onRangeChangeFrames={onRangeChangeFrames}
        onInteractionStart={onInteractionStart}
        onInteractionEnd={onInteractionEnd}
      />,
    );

    const playhead = tree.root.findByProps({ testID: 'playhead-slider' });
    act(() => playhead.props.onTouchStart());
    act(() => playhead.props.onValueChanged(300, 1439, true));
    act(() => playhead.props.onTouchEnd());

    expect(onInteractionStart).toHaveBeenCalled();
    expect(onSeekFrame).toHaveBeenCalledWith(300);
    expect(onInteractionEnd).toHaveBeenCalledWith('playhead');
    expect(onRangeChangeFrames).not.toHaveBeenCalled();
  });

  it('updates the trim range independently of the playhead', () => {
    const onSeekFrame = jest.fn();
    const onRangeChangeFrames = jest.fn();
    const tree = renderer.create(
      <FramesTimeline
        frameCount={1440}
        fps={24}
        playheadFrame={240}
        inFrame={120}
        outFrame={960}
        onSeekFrame={onSeekFrame}
        onRangeChangeFrames={onRangeChangeFrames}
        onInteractionStart={jest.fn()}
        onInteractionEnd={jest.fn()}
      />,
    );

    const range = tree.root.findByProps({ testID: 'trim-range-slider' });
    act(() => range.props.onValueChanged(144, 936, true));

    expect(onRangeChangeFrames).toHaveBeenCalledWith(144, 936);
    expect(onSeekFrame).not.toHaveBeenCalled();
  });
});
