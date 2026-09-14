describe('media saving', () => {
  beforeEach(() => jest.resetModules());

  it('uses MediaStore without legacy permission on Android 10+', async () => {
    const saveToDownloads = jest.fn(() => Promise.resolve('content://download/1'));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android', Version: 30 },
      NativeModules: { SakugaMediaStore: { saveToDownloads } },
      PermissionsAndroid: { check: jest.fn(), request: jest.fn(), PERMISSIONS: {}, RESULTS: {} },
    }));
    jest.doMock('react-native-fs', () => ({ copyFile: jest.fn(), DownloadDirectoryPath: '/downloads' }));
    const { saveMediaToDownloads } = require('../util/mediaStore');

    await expect(saveMediaToDownloads('/cache/frame.png', 'frame.png', 'image/png')).resolves.toBe('content://download/1');
    expect(saveToDownloads).toHaveBeenCalledWith('/cache/frame.png', 'frame.png', 'image/png');
  });

  it('reports legacy Android permission denial', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android', Version: 28 },
      NativeModules: {},
      PermissionsAndroid: {
        check: jest.fn(() => Promise.resolve(false)),
        request: jest.fn(() => Promise.resolve('denied')),
        PERMISSIONS: { WRITE_EXTERNAL_STORAGE: 'storage' },
        RESULTS: { GRANTED: 'granted' },
      },
    }));
    jest.doMock('react-native-fs', () => ({ copyFile: jest.fn(), DownloadDirectoryPath: '/downloads' }));
    const { saveMediaToDownloads } = require('../util/mediaStore');

    await expect(saveMediaToDownloads('/cache/frame.png', 'frame.png', 'image/png')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
