import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { FramesEditorScreen } from '../screens/FramesEditor';

const mockSeek = jest.fn();
const mockShareOpen = jest.fn(() => Promise.resolve());
const mockToastShow = jest.fn();

jest.mock('react-native', () => ({
  SafeAreaView: 'SafeAreaView',
  StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  ScrollView: 'ScrollView',
  PanResponder: { create: (config) => ({ panHandlers: config }) },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Platform: { OS: 'android', Version: 30 },
}));

jest.mock('@ui-kitten/components', () => ({
  Divider: 'Divider',
  Icon: 'Icon',
  Layout: 'Layout',
  Button: 'Button',
  Text: 'Text',
  TopNavigation: 'TopNavigation',
  TopNavigationAction: 'TopNavigationAction',
  Modal: 'Modal',
  Card: 'Card',
  Input: 'Input',
  Toggle: 'Toggle',
}));

jest.mock('react-native-video', () => {
  const ReactLib = require('react');
  return ReactLib.forwardRef((props, ref) => {
    ReactLib.useImperativeHandle(ref, () => ({ seek: mockSeek }));
    return ReactLib.createElement('NativeVideo', props);
  });
});

jest.mock('react-native-ffmpeg', () => ({
  RNFFmpegConfig: { disableLogs: jest.fn() },
  RNFFmpeg: {
    executeWithArguments: jest.fn(() => Promise.resolve(0)),
    executeAsyncWithArguments: jest.fn((args, callback) => {
      Promise.resolve().then(() => callback({ returnCode: 0 }));
      return Promise.resolve(1);
    }),
    cancelExecution: jest.fn(),
  },
  RNFFprobe: {
    getMediaInformation: jest.fn(() =>
      Promise.resolve({
        getAllProperties: () => ({ format: { duration: '10' }, streams: [{ avg_frame_rate: '24/1' }] }),
      }),
    ),
  },
}));

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  DownloadDirectoryPath: '/downloads',
  exists: jest.fn(() => Promise.resolve(true)),
  unlink: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
  copyFile: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-share', () => ({ open: (...args) => mockShareOpen(...args) }));
jest.mock('../components/framesTimeline', () => ({ FramesTimeline: 'FramesTimeline' }));
jest.mock('../components/framesFilmstrip', () => ({ FramesFilmstrip: 'FramesFilmstrip' }));
jest.mock('react-native-simple-toast', () => ({ show: (...args) => mockToastShow(...args) }));

const renderEditor = async () => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <FramesEditorScreen
        route={{ params: { id: 1, title: 'Test', file_ext: 'mp4', url: 'https://example.com/video.mp4' } }}
        navigation={{ goBack: jest.fn(), navigate: jest.fn() }}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
};

