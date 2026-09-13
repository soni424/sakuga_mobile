import React from 'react';
import { PermissionsAndroid } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { FramesEditorScreen } from '../screens/FramesEditor';

const mockSeekTo = jest.fn();
const mockFfmpegExecute = jest.fn(() => Promise.resolve(0));
const mockCopyFile = jest.fn(() => Promise.resolve());
const mockShareOpen = jest.fn(() => Promise.resolve());
const mockToastShow = jest.fn();

jest.mock('react-native', () => ({
  SafeAreaView: 'SafeAreaView',
  StyleSheet: { create: (styles) => styles },
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  ScrollView: 'ScrollView',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Platform: { OS: 'android', Version: 30 },
  PermissionsAndroid: {
    PERMISSIONS: { WRITE_EXTERNAL_STORAGE: 'WRITE_EXTERNAL_STORAGE' },
    RESULTS: { GRANTED: 'granted' },
    check: jest.fn(() => Promise.resolve(true)),
    request: jest.fn(() => Promise.resolve('granted')),
  },
}));

jest.mock('@ui-kitten/components', () => ({
  Divider: 'Divider',
  Icon: 'Icon',
  Layout: 'Layout',
  Button: 'Button',
  Text: 'Text',
  TopNavigation: 'TopNavigation',
  TopNavigationAction: 'TopNavigationAction',
  OverflowMenu: 'OverflowMenu',
  MenuItem: 'MenuItem',
  Modal: 'Modal',
  Card: 'Card',
  Input: 'Input',
  Toggle: 'Toggle',
}));

jest.mock('react-native-ffmpeg', () => ({
  RNFFmpegConfig: { disableLogs: jest.fn() },
  RNFFmpeg: { execute: (...args) => mockFfmpegExecute(...args) },
  RNFFprobe: {
    getMediaInformation: jest.fn(() =>
      Promise.resolve({
        getAllProperties: () => ({
          format: { duration: '120' },
          streams: [{ avg_frame_rate: '24/1' }],
        }),
      }),
    ),
  },
}));

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  DownloadDirectoryPath: '/downloads',
  exists: jest.fn(() => Promise.resolve(false)),
  unlink: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
  copyFile: (...args) => mockCopyFile(...args),
}));

jest.mock('react-native-share', () => ({ open: (...args) => mockShareOpen(...args) }));

jest.mock('react-native-video-controls', () => {
  const ReactLib = require('react');
  return ReactLib.forwardRef((props, ref) => {
    ReactLib.useImperativeHandle(ref, () => ({
      methods: { seekTo: mockSeekTo },
    }));
    return ReactLib.createElement('VideoPlayer', props);
  });
});

jest.mock('../components/slider', () => ({ Slider: 'Slider' }));
jest.mock('../components/framesTimeline', () => ({ FramesTimeline: 'FramesTimeline' }));
jest.mock('react-native-simple-toast', () => ({
  show: (...args) => mockToastShow(...args),
  showWithGravity: jest.fn(),
  SHORT: 0,
  CENTER: 0,
}));

