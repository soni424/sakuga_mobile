import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import {
  Divider,
  Icon,
  Layout,
  Button,
  Text,
  TopNavigation,
  TopNavigationAction,
  Modal,
  Card,
  Input,
  Toggle,
} from '@ui-kitten/components';
import Video from 'react-native-video';
import { RNFFprobe, RNFFmpegConfig, RNFFmpeg } from 'react-native-ffmpeg';
import RNFS from 'react-native-fs';
import Toast from 'react-native-simple-toast';
import Share from 'react-native-share';
import { FramesTimeline } from '../components/framesTimeline';
import { parseSourceFrameRate } from '../util/framesEditor';
import { createFramesPlaybackController } from '../util/framePlaybackController';
import { createFramePreviewAdapter } from '../util/framePreviewAdapter';
import { saveMediaToDownloads } from '../util/mediaStore';

const CloseIcon = (props) => <Icon {...props} name="close-outline" />;
const GridIcon = (props) => <Icon {...props} name="grid-outline" />;
const SettingsIcon = (props) => <Icon {...props} name="settings-2-outline" />;
const PlayIcon = () => <Icon name="play-circle-outline" style={styles.transportIcon} fill="#D4D4D4" />;
const PauseIcon = () => <Icon name="pause-circle-outline" style={styles.transportIcon} fill="#D4D4D4" />;
const formatSeconds = (value) => {
  const seconds = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
};
const fileUri = (path) => (Platform.OS === 'android' && path ? `file://${path}` : path);

