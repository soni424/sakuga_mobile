require('react-native-gesture-handler/jestSetup');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-simple-toast', () => ({
  show: jest.fn(),
  showWithGravity: jest.fn(),
  SHORT: 0,
  CENTER: 0,
}));

jest.mock('rn-fetch-blob', () => ({
  fs: { dirs: { DownloadDir: '/downloads', DocumentDir: '/documents' } },
  config: jest.fn(() => ({ fetch: jest.fn(() => Promise.resolve({ path: () => '/downloaded/file' })) })),
  ios: { previewDocument: jest.fn(), openDocument: jest.fn() },
}));

jest.mock('react-native-share', () => ({ open: jest.fn(() => Promise.resolve()) }));

jest.mock('react-native-video-processing', () => ({
  VideoPlayer: 'VideoProcessingPlayer',
  Trimmer: 'VideoTrimmer',
  ProcessingManager: {},
}));

jest.mock('react-native-ffmpeg', () => ({
  RNFFmpegConfig: { disableLogs: jest.fn() },
  RNFFmpeg: {
    execute: jest.fn(() => Promise.resolve(0)),
    executeWithArguments: jest.fn(() => Promise.resolve(0)),
    executeAsyncWithArguments: jest.fn(() => Promise.resolve(1)),
    cancelExecution: jest.fn(),
  },
  RNFFprobe: { getMediaInformation: jest.fn(() => Promise.reject(new Error('not available in tests'))) },
}));

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  DownloadDirectoryPath: '/downloads',
  exists: jest.fn(() => Promise.resolve(false)),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  copyFile: jest.fn(() => Promise.resolve()),
  readDir: jest.fn(() => Promise.resolve([])),
}));

jest.mock('react-native-orientation-locker', () => ({
  lockToPortrait: jest.fn(),
  lockToLandscape: jest.fn(),
  unlockAllOrientations: jest.fn(),
  addOrientationListener: jest.fn(),
  removeOrientationListener: jest.fn(),
}));

jest.mock('react-native-splash-screen', () => ({ hide: jest.fn(), show: jest.fn() }));
