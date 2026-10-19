import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Shows exact frame images without flashing black between them. The frame on screen stays
// until the next one has decoded (it loads invisibly on top, then takes over), Android's
// default fade-in is disabled, and neighbouring frames are decoded ahead of time so
// stepping to them is instant.
export const BufferedFrameImage = ({ uri, visible = true, preloadUris = [], imageStyle, testID }) => {
  const [shownUri, setShownUri] = useState(uri);
  const [pendingUri, setPendingUri] = useState(null);

  useEffect(() => {
    setPendingUri(uri === shownUri ? null : uri);
  }, [uri, shownUri]);

  const onPendingLoad = (loadedUri) => () => setShownUri(loadedUri);

  return (
    // Stays mounted while hidden (during playback) so the last frame is ready the moment it pauses.
    <View style={[styles.stage, !visible && styles.hidden]} pointerEvents="none">
      {shownUri && (
        <Image
          testID={testID}
          style={[styles.layer, imageStyle]}
          resizeMode="contain"
          fadeDuration={0}
          source={{ uri: shownUri }}
        />
      )}
      {pendingUri && (
        <Image
          key={pendingUri}
          testID={`${testID}-pending`}
          style={[styles.layer, imageStyle, styles.hidden]}
          resizeMode="contain"
          fadeDuration={0}
          source={{ uri: pendingUri }}
          onLoad={onPendingLoad(pendingUri)}
          onError={onPendingLoad(pendingUri)}
        />
      )}
      {preloadUris
        .filter((preloadUri) => preloadUri && preloadUri !== shownUri && preloadUri !== pendingUri)
        .map((preloadUri) => (
          <Image
            key={preloadUri}
            style={[styles.layer, imageStyle, styles.hidden]}
            resizeMode="contain"
            fadeDuration={0}
            source={{ uri: preloadUri }}
          />
        ))}
    </View>
  );
};

const styles = StyleSheet.create({
  stage: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  layer: { ...StyleSheet.absoluteFillObject },
  hidden: { opacity: 0 },
});