describe('FramesEditor native playback transport', () => {
  beforeEach(() => {
    mockSeek.mockClear();
    mockToastShow.mockClear();
  });

  it('queues an early frame step until the native player is ready', async () => {
    const tree = await renderEditor();
    await act(async () => tree.root.findByProps({ testID: 'step-3' }).props.onPress());
    expect(mockSeek).not.toHaveBeenCalled();

    await act(async () => tree.root.findByType('NativeVideo').props.onLoad({ duration: 10 }));
    expect(mockSeek).toHaveBeenLastCalledWith(3 / 24);
  });

  it('does not show a blocking center loader during buffered stepping', async () => {
    const tree = await renderEditor();
    await act(async () => tree.root.findByProps({ testID: 'step-3' }).props.onPress());

    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'preparing-frame-status' })).toHaveLength(0);
  });

  it('keeps the native player paused until a requested middle seek is acknowledged', async () => {
    const tree = await renderEditor();
    const nativeVideo = () => tree.root.findByType('NativeVideo');
    await act(async () => nativeVideo().props.onLoad({ duration: 10 }));
    const timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    await act(async () => timeline.props.onSeekFrame(120));
    await act(async () => timeline.props.onInteractionEnd('playhead'));
    await act(async () => tree.root.findByProps({ testID: 'play-toggle' }).props.onPress());

    expect(nativeVideo().props.paused).toBe(true);
    await act(async () => nativeVideo().props.onProgress({ currentTime: 0 }));
    expect(tree.root.findByProps({ testID: 'frames-timeline' }).props.playheadFrame).toBe(120);
    await act(async () => nativeVideo().props.onSeek({ seekTime: 5, currentTime: 5 }));
    expect(nativeVideo().props.paused).toBe(false);
  });

  it('loops at Out by waiting for an acknowledged seek back to In', async () => {
    const tree = await renderEditor();
    const nativeVideo = () => tree.root.findByType('NativeVideo');
    await act(async () => nativeVideo().props.onLoad({ duration: 10 }));
    let timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    await act(async () => timeline.props.onRangeChangeFrames(48, 96));
    await act(async () => timeline.props.onSeekFrame(72));
    await act(async () => timeline.props.onInteractionEnd('playhead'));
    await act(async () => nativeVideo().props.onSeek({ seekTime: 3, currentTime: 3 }));
    await act(async () => tree.root.findByProps({ testID: 'play-toggle' }).props.onPress());
    await act(async () => nativeVideo().props.onSeek({ seekTime: 3, currentTime: 3 }));
    await act(async () => nativeVideo().props.onProgress({ currentTime: 4 }));

    expect(mockSeek).toHaveBeenLastCalledWith(2);
    expect(nativeVideo().props.paused).toBe(true);
    await act(async () => nativeVideo().props.onSeek({ seekTime: 2, currentTime: 2 }));
    expect(nativeVideo().props.paused).toBe(false);
  });

  it('uses one memoized source while stepping, changing speed, FPS, and flip', async () => {
    const tree = await renderEditor();
    const source = tree.root.findByType('NativeVideo').props.source;
    await act(async () => tree.root.findByType('NativeVideo').props.onLoad({ duration: 10 }));
    await act(async () => tree.root.findByProps({ testID: 'step-1' }).props.onPress());
    await act(async () => tree.root.findByProps({ testID: 'speed-2' }).props.onPress());
    await act(async () => tree.root.findByProps({ testID: 'fps-30' }).props.onPress());
    await act(async () => tree.root.findByProps({ testID: 'flip-toggle' }).props.onChange(true));

    expect(tree.root.findByType('NativeVideo').props.source).toBe(source);
    expect(tree.root.findByType('NativeVideo').props.rate).toBe(2);
    expect(tree.root.findByType('NativeVideo').props.paused).toBe(true);
    expect(tree.root.findByProps({ testID: 'frames-timeline' }).props.fps).toBe(30);
  });

  it('changes the trim range without issuing a player seek', async () => {
    const tree = await renderEditor();
    await act(async () => tree.root.findByType('NativeVideo').props.onLoad({ duration: 10 }));
    mockSeek.mockClear();
    await act(async () => tree.root.findByProps({ testID: 'frames-timeline' }).props.onRangeChangeFrames(24, 120));
    expect(mockSeek).not.toHaveBeenCalled();
  });

  it('scans repeatedly after holding the +1 frame control', async () => {
    jest.useFakeTimers();
    const tree = await renderEditor();
    const step = tree.root.findByProps({ testID: 'step-1' });
    await act(async () => {
      step.props.onPressIn();
      jest.advanceTimersByTime(550);
      step.props.onPressOut();
    });
    expect(tree.root.findByProps({ testID: 'frames-timeline' }).props.playheadFrame).toBeGreaterThanOrEqual(3);
    jest.useRealTimers();
  });

  it('does not step again when a held step button is released', async () => {
    jest.useFakeTimers();
    const tree = await renderEditor();
    const step = () => tree.root.findByProps({ testID: 'step-2' });
    await act(async () => {
      step().props.onPressIn();
      jest.advanceTimersByTime(350);
      step().props.onPressOut();
    });
    const afterHold = tree.root.findByProps({ testID: 'frames-timeline' }).props.playheadFrame;
    expect(afterHold).toBe(2);
    await act(async () => step().props.onPress());
    expect(tree.root.findByProps({ testID: 'frames-timeline' }).props.playheadFrame).toBe(afterHold);
    jest.useRealTimers();
  });

  it('scrubs frame by frame when swiping horizontally on the video', async () => {
    const tree = await renderEditor();
    await act(async () => tree.root.findByType('NativeVideo').props.onLoad({ duration: 10 }));
    const stage = () => tree.root.findByProps({ testID: 'video-stage' });

    expect(stage().props.onMoveShouldSetPanResponder({}, { dx: 20, dy: 2 })).toBe(true);
    expect(stage().props.onMoveShouldSetPanResponder({}, { dx: 4, dy: 30 })).toBe(false);
    await act(async () => {
      stage().props.onPanResponderGrant();
      stage().props.onPanResponderMove({}, { dx: 14 * 5, dy: 0 });
    });
    expect(mockSeek).toHaveBeenLastCalledWith(5 / 24);
    expect(tree.root.findByProps({ testID: 'frames-timeline' }).props.playheadFrame).toBe(5);

    await act(async () => stage().props.onPanResponderMove({}, { dx: 14 * 3, dy: 0 }));
    expect(tree.root.findByProps({ testID: 'frames-timeline' }).props.playheadFrame).toBe(3);
  });

  it('jumps to a frame tapped in the filmstrip and feeds it cached frames', async () => {
    const tree = await renderEditor();
    const filmstrip = () => tree.root.findByProps({ testID: 'frames-filmstrip' });
    expect(Object.keys(filmstrip().props.cachedFrames)).toHaveLength(25);

    await act(async () => filmstrip().props.onSelectFrame(7));
    expect(filmstrip().props.playheadFrame).toBe(7);
  });

  it('overlays the previous frame when onion skin is on', async () => {
    const tree = await renderEditor();
    await act(async () => tree.root.findByProps({ testID: 'step-1' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'onion-skin-layer' })).toHaveLength(0);

    await act(async () => tree.root.findByProps({ testID: 'onion-toggle' }).props.onPress());
    const layer = tree.root.findByProps({ testID: 'onion-skin-layer' });
    expect(layer.props.source.uri).toMatch(/_001\.png$/);
  });
});
