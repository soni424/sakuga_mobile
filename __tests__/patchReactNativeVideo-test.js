const { patchSource, MARKER } = require('../scripts/patch-react-native-video');

const ORIGINAL = `    public void seekTo(int msec) {
        if (mMediaPlayerValid) {
            mSeekTime = msec;
            super.seekTo(msec);
            if (isCompleted) {`;

describe('react-native-video exact seek patch', () => {
  it('switches MediaPlayer to SEEK_CLOSEST on Android 8+', () => {
    const { source, status } = patchSource(ORIGINAL);
    expect(status).toBe('patched');
    expect(source).toContain('mMediaPlayer.seekTo((long) msec, MediaPlayer.SEEK_CLOSEST);');
    expect(source).toContain('Build.VERSION_CODES.O');
    expect(source).toContain(MARKER);
  });

  it('handles Windows line endings and is idempotent', () => {
    const once = patchSource(ORIGINAL.replace(/\n/g, '\r\n')).source;
    expect(patchSource(once)).toEqual({ source: once, status: 'already-patched' });
  });

  it('reports when the library code has changed', () => {
    expect(patchSource('class Other {}').status).toBe('not-found');
  });
});
