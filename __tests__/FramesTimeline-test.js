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
    const onSeek = jest.fn();
    const onRangeChange = jest.fn();
    const onInteractionStart = jest.fn();
    const tree = renderer.create(
      <FramesTimeline
        duration={60}
        fps={24}
        position={10}
        rangeStart={5}
        rangeEnd={40}
        onSeek={onSeek}
        onRangeChange={onRangeChange}
        onInteractionStart={onInteractionStart}
      />,
    );

    const playhead = tree.root.findByProps({ testID: 'playhead-slider' });
    act(() => playhead.props.onTouchStart());
    act(() => playhead.props.onValueChanged(12.5, 60, true));

    expect(onInteractionStart).toHaveBeenCalled();
    expect(onSeek).toHaveBeenCalledWith(12.5);
    expect(onRangeChange).not.toHaveBeenCalled();
  });

  it('updates the trim range independently of the playhead', () => {
    const onSeek = jest.fn();
    const onRangeChange = jest.fn();
    const tree = renderer.create(
      <FramesTimeline
        duration={60}
        fps={24}
        position={10}
        rangeStart={5}
        rangeEnd={40}
        onSeek={onSeek}
        onRangeChange={onRangeChange}
        onInteractionStart={jest.fn()}
      />,
    );

    const range = tree.root.findByProps({ testID: 'trim-range-slider' });
    act(() => range.props.onValueChanged(6, 39, true));

    expect(onRangeChange).toHaveBeenCalledWith(6, 39);
    expect(onSeek).not.toHaveBeenCalled();
  });
});
