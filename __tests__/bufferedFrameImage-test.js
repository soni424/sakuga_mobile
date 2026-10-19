import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';
import { BufferedFrameImage } from '../components/bufferedFrameImage';

const imagesWith = (tree, testID) => tree.root.findAllByType(Image).filter((node) => node.props.testID === testID);
const shown = (tree) => imagesWith(tree, 'preview')[0].props.source.uri;
const pending = (tree) => imagesWith(tree, 'preview-pending');

describe('BufferedFrameImage', () => {
  it('keeps the current frame on screen until the next one has loaded', () => {
    let tree;
    act(() => {
      tree = renderer.create(<BufferedFrameImage testID="preview" uri="file:///f1.png" />);
    });
    expect(shown(tree)).toBe('file:///f1.png');
    expect(pending(tree)).toHaveLength(0);

    act(() => tree.update(<BufferedFrameImage testID="preview" uri="file:///f2.png" />));
    expect(shown(tree)).toBe('file:///f1.png');
    expect(pending(tree)[0].props.source.uri).toBe('file:///f2.png');

    act(() => pending(tree)[0].props.onLoad());
    expect(shown(tree)).toBe('file:///f2.png');
    expect(pending(tree)).toHaveLength(0);
  });

  it('disables the Android fade-in and pre-decodes neighbouring frames', () => {
    let tree;
    act(() => {
      tree = renderer.create(
        <BufferedFrameImage
          testID="preview"
          uri="file:///f2.png"
          preloadUris={['file:///f1.png', 'file:///f3.png', undefined]}
        />,
      );
    });
    const images = tree.root.findAllByType(Image);
    expect(images.every((image) => image.props.fadeDuration === 0)).toBe(true);
    const uris = images.map((image) => image.props.source.uri);
    expect(uris).toEqual(expect.arrayContaining(['file:///f1.png', 'file:///f2.png', 'file:///f3.png']));
  });
});
