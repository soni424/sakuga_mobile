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
  duration,
  fps,
  position,
  rangeStart,
  rangeEnd,
  onSeek,
  onRangeChange,
  onInteractionStart,
}) => {
  const step = fps > 0 ? 1 / fps : 1 / 24;
  const renderThumb = useCallback(() => <Thumb />, []);
  const renderRail = useCallback(() => <Rail />, []);
  const renderRailSelected = useCallback(() => <RailSelected />, []);
  const renderNotch = useCallback(() => <Notch />, []);
  const renderLabel = useCallback((value) => <Label text={formatTime(value)} />, []);

  const handleSeek = useCallback(
    (value, ignored, fromUser) => {
      if (fromUser) {
        onSeek(value);
      }
    },
    [onSeek],
  );

  const handleRangeChange = useCallback(
    (low, high, fromUser) => {
      if (fromUser) {
        onRangeChange(low, high);
      }
    },
    [onRangeChange],
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
          max={duration}
          step={step}
          low={position}
          high={duration}
          disableRange
          floatingLabel
          renderThumb={renderThumb}
          renderRail={renderRail}
          renderRailSelected={renderRailSelected}
          renderLabel={renderLabel}
          renderNotch={renderNotch}
          onValueChanged={handleSeek}
          onTouchStart={onInteractionStart}
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
          max={duration}
          step={step}
          low={rangeStart}
          high={rangeEnd}
          floatingLabel
          renderThumb={renderThumb}
          renderRail={renderRail}
          renderRailSelected={renderRailSelected}
          renderLabel={renderLabel}
          renderNotch={renderNotch}
          onValueChanged={handleRangeChange}
          onTouchStart={onInteractionStart}
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
