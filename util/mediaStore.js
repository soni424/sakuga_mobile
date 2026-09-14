import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import RNFS from 'react-native-fs';

export const saveMediaToDownloads = async (sourcePath, displayName, mimeType) => {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 29) {
    if (!NativeModules.SakugaMediaStore) {
      throw new Error('Android MediaStore adapter is unavailable');
    }
    return NativeModules.SakugaMediaStore.saveToDownloads(sourcePath, displayName, mimeType);
  }

  if (Platform.OS === 'android') {
    const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
    const granted = (await PermissionsAndroid.check(permission)) ||
      (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
    if (!granted) {
      const error = new Error('Storage permission denied');
      error.code = 'PERMISSION_DENIED';
      throw error;
    }
  }

  const destination = `${RNFS.DownloadDirectoryPath}/${displayName}`;
  await RNFS.copyFile(sourcePath, destination);
  return destination;
};