export const FramesEditorScreen = ({ navigation, route }) => {
  const mounted = useRef(true);
  const video = useRef(null);
  const controller = useRef(null);
  const scanDelay = useRef(null);
  const scanTimer = useRef(null);
  const timelineSeekTimer = useRef(null);
  const pendingTimelineFrame = useRef(null);
  const diagnostics = useRef([]);
  const { width, height } = useWindowDimensions();
  const { id, title, file_ext, url } = route.params;
  const videoSource = useMemo(() => ({ uri: url }), [url]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [duration, setDuration] = useState(0);
  const [sourceFps, setSourceFps] = useState(24);
  const [fpsMode, setFpsMode] = useState('auto');
  const [playback, setPlayback] = useState(null);
  const [rate, setRate] = useState(1);
  const [jumpVisible, setJumpVisible] = useState(false);
  const [jumpFrame, setJumpFrame] = useState('1');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturePath, setCapturePath] = useState(null);
  const [captureVisible, setCaptureVisible] = useState(false);
  const effectiveFps = fpsMode === 'auto' ? sourceFps : Number(fpsMode);
  const videoHeight = width > height ? Math.max(170, Math.min(height * 0.54, 300)) : Math.min(width * 0.62, 340);

  const addDiagnostic = useCallback((entry) => {
    diagnostics.current = [...diagnostics.current.slice(-79), { at: Date.now(), ...entry }];
  }, []);

  const buildController = useCallback(
    (mediaDuration, frameRate) => {
      const directory = `${RNFS.CachesDirectoryPath}/framePreviewCache/${id}_${Date.now()}`;
      const frameWindowAdapter = createFramePreviewAdapter({ url, directory, ffmpeg: RNFFmpeg, fs: RNFS });
      const next = createFramesPlaybackController({
        duration: mediaDuration,
        fps: frameRate,
        seek: (time) => video.current?.seek?.(time),
        frameWindowAdapter,
        onChange: (state) => mounted.current && setPlayback(state),
        onDiagnostic: addDiagnostic,
      });
      controller.current = next;
      setPlayback(next.getState());
      next.prepare();
    },
    [addDiagnostic, id, url],
  );

  const loadVideo = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      RNFFmpegConfig.disableLogs();
      const info = await RNFFprobe.getMediaInformation(url);
      const properties = info.getAllProperties();
      const mediaDuration = Number(properties.format.duration);
      if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) throw new Error('Invalid video duration');
      const frameRate = parseSourceFrameRate(properties.streams);
      if (mounted.current) {
        setDuration(mediaDuration);
        setSourceFps(frameRate);
        buildController(mediaDuration, frameRate);
        setLoading(false);
      }
    } catch (error) {
      console.log('MEDIA_INFO_ERROR: ', error);
      if (mounted.current) {
        setLoadError(true);
        setLoading(false);
      }
    }
  }, [buildController, url]);

  useEffect(() => {
    mounted.current = true;
    loadVideo();
    return () => {
      mounted.current = false;
      clearTimeout(scanDelay.current);
      clearInterval(scanTimer.current);
      clearTimeout(timelineSeekTimer.current);
      controller.current?.dispose();
    };
  }, [loadVideo]);

  const pause = useCallback(() => controller.current?.pause(), []);
  const stepByFrames = useCallback((frames) => controller.current?.stepFrames(frames), []);
  const stopScanning = useCallback(() => {
    clearTimeout(scanDelay.current);
    clearInterval(scanTimer.current);
    scanDelay.current = null;
    scanTimer.current = null;
  }, []);
  const startScanning = useCallback(
    (direction) => {
      stopScanning();
      scanDelay.current = setTimeout(() => {
        stepByFrames(direction);
        scanTimer.current = setInterval(() => stepByFrames(direction), 120);
      }, 300);
    },
    [stepByFrames, stopScanning],
  );
  const changeFps = useCallback(
    (mode) => {
      pause();
      setFpsMode(mode);
      controller.current?.setFps(mode === 'auto' ? sourceFps : Number(mode));
    },
    [pause, sourceFps],
  );
  const queueTimelineSeek = useCallback((frame) => {
    pendingTimelineFrame.current = frame;
    clearTimeout(timelineSeekTimer.current);
    timelineSeekTimer.current = setTimeout(() => {
      controller.current?.seekFrame(pendingTimelineFrame.current);
      pendingTimelineFrame.current = null;
    }, 90);
  }, []);
  const commitTimelineSeek = useCallback((kind) => {
    if (kind !== 'playhead' || pendingTimelineFrame.current === null) return;
    clearTimeout(timelineSeekTimer.current);
    controller.current?.seekFrame(pendingTimelineFrame.current);
    pendingTimelineFrame.current = null;
  }, []);
  const showRangeError = useCallback((result) => {
    if (result && !result.ok) Toast.show(result.message);
  }, []);

  const navigateBack = useCallback(() => navigation.goBack(), [navigation]);
  const renderLeftAction = useCallback(() => <TopNavigationAction icon={CloseIcon} onPress={navigateBack} />, [
    navigateBack,
  ]);
  const openSettings = useCallback(() => {
    pause();
    setSettingsVisible(true);
  }, [pause]);
  const navigateFramesList = useCallback(() => {
    pause();
    const state = controller.current.getState();
    navigation.navigate('FramesList', {
      startTime: state.inFrame / effectiveFps,
      endTime: state.outFrame / effectiveFps,
      title,
      id,
      file_ext,
      url,
    });
  }, [effectiveFps, file_ext, id, navigation, pause, title, url]);
  const renderRightActions = useCallback(
    () => (
      <React.Fragment>
        <TopNavigationAction testID="open-settings" icon={SettingsIcon} onPress={openSettings} />
        <TopNavigationAction icon={GridIcon} onPress={navigateFramesList} />
      </React.Fragment>
    ),
    [navigateFramesList, openSettings],
  );

  const openFrameJump = useCallback(() => {
    pause();
    setJumpFrame(String((playback?.playheadFrame || 0) + 1));
    setJumpVisible(true);
  }, [pause, playback]);
  const submitFrameJump = useCallback(() => {
    const entered = Number.parseInt(jumpFrame, 10);
    const displayed = Number.isFinite(entered) ? entered : playback.playheadFrame + 1;
    controller.current.seekFrame(Math.max(1, Math.min(playback.frameCount, displayed)) - 1);
    setJumpVisible(false);
  }, [jumpFrame, playback]);

  const captureFrame = useCallback(async () => {
    if (!playback) return;
    const directory = `${RNFS.CachesDirectoryPath}/frameCaptureCache/${id}_${Date.now()}`;
    try {
      pause();
      setSettingsVisible(false);
      setCapturing(true);
      await RNFS.mkdir(directory);
      const safeTitle = (title || `sakuga_${id}`).replace(/[^a-z0-9_.-]+/gi, '_');
      const path = `${directory}/${safeTitle}_${playback.playheadFrame + 1}.png`;
      const frameTime = playback.playheadFrame / effectiveFps;
      const fastSeek = Math.max(0, frameTime - 1);
      const accurateSeek = frameTime - fastSeek;
      const args = ['-y', '-ss', fastSeek.toFixed(6), '-i', url, '-ss', accurateSeek.toFixed(6)];
      if (flipped) args.push('-vf', 'hflip');
      args.push('-frames:v', '1', path);
      const result = await RNFFmpeg.executeWithArguments(args);
      if (result !== 0 || !(await RNFS.exists(path))) throw new Error(`FFmpeg exited with code ${result}`);
      setCapturePath(path);
      setCaptureVisible(true);
    } catch (error) {
      console.log('CAPTURE_FRAME_ERROR: ', error);
      Toast.show('Could not capture this frame');
    } finally {
      if (mounted.current) setCapturing(false);
    }
  }, [effectiveFps, flipped, id, pause, playback, title, url]);

  const shareCapture = useCallback(async () => {
    if (!capturePath) return;
    try {
      await Share.open({
        title: 'Share frame',
        message: title || 'Sakuga frame',
        failOnCancel: false,
        url: fileUri(capturePath),
        type: 'image/png',
      });
    } catch (error) {
      console.log('SHARE_FRAME_ERROR: ', error);
      Toast.show('Could not share this frame');
    }
  }, [capturePath, title]);
  const saveCapture = useCallback(async () => {
    if (!capturePath) return;
    try {
      await saveMediaToDownloads(capturePath, capturePath.split('/').pop(), 'image/png');
      Toast.show('Frame saved to Downloads');
    } catch (error) {
      console.log('SAVE_FRAME_ERROR: ', error);
      Toast.show(
        error.code === 'PERMISSION_DENIED'
          ? 'Storage permission is needed to save frames'
          : 'Could not save this frame',
      );
    }
  }, [capturePath]);
  const shareDiagnostics = useCallback(async () => {
    try {
      await Share.open({
        title: 'Frames playback diagnostics',
        message: JSON.stringify({ version: '2.1.5-rc2', events: diagnostics.current }, null, 2),
        failOnCancel: false,
      });
    } catch (error) {
      console.log('SHARE_DIAGNOSTICS_ERROR: ', error);
    }
  }, []);

  if (loading || loadError || !playback) {
    return (
      <Layout style={styles.root}>
        <SafeAreaView style={styles.root}>
          <TopNavigation title="Frames Trim" alignment="center" accessoryLeft={renderLeftAction} />
          <Divider />
          <Layout style={styles.centeredState}>
            {loading ? (
              <ActivityIndicator color="#D4D4D4" />
            ) : (
              <React.Fragment>
                <Text category="h6">Unable to load video information</Text>
                <Button style={styles.retryButton} onPress={loadVideo}>
                  Try again
                </Button>
              </React.Fragment>
            )}
          </Layout>
        </SafeAreaView>
      </Layout>
    );
  }

  const currentTime = playback.playheadFrame / effectiveFps;
  const startTime = playback.inFrame / effectiveFps;
  const endTime = playback.outFrame / effectiveFps;
  const previewVisible = playback.previewUri && (!playback.playing || playback.seeking);

  return (
    <Layout style={styles.root}>
      <SafeAreaView style={styles.root}>
        <TopNavigation
          title="Frames Trim"
          subtitle={`${formatSeconds(startTime)} ~ ${formatSeconds(endTime)}`}
          alignment="center"
          accessoryLeft={renderLeftAction}
          accessoryRight={renderRightActions}
        />
        <Divider />
        <ScrollView
          style={styles.editor}
          contentContainerStyle={styles.editorContent}
          keyboardShouldPersistTaps="handled">
          <Layout style={[styles.videoStage, { height: videoHeight }]}>
            <Video
              testID="frames-video"
              ref={video}
              paused={!playback.playing}
              muted
              repeat={false}
              source={videoSource}
              resizeMode="contain"
              rate={rate}
              progressUpdateInterval={50}
              style={[styles.videoSurface, flipped && styles.flippedVideo]}
              onLoad={() => controller.current?.onPlayerReady()}
              onSeek={(event) => controller.current?.onSeek(event)}
              onProgress={(event) => controller.current?.onProgress(event)}
              onEnd={() => controller.current?.onEnd()}
              onError={() => controller.current?.onError()}
            />
            {previewVisible && (
              <Image
                testID="exact-frame-preview"
                style={[styles.previewImage, flipped && styles.flippedVideo]}
                resizeMode="contain"
                source={{ uri: fileUri(playback.previewUri) }}
              />
            )}
            {capturing && <ActivityIndicator style={styles.captureProgress} size="large" color="#E3170A" />}
          </Layout>

          <Layout style={styles.controlPanel}>
            {playback.previewPreparing && (
              <Text testID="preparing-frame-status" category="c1" appearance="hint" style={styles.preparingStatus}>
                Preparing frame…
              </Text>
            )}
            <Layout style={styles.statusRow}>
              <Button testID="frame-readout" appearance="ghost" style={styles.frameReadout} onPress={openFrameJump}>
                <Text status="primary" category="s1">{`Frame ${playback.playheadFrame + 1} / ${
                  playback.frameCount
                }`}</Text>
              </Button>
              <Text category="c1" appearance="hint">{`${formatSeconds(currentTime)} / ${formatSeconds(
                duration,
              )}`}</Text>
            </Layout>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transportRow}>
              {[-3, -2, -1].map((frames) => (
                <Button
                  key={frames}
                  testID={`step-${frames}`}
                  appearance="ghost"
                  style={styles.stepButton}
                  onPress={() => stepByFrames(frames)}
                  onPressIn={frames === -1 ? () => startScanning(-1) : undefined}
                  onPressOut={frames === -1 ? stopScanning : undefined}>{`${frames}f`}</Button>
              ))}
              <Button
                testID="play-toggle"
                appearance="ghost"
                style={styles.playButton}
                onPress={() => controller.current?.togglePlay()}
                accessoryRight={playback.playing ? PauseIcon : PlayIcon}
              />
              {[1, 2, 3].map((frames) => (
                <Button
                  key={frames}
                  testID={`step-${frames}`}
                  appearance="ghost"
                  style={styles.stepButton}
                  onPress={() => stepByFrames(frames)}
                  onPressIn={frames === 1 ? () => startScanning(1) : undefined}
                  onPressOut={frames === 1 ? stopScanning : undefined}>{`+${frames}f`}</Button>
              ))}
            </ScrollView>
            <FramesTimeline
              testID="frames-timeline"
              frameCount={playback.frameCount}
              fps={effectiveFps}
              playheadFrame={playback.playheadFrame}
              inFrame={playback.inFrame}
              outFrame={playback.outFrame}
              onSeekFrame={queueTimelineSeek}
              onRangeChangeFrames={(low, high) => showRangeError(controller.current?.setRange(low, high))}
              onInteractionStart={pause}
              onInteractionEnd={commitTimelineSeek}
            />
            <Layout style={styles.trimActions}>
              <Button
                testID="set-in"
                appearance="outline"
                style={styles.trimAction}
                onPress={() => showRangeError(controller.current?.setIn())}>
                Set In
              </Button>
              <Button
                testID="set-out"
                appearance="outline"
                style={styles.trimAction}
                onPress={() => showRangeError(controller.current?.setOut())}>
                Set Out
              </Button>
            </Layout>
          </Layout>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={jumpVisible} backdropStyle={styles.backdrop} onBackdropPress={() => setJumpVisible(false)}>
        <Card disabled style={styles.dialogCard}>
          <Text category="h6" style={styles.dialogTitle}>
            Jump to frame
          </Text>
          <Input
            testID="frame-jump-input"
            value={jumpFrame}
            keyboardType="number-pad"
            onChangeText={setJumpFrame}
            onSubmitEditing={submitFrameJump}
          />
          <Layout style={styles.dialogActions}>
            <Button appearance="ghost" onPress={() => setJumpVisible(false)}>
              Cancel
            </Button>
            <Button testID="frame-jump-submit" onPress={submitFrameJump}>
              Jump
            </Button>
          </Layout>
        </Card>
      </Modal>

      <Modal
        visible={settingsVisible}
        style={styles.settingsModal}
        backdropStyle={styles.backdrop}
        onBackdropPress={() => setSettingsVisible(false)}>
        <Card disabled style={styles.settingsCard}>
          <Text category="h6">Playback tools</Text>
          <Text category="label" appearance="hint" style={styles.settingsLabel}>
            Speed
          </Text>
          <Layout style={styles.optionRow}>
            {[0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((speed) => (
              <Button
                key={speed}
                testID={`speed-${speed}`}
                size="tiny"
                appearance={rate === speed ? 'filled' : 'outline'}
                style={styles.optionButton}
                onPress={() => setRate(speed)}>{`${speed}×`}</Button>
            ))}
          </Layout>
          <Text category="label" appearance="hint" style={styles.settingsLabel}>
            Frame rate
          </Text>
          <Layout style={styles.optionRow}>
            {[
              { value: 'auto', label: `Auto (${sourceFps.toFixed(2)})` },
              { value: '24', label: '24 FPS' },
              { value: '30', label: '30 FPS' },
            ].map((option) => (
              <Button
                key={option.value}
                testID={`fps-${option.value}`}
                size="small"
                appearance={fpsMode === option.value ? 'filled' : 'outline'}
                style={styles.fpsButton}
                onPress={() => changeFps(option.value)}>
                {option.label}
              </Button>
            ))}
          </Layout>
          <Toggle testID="flip-toggle" checked={flipped} onChange={setFlipped} style={styles.flipToggle}>
            Flip horizontally
          </Toggle>
          <Button testID="capture-frame" disabled={capturing} onPress={captureFrame} style={styles.captureButton}>
            {capturing ? 'Capturing…' : 'Capture current frame'}
          </Button>
          <Button
            testID="share-diagnostics"
            appearance="outline"
            onPress={shareDiagnostics}
            style={styles.captureButton}>
            Share playback diagnostics
          </Button>
          <Button appearance="ghost" onPress={() => setSettingsVisible(false)}>
            Close
          </Button>
        </Card>
      </Modal>

      <Modal
        testID="capture-preview"
        visible={captureVisible}
        backdropStyle={styles.backdrop}
        onBackdropPress={() => setCaptureVisible(false)}>
        <Card disabled style={styles.captureCard}>
          <Text category="h6" style={styles.dialogTitle}>
            Captured frame
          </Text>
          {capturePath && (
            <Image style={styles.captureImage} resizeMode="contain" source={{ uri: fileUri(capturePath) }} />
          )}
          <Layout style={styles.captureActions}>
            <Button appearance="ghost" onPress={() => setCaptureVisible(false)}>
              Close
            </Button>
            <Button testID="capture-share" appearance="outline" onPress={shareCapture}>
              Share
            </Button>
            <Button testID="capture-save" onPress={saveCapture}>
              Save
            </Button>
          </Layout>
        </Card>
      </Modal>
    </Layout>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  transportIcon: { width: 25, height: 25 },
  editor: { flex: 1 },
  editorContent: { flexGrow: 1, paddingBottom: 24 },
  videoStage: { width: '100%', overflow: 'hidden', justifyContent: 'center', backgroundColor: '#000000' },
  videoSurface: { width: '100%', height: '100%' },
  previewImage: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  controlPanel: { width: '100%', paddingTop: 10 },
  statusRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  frameReadout: { minHeight: 44, paddingHorizontal: 4 },
  transportRow: {
    minWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  stepButton: {
    width: 44,
    minWidth: 44,
    minHeight: 44,
    marginHorizontal: 2,
    paddingHorizontal: 0,
    borderRadius: 22,
    backgroundColor: '#292929',
  },
  playButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 48,
    height: 48,
    minWidth: 48,
    marginHorizontal: 3,
    padding: 0,
    borderRadius: 24,
    backgroundColor: '#292929',
  },
  centeredState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  retryButton: { marginTop: 16 },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  dialogCard: { width: 300 },
  dialogTitle: { marginBottom: 12 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  trimActions: { width: '100%', flexDirection: 'row', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6 },
  trimAction: { flex: 1, minHeight: 44, marginHorizontal: 4 },
  flippedVideo: { transform: [{ scaleX: -1 }] },
  settingsCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'flex-end',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  settingsModal: { width: '100%', justifyContent: 'flex-end', margin: 0 },
  settingsLabel: { marginTop: 16, marginBottom: 8 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap' },
  optionButton: { minHeight: 44, marginRight: 6, marginBottom: 6 },
  fpsButton: { minHeight: 44, marginRight: 8, marginBottom: 8 },
  flipToggle: { minHeight: 44, marginVertical: 10 },
  captureButton: { minHeight: 48, marginBottom: 6 },
  captureCard: { width: '94%', maxWidth: 640, alignSelf: 'center' },
  captureImage: { width: '100%', height: 360, backgroundColor: '#000000' },
  captureActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  captureProgress: { position: 'absolute', alignSelf: 'center' },
  preparingStatus: { minHeight: 20, textAlign: 'center', paddingTop: 4 },
});
