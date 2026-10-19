import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';
import { BufferedFrameImage } from '../components/bufferedFrameImage';

const images = (tree) => tree.root.findAllByType(Image);
const layer = (tree, uri) => images(tree).find((node) => node.props.source.uri === uri);
const shownUri = (tree) => {
  const shown = images(tree).filter((node) => node.props.testID === 'preview');
  return shown.length ? shown[0].props.source.uri : null;
};
const isHidden = (node) =>
  []
    .concat(...[node.props.style])
    .flat(Infinity)
    .some((s) => s && s.opacity === 0);

describe('BufferedFrameImage', () => {
  it('keeps the current frame on screen until the next one has decoded', () => {
    let tree;
    act(() => {
      tree = renderer.create(<BufferedFrameImage testID="preview" uri="f1" />);
    });
    act(() => layer(tree, 'f1').props.onLoad());
    expect(shownUri(tree)).toBe('f1');

    act(() => tree.update(<BufferedFrameImage testID="preview" uri="f2" />));
    expect(shownUri(tree)).toBe('f1');
    expect(isHidden(layer(tree, 'f2'))).toBe(true);

    act(() => layer(tree, 'f2').props.onLoad());
    expect(shownUri(tree)).toBe('f2');
    expect(layer(tree, 'f1')).toBeUndefined();
  });

  it('never changes the source of a mounted layer, only which one is visible', () => {
    let tree;
    act(() => {
      tree = renderer.create(<BufferedFrameImage testID="preview" uri="f2" preloadUris={['f1', 'f3']} />);
    });
    ['f1', 'f2', 'f3'].forEach((uri) => act(() => layer(tree, uri).props.onLoad()));
    const instances = images(tree).map((node) => node.instance);

    act(() => tree.update(<BufferedFrameImage testID="preview" uri="f3" preloadUris={['f2', 'f4']} />));
    expect(shownUri(tree)).toBe('f3');
    // f3 was already decoded, so it shows in the same render, using the same mounted layer.
    expect(instances).toContain(layer(tree, 'f3').instance);
    expect(isHidden(layer(tree, 'f2'))).toBe(true);
    expect(layer(tree, 'f1')).toBeUndefined();
  });

  it('disables the Android fade-in on every layer', () => {
    let tree;
    act(() => {
      tree = renderer.create(<BufferedFrameImage testID="preview" uri="f2" preloadUris={['f1', 'f3', undefined]} />);
    });
    expect(images(tree)).toHaveLength(3);
    expect(images(tree).every((node) => node.props.fadeDuration === 0)).toBe(true);
  });
});
