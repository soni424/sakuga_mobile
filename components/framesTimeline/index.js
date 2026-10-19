import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import RangeSlider from 'rn-range-slider';
import Thumb from '../slider/thumb';
import Rail from '../slider/rail';
import RailSelected from '../slider/railSelected';
import Label from '../slider/label';
import Notch from '../slider/notch';

const formatTime = (seconds) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
};

export const FramesTimeline = ({
  duration: mediaDuration,
  frameCount,
  fps,
  playheadFrame,
  inFrame,
  outFrame,
  onSeekFrame,
  onRangeChangeFrames,
  onInteractionStart,
  onInteractionEnd,
}) => {
  const safeFps = fps > 0 ? fps : 24;
  // Prefer the probed media duration so this matches the rest of the screen; the frame count is rounded up.
  const duration = Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : frameCount / safeFps;
  const position = playheadFrame / safeFps;
  const rangeStart = inFrame / safeFps;
  const rangeEnd = Math.min(duration, outFrame / safeFps);
  const renderThumb = useCallback(() => <Thumb />, []);
  const renderRail = useCallback(() => <Rail />, []);
  const renderRailSelected = useCallback(() => <RailSelected />, []);
  const renderNotch = useCallback(() => <Notch />, []);
  const renderLabel = useCallback((value) => <Label text={formatTime(value)} />, []);

  const handleSeek = useCallback(
    (value, ignored, fromUser) => {
      if (fromUser) {
        onSeekFrame(value);
      }
    },
    [onSeekFrame],
  );

  const handleRangeChange = useCallback(
    (low, high, fromUser) => {
      if (fromUser) {
        onRangeChangeFrames(low, high);
      }
    },
    [onRangeChangeFrames],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>PLAYHEAD</Text>
        <Text style={styles.value}>{`${formatTime(position)} / ${formatTime(duration)}`}</Text>
      </View>
      <View style={styles.sliderTouchArea}>
        <RangeSlider
          testID="playhead-slider"
          min={0}
          max={Math.max(0, frameCount - 1)}
          step={1}
          low={playheadFrame}
          high={Math.max(0, frameCount - 1)}
          disableRange
          floatingLabel
          renderThumb={renderThumb}
          renderRail={renderRail}
          renderRailSelected={renderRailSelected}
          renderLabel={renderLabel}
          renderNotch={renderNotch}
          onValueChanged={handleSeek}
          onTouchStart={onInteractionStart}
          onTouchEnd={() => onInteractionEnd('playhead')}
        />
      </View>

      <View style={styles.headingRow}>
        <Text style={styles.heading}>TRIM RANGE</Text>
        <Text style={styles.value}>{`${formatTime(rangeStart)} – ${formatTime(rangeEnd)}`}</Text>
      </View>
      <View style={styles.sliderTouchArea}>
        <RangeSlider
          testID="trim-range-slider"
          min={0}
          max={frameCount}
          step={1}
          low={inFrame}
          high={outFrame}
          floatingLabel
          renderThumb={renderThumb}
          renderRail={renderRail}
          renderRailSelected={renderRailSelected}
          renderLabel={renderLabel}
          renderNotch={renderNotch}
          onValueChanged={handleRangeChange}
          onTouchStart={onInteractionStart}
          onTouchEnd={() => onInteractionEnd('range')}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 18,
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    color: '#808080',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  value: {
    color: '#D4D4D4',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  sliderTouchArea: {
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 6,
  },
});
