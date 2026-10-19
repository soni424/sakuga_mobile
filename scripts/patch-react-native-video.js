// Makes react-native-video's Android MediaPlayer seek to the exact requested time.
//
// MediaPlayer.seekTo(int) lands on the previous keyframe (often seconds earlier), but the
// library still reports the seek as completed at the requested time. Frames Trim then starts
// playback from the wrong shot and the playhead freezes until the video catches up. On
// Android 8+ we use SEEK_CLOSEST instead. Runs on postinstall; safe to run repeatedly.
const fs = require('fs');
const path = require('path');

const MARKER = 'sakuga_mobile: exact seek';
const ORIGINAL = `            mSeekTime = msec;
            super.seekTo(msec);`;
const PATCHED = `            mSeekTime = msec;
            // ${MARKER} (scripts/patch-react-native-video.js)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mMediaPlayer.seekTo((long) msec, MediaPlayer.SEEK_CLOSEST);
            } else {
                super.seekTo(msec);
            }`;

const patchSource = (source) => {
  if (source.includes(MARKER)) return { source, status: 'already-patched' };
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.includes(ORIGINAL)) return { source, status: 'not-found' };
  return { source: normalized.replace(ORIGINAL, PATCHED), status: 'patched' };
};

const run = () => {
  const file = path.join(
    __dirname,
    '..',
    'node_modules/react-native-video/android/src/main/java/com/brentvatne/react/ReactVideoView.java',
  );
  if (!fs.existsSync(file)) {
    console.warn('[patch-react-native-video] ReactVideoView.java not found, skipping');
    return;
  }
  const result = patchSource(fs.readFileSync(file, 'utf8'));
  if (result.status === 'patched') fs.writeFileSync(file, result.source);
  if (result.status === 'not-found') {
    console.warn('[patch-react-native-video] seekTo code not recognised; exact seeking NOT applied');
    process.exitCode = 1;
    return;
  }
  console.log(`[patch-react-native-video] ${result.status}`);
};

if (require.main === module) run();

module.exports = { patchSource, MARKER };
