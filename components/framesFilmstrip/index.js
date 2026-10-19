import React, { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { filmstripFrames, filmstripSlots } from '../../util/framesEditor';

const ITEM_WIDTH = 50;
const ITEM_SPACING = 4;
const HORIZONTAL_PADDING = 18;

const fileUri = (path) => (Platform.OS === 'android' && path ? `file://${path}` : path);

const FilmstripItem = memo(({ frame, uri, current, outsideRange, flipped, onSelectFrame }) => (
  <TouchableOpacity
    testID={`filmstrip-frame-${frame}`}
    activeOpacity={0.7}
    style={[styles.item, outsideRange && styles.outsideRange]}
    onPress={() => onSelectFrame(frame)}>
    <View style={[styles.thumbnail, current && styles.currentThumbnail]}>
      {uri ? (
        <Image
          style={[styles.image, flipped && styles.flipped]}
          resizeMode="cover"
          resizeMethod="resize"
          source={{ uri: fileUri(uri) }}
        />
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
    <Text style={[styles.label, current && styles.currentLabel]}>{frame + 1}</Text>
  </TouchableOpacity>
));

export const FramesFilmstrip = ({
  frameCount,
  playheadFrame,
  inFrame,
  outFrame,
  cachedFrames,
  flipped,
  onSelectFrame,
}) => {
  const { width } = useWindowDimensions();
  const slots = filmstripSlots(width - HORIZONTAL_PADDING * 2, ITEM_WIDTH + ITEM_SPACING);
  const frames = filmstripFrames(playheadFrame, frameCount, slots);

  return (
    <View style={styles.container}>
      <View style={styles.strip}>
        {frames.map((frame) => (
          <FilmstripItem
            key={frame}
            frame={frame}
            uri={cachedFrames[frame]}
            current={frame === playheadFrame}
            outsideRange={frame < inFrame || frame >= outFrame}
            flipped={flipped}
            onSelectFrame={onSelectFrame}
          />
        ))}
      </View>
      <Text style={styles.hint}>Tap a frame or swipe the video to scrub</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', paddingHorizontal: HORIZONTAL_PADDING, marginBottom: 10 },
  strip: { flexDirection: 'row', justifyContent: 'center' },
  item: { width: ITEM_WIDTH, marginHorizontal: ITEM_SPACING / 2, alignItems: 'center' },
  outsideRange: { opacity: 0.35 },
  thumbnail: {
    width: ITEM_WIDTH,
    height: 30,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  currentThumbnail: { borderColor: '#E3170A' },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, backgroundColor: '#1A1A1A' },
  flipped: { transform: [{ scaleX: -1 }] },
  label: { marginTop: 2, color: '#808080', fontSize: 10, fontVariant: ['tabular-nums'] },
  currentLabel: { color: '#E3170A', fontWeight: '700' },
  hint: { marginTop: 6, color: '#808080', fontSize: 11, textAlign: 'center' },
});