describe('FramesEditor playback', () => {
  beforeEach(() => {
    mockSeekTo.mockClear();
    mockFfmpegExecute.mockReset();
    mockFfmpegExecute.mockResolvedValue(0);
    mockCopyFile.mockClear();
    mockShareOpen.mockClear();
    mockToastShow.mockClear();
    global.AbortController = class AbortController {
      constructor() {
        this.signal = {};
      }

      abort() {}
    };
    global.fetch = jest.fn(() => Promise.resolve());
  });

  it('does not reload the video source when playing from a selected position', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    await act(async () => timeline.props.onSeek(42));

    const sourceBeforePlay = tree.root.findByType('VideoPlayer').props.source;
    const playButton = tree.root.findAllByType('Button')[0];
    await act(async () => playButton.props.onPress());
    const sourceAfterPlay = tree.root.findByType('VideoPlayer').props.source;

    expect(sourceAfterPlay).toBe(sourceBeforePlay);
  });

  it('offers dedicated controls for stepping one, two, or three frames in either direction', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    [-3, -2, -1, 1, 2, 3].forEach((frames) => {
      expect(tree.root.findByProps({ testID: `step-${frames}` })).toBeTruthy();
    });
  });

  it('clamps frame stepping at the beginning of the video', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => tree.root.findByProps({ testID: 'step--3' }).props.onPress());

    expect(mockSeekTo).toHaveBeenLastCalledWith(0);
  });

  it('plays from the current position when it is inside the selected range', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    await act(async () => timeline.props.onRangeChange(5, 10));
    await act(async () => timeline.props.onSeek(7));
    mockSeekTo.mockClear();

    await act(async () => tree.root.findByProps({ testID: 'play-toggle' }).props.onPress());

    expect(tree.root.findByType('VideoPlayer').props.paused).toBe(false);
    expect(mockSeekTo).not.toHaveBeenCalled();
  });

  it('loops from the trim out point back to the trim in point', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    await act(async () => timeline.props.onRangeChange(5, 10));
    await act(async () => timeline.props.onSeek(7));
    await act(async () => tree.root.findByProps({ testID: 'play-toggle' }).props.onPress());
    mockSeekTo.mockClear();

    await act(async () => tree.root.findByType('VideoPlayer').props.onProgress({ currentTime: 10 }));

    expect(mockSeekTo).toHaveBeenLastCalledWith(5);
    expect(tree.root.findByType('VideoPlayer').props.paused).toBe(false);
  });

  it('lets the user jump to a frame and clamps the entry to the end of the video', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => tree.root.findByProps({ testID: 'frame-readout' }).props.onPress());
    await act(async () => tree.root.findByProps({ testID: 'frame-jump-input' }).props.onChangeText('9999'));
    await act(async () => tree.root.findByProps({ testID: 'frame-jump-submit' }).props.onPress());

    expect(mockSeekTo).toHaveBeenLastCalledWith(120);
  });

  it('sets trim In and Out points from the current frame', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    let timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    await act(async () => timeline.props.onRangeChange(5, 10));
    await act(async () => timeline.props.onSeek(7));
    await act(async () => tree.root.findByProps({ testID: 'set-in' }).props.onPress());
    timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    expect(timeline.props.rangeStart).toBeCloseTo(7, 3);
    expect(timeline.props.rangeEnd).toBe(10);

    await act(async () => timeline.props.onSeek(9));
    await act(async () => tree.root.findByProps({ testID: 'set-out' }).props.onPress());
    timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    expect(timeline.props.rangeStart).toBeCloseTo(7, 3);
    expect(timeline.props.rangeEnd).toBeCloseTo(9, 3);
  });

  it('changes speed, FPS, and horizontal flip without reloading or resuming the video', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const source = tree.root.findByType('VideoPlayer').props.source;
    const navigationActions = renderer.create(tree.root.findByType('TopNavigation').props.accessoryRight());
    await act(async () => navigationActions.root.findByProps({ testID: 'open-settings' }).props.onPress());
    await act(async () => tree.root.findByProps({ testID: 'speed-2' }).props.onPress());
    await act(async () => tree.root.findByProps({ testID: 'fps-30' }).props.onPress());
    await act(async () => tree.root.findByProps({ testID: 'flip-toggle' }).props.onChange(true));

    expect(tree.root.findByType('VideoPlayer').props.source).toBe(source);
    expect(tree.root.findByType('VideoPlayer').props.rate).toBe(2);
    expect(tree.root.findByType('VideoPlayer').props.paused).toBe(true);
    expect(tree.root.findByProps({ testID: 'frames-timeline' }).props.fps).toBe(30);
    expect(tree.root.findByProps({ testID: 'flip-toggle' }).props.checked).toBe(true);
  });

  it('captures the displayed frame and offers preview, save, and share actions', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => tree.root.findByProps({ testID: 'flip-toggle' }).props.onChange(true));
    await act(async () => {
      await tree.root.findByProps({ testID: 'capture-frame' }).props.onPress();
    });

    expect(mockFfmpegExecute.mock.calls[0][0]).toContain('-vf hflip');
    expect(tree.root.findByProps({ testID: 'capture-preview' }).props.visible).toBe(true);

    await act(async () => tree.root.findByProps({ testID: 'capture-share' }).props.onPress());
    expect(mockShareOpen).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }));

    await act(async () => tree.root.findByProps({ testID: 'capture-save' }).props.onPress());
    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringContaining('/cache/frameCaptureCache/'),
      expect.stringContaining('/downloads/'),
    );
  });

  it('rejects a trim range shorter than one frame', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const timeline = tree.root.findByProps({ testID: 'frames-timeline' });
    await act(async () => timeline.props.onRangeChange(5, 5.01));

    const unchanged = tree.root.findByProps({ testID: 'frames-timeline' });
    expect(unchanged.props.rangeStart).toBe(0);
    expect(unchanged.props.rangeEnd).toBe(120);
    expect(mockToastShow).toHaveBeenCalledWith('Trim range must be at least one frame');
  });

  it('reports a capture extraction failure without opening a broken preview', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    mockFfmpegExecute.mockResolvedValueOnce(1);
    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => tree.root.findByProps({ testID: 'capture-frame' }).props.onPress());

    expect(tree.root.findByProps({ testID: 'capture-preview' }).props.visible).toBe(false);
    expect(mockToastShow).toHaveBeenCalledWith('Could not capture this frame');
  });

  it('keeps the captured frame in preview when storage permission is denied', async () => {
    const route = {
      params: {
        id: 1,
        title: 'Test video',
        file_ext: 'mp4',
        url: 'https://example.com/video.mp4',
      },
    };
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    let tree;

    await act(async () => {
      tree = renderer.create(<FramesEditorScreen route={route} navigation={navigation} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => tree.root.findByProps({ testID: 'capture-frame' }).props.onPress());
    PermissionsAndroid.check.mockResolvedValueOnce(false);
    PermissionsAndroid.request.mockResolvedValueOnce('denied');
    await act(async () => tree.root.findByProps({ testID: 'capture-save' }).props.onPress());

    expect(mockCopyFile).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ testID: 'capture-preview' }).props.visible).toBe(true);
    expect(mockToastShow).toHaveBeenCalledWith('Storage permission is needed to save frames');
  });
});
