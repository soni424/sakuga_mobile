import React, { useReducer, useRef } from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Shows exact frame images with no blank moment between them.
// Every frame gets its own Image layer whose source never changes; layers decode while
// invisible (opacity 0) and stepping only flips which layer is opaque. Changing an Image's
// source on Android clears it for a frame before drawing, so this component never does that.
// The current frame stays visible until the requested one has decoded, and neighbouring
// frames are kept decoded so stepping to them is instant.
export const BufferedFrameImage = ({ uri, visible = true, preloadUris = [], imageStyle, stageStyle, testID }) => {
  const [, rerender] = useReducer((count) => count + 1, 0);
  const loaded = useRef(new Set());
  const displayed = useRef(null);
  const order = useRef([]);
  const requested = useRef(uri);
  requested.current = uri;

  if (uri && loaded.current.has(uri)) displayed.current = uri;

  // Keep existing layers in place (moving a native image view can make it redraw) and append new ones.
  const wanted = [uri, displayed.current, ...preloadUris].filter(
    (layerUri, index, all) => layerUri && all.indexOf(layerUri) === index,
  );
  order.current = [
    ...order.current.filter((layerUri) => wanted.includes(layerUri)),
    ...wanted.filter((layerUri) => !order.current.includes(layerUri)),
  ];
  loaded.current.forEach((layerUri) => {
    if (!order.current.includes(layerUri)) loaded.current.delete(layerUri);
  });

  const onLoad = (layerUri) => () => {
    loaded.current.add(layerUri);
    if (layerUri === requested.current) rerender();
  };

  return (
    // Stays mounted while hidden (during playback) so the last frame is ready the moment it pauses.
    <View style={[styles.stage, stageStyle, !visible && styles.hidden]} pointerEvents="none">
      {order.current.map((layerUri) => {
        const shown = layerUri === displayed.current;
        return (
          <Image
            key={layerUri}
            testID={shown ? testID : `${testID}-buffer`}
            style={[styles.layer, imageStyle, !shown && styles.hidden]}
            resizeMode="contain"
            fadeDuration={0}
            source={{ uri: layerUri }}
            onLoad={onLoad(layerUri)}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  stage: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  layer: { ...StyleSheet.absoluteFillObject },
  hidden: { opacity: 0 },
});
