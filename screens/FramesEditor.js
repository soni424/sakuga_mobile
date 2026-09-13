import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  Image,
  PermissionsAndroid,
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
import { RNFFprobe, RNFFmpegConfig, RNFFmpeg } from 'react-native-ffmpeg';
import VideoPlayer from 'react-native-video-controls';
import { FramesTimeline } from '../components/framesTimeline';
import RNFS from 'react-native-fs';
import Toast from 'react-native-simple-toast';
import Share from 'react-native-share';
import { frameToTime, getTotalFrames, parseSourceFrameRate, timeToFrame } from '../util/framesEditor';

const CloseIcon = (props) => <Icon {...props} name="close-outline" />;
const GridIcon = (props) => <Icon {...props} name="grid-outline" />;
const SettingsIcon = (props) => <Icon {...props} name="settings-2-outline" />;
const PlayIcon = () => <Icon name="play-circle-outline" style={styles.transportIcon} fill="#D4D4D4" />;
const PauseIcon = () => <Icon name="pause-circle-outline" style={styles.transportIcon} fill="#D4D4D4" />;

const formatSeconds = (seconds) => {
  return new Date(seconds ? seconds * 1000 : 0).toISOString().substr(14, 8);
};

export const FramesEditorScreen = ({ navigation, route }) => {
  const mounted = useRef(true);
  const video = useRef();
  const { width, height } = useWindowDimensions();
  const id = route.params.id;
  const title = route.params.title;
  const file_ext = route.params.file_ext;
  const url = route.params.url;
  const videoSource = useMemo(() => ({ uri: url }), [url]);

  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [sourceFps, setSourceFps] = useState(24);
  const [fpsMode, setFpsMode] = useState('auto');
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(true);
  const [duration, setDuration] = useState(false);
  const [rate, setRate] = useState(1);
  const [jumpVisible, setJumpVisible] = useState(false);
  const [jumpFrame, setJumpFrame] = useState('0');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturePath, setCapturePath] = useState(null);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const effectiveFps = fpsMode === 'auto' ? sourceFps : Number(fpsMode);
  const stepSize = 1 / effectiveFps;
  const totalFPS = useMemo(() => getTotalFrames(duration, effectiveFps), [duration, effectiveFps]);
  const currentFPS = useMemo(() => timeToFrame(currentTime, effectiveFps, totalFPS), [
    currentTime,
    effectiveFps,
    totalFPS,
  ]);
  const videoHeight = width > height ? Math.max(170, Math.min(height * 0.54, 300)) : Math.min(width * 0.62, 340);

  const openSettings = useCallback(() => {
    setPaused(true);
    setSettingsVisible(true);
  }, []);

  const deleteFramesCache = useCallback(async () => {
    const dir = `${RNFS.CachesDirectoryPath}/framesCache`;
    const exist = await RNFS.exists(dir);
    if (exist) {
      await RNFS.unlink(dir);
    }
  }, []);

  const setVideoInfo = useCallback((info) => {
    setSourceFps(info.frameRate);
    setEndTime(info.duration);
    setDuration(info.duration);
  }, []);

  const loadVideo = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      RNFFmpegConfig.disableLogs();
      const info = await RNFFprobe.getMediaInformation(url);
      const allProperties = info.getAllProperties();
      const mediaDuration = Number(allProperties.format.duration);
      if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) {
        throw new Error('Invalid video duration');
      }
      const frameRate = parseSourceFrameRate(allProperties.streams);
      if (mounted.current) {
        setVideoInfo({ duration: mediaDuration, frameRate });
        setLoading(false);
      }
    } catch (error) {
      console.log('MEDIA_INFO_ERROR: ', error);
      if (mounted.current) {
        setLoadError(true);
        setLoading(false);
      }
    }
  }, [setVideoInfo, url]);

  useEffect(() => {
    mounted.current = true;
    loadVideo();
    return () => {
      mounted.current = false;
      deleteFramesCache();
      const captureDirectory = `${RNFS.CachesDirectoryPath}/frameCaptureCache`;
      RNFS.exists(captureDirectory).then((exists) => exists && RNFS.unlink(captureDirectory));
    };
  }, [deleteFramesCache, loadVideo]);

  const seekVideo = useCallback((time) => {
    const player = video.current;
    if (!Number.isFinite(time) || !player || typeof player.seekTo !== 'function') {
      return false;
    }
    player.seekTo(time);
    return true;
  }, []);

  const toggleVideo = useCallback(() => {
    if (!paused) {
      setPaused(true);
      return;
    }

    if (currentTime < startTime || currentTime >= endTime) {
      setCurrentTime(startTime);
      seekVideo(startTime);
    }
    setPaused(false);
  }, [currentTime, endTime, paused, seekVideo, startTime]);

  const navigateBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderLeftAction = useCallback(() => <TopNavigationAction icon={CloseIcon} onPress={navigateBack} />, [
    navigateBack,
  ]);

  const navigateFramesList = useCallback(() => {
    setPaused(true);
    navigation.navigate('FramesList', { startTime, endTime, title, id, file_ext, url });
  }, [endTime, file_ext, id, navigation, startTime, title, url]);

  const renderRightActions = useCallback(
    () => (
      <React.Fragment>
        <TopNavigationAction testID="open-settings" icon={SettingsIcon} onPress={openSettings} />
        <TopNavigationAction icon={GridIcon} onPress={navigateFramesList} />
      </React.Fragment>
    ),
    [navigateFramesList, openSettings],
  );

  const stepByFrames = useCallback(
    (frames) => {
      const currentFrame = timeToFrame(currentTime, effectiveFps, totalFPS);
      const targetFrame = Math.max(0, Math.min(totalFPS, currentFrame + frames));
      const time = frameToTime(targetFrame, effectiveFps, duration || 0);
      setCurrentTime(time);
      seekVideo(time);
      if (!paused) {
        setPaused(true);
      }
    },
    [currentTime, duration, effectiveFps, paused, seekVideo, totalFPS],
  );

  const setPositionAsync = useCallback(
    (time, play) => {
      const numericTime = Number.isFinite(time) ? time : 0;
      const position = Math.max(0, Math.min(duration || 0, numericTime));
      setCurrentTime(position);
      seekVideo(position);
      play ? setPaused(false) : setPaused(true);
    },
    [duration, seekVideo],
  );

  const updateTrimRange = useCallback(
    (low, high) => {
      const snappedLow = frameToTime(timeToFrame(low, effectiveFps, totalFPS), effectiveFps, duration || 0);
      const snappedHigh = frameToTime(timeToFrame(high, effectiveFps, totalFPS), effectiveFps, duration || 0);
      if (snappedHigh - snappedLow < stepSize * 0.999) {
        Toast.show('Trim range must be at least one frame');
        return;
      }
      setStartTime(snappedLow);
      setEndTime(snappedHigh);
    },
    [duration, effectiveFps, stepSize, totalFPS],
  );

  const openFrameJump = useCallback(() => {
    setPaused(true);
    setJumpFrame(String(currentFPS));
    setJumpVisible(true);
  }, [currentFPS]);

  const submitFrameJump = useCallback(() => {
    const parsedFrame = Number.parseInt(jumpFrame, 10);
    const targetFrame = Number.isFinite(parsedFrame) ? Math.max(0, Math.min(totalFPS, parsedFrame)) : currentFPS;
    setPositionAsync(frameToTime(targetFrame, effectiveFps, duration || 0));
    setJumpVisible(false);
  }, [currentFPS, duration, effectiveFps, jumpFrame, setPositionAsync, totalFPS]);

  const setTrimIn = useCallback(() => {
    const value = frameToTime(currentFPS, effectiveFps, duration || 0);
    if (value > endTime - stepSize) {
      Toast.show('In must be at least one frame before Out');
      return;
    }
    setStartTime(value);
  }, [currentFPS, duration, effectiveFps, endTime, stepSize]);

  const setTrimOut = useCallback(() => {
    const value = frameToTime(currentFPS, effectiveFps, duration || 0);
    if (value < startTime + stepSize) {
      Toast.show('Out must be at least one frame after In');
      return;
    }
    setEndTime(value);
  }, [currentFPS, duration, effectiveFps, startTime, stepSize]);

  const captureFrame = useCallback(async () => {
    const directory = `${RNFS.CachesDirectoryPath}/frameCaptureCache`;
    try {
      setPaused(true);
      setSettingsVisible(false);
      setCapturing(true);
      await RNFS.mkdir(directory);
      const safeTitle = (title || `sakuga_${id}`).replace(/[^a-z0-9_.-]+/gi, '_');
      const path = `${directory}/${safeTitle}_${id}_${Date.now()}.png`;
      const safeUrl = String(url).replace(/"/g, '\\"');
      const filter = flipped ? '-vf hflip ' : '';
      const command = `-nostats -loglevel 0 -ss ${currentTime.toFixed(
        6,
      )} -i "${safeUrl}" ${filter}-frames:v 1 "${path}"`;
      const result = await RNFFmpeg.execute(command);
      if (result !== 0) {
        throw new Error(`FFmpeg exited with code ${result}`);
      }
      setCapturePath(path);
      setCaptureVisible(true);
    } catch (error) {
      console.log('CAPTURE_FRAME_ERROR: ', error);
      Toast.show('Could not capture this frame');
    } finally {
      if (mounted.current) {
        setCapturing(false);
      }
    }
  }, [currentTime, flipped, id, title, url]);

  const shareCapture = useCallback(async () => {
    if (!capturePath) {
      return;
    }
    try {
      await Share.open({
        title: 'Share frame',
        message: title || 'Sakuga frame',
        failOnCancel: false,
        url: Platform.OS === 'android' ? `file://${capturePath}` : capturePath,
        type: 'image/png',
      });
    } catch (error) {
      console.log('SHARE_FRAME_ERROR: ', error);
      Toast.show('Could not share this frame');
    }
  }, [capturePath, title]);

  const saveCapture = useCallback(async () => {
    if (!capturePath) {
      return;
    }
    try {
      if (Platform.OS === 'android') {
        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        if (!hasPermission) {
          const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            Toast.show('Storage permission is needed to save frames');
            return;
          }
        }
      }
      const destination = `${RNFS.DownloadDirectoryPath}/${capturePath.split('/').pop()}`;
      await RNFS.copyFile(capturePath, destination);
      Toast.show('Frame saved to Downloads');
    } catch (error) {
      console.log('SAVE_FRAME_ERROR: ', error);
      Toast.show('Could not save this frame');
    }
  }, [capturePath]);

  const onProgress = useCallback(
    (progress) => {
      if (!paused && progress.currentTime >= endTime) {
        setCurrentTime(startTime);
        seekVideo(startTime);
        return;
      }
      setCurrentTime(progress.currentTime);
    },
    [endTime, paused, seekVideo, startTime],
  );

  const onPlaybackEnd = useCallback(() => {
    setCurrentTime(startTime);
    seekVideo(startTime);
    setPaused(false);
  }, [seekVideo, startTime]);

  if (loading || loadError) {
    return (
      <Layout style={styles.root}>
        <SafeAreaView style={styles.root}>
          <TopNavigation
            title="Frames Trim"
            subtitle={`${formatSeconds(currentTime)} ~ ${formatSeconds(endTime)}`}
            alignment="center"
            accessoryLeft={renderLeftAction}
          />
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
            <Layout style={[styles.videoSurface, flipped && styles.flippedVideo]}>
              <VideoPlayer
                ref={video}
                paused={paused}
                repeat={false}
                muted={true}
                source={videoSource}
                resizeMode="contain"
                onProgress={onProgress}
                onEnd={onPlaybackEnd}
                progressUpdateInterval={50}
                disableFullscreen
                disablePlayPause
                disableVolume
                disableTimer
                disableBack
                disableSeekbar
                scrubbing={1}
                controlAnimationTiming={1}
                controlTimeout={1}
                showOnStart={false}
                rate={rate}
              />
            </Layout>
            {capturing && <ActivityIndicator style={styles.captureProgress} size="large" color="#E3170A" />}
          </Layout>

          <Layout style={styles.controlPanel}>
            <Layout style={styles.statusRow}>
              <Button testID="frame-readout" appearance="ghost" style={styles.frameReadout} onPress={openFrameJump}>
                <Text status="primary" category="s1">{`Frame ${currentFPS} / ${totalFPS}`}</Text>
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
                  delayPressIn={0}
                  delayPressOut={0}
                  appearance="ghost"
                  style={styles.stepButton}
                  onPress={() => stepByFrames(frames)}>
                  {`${frames}f`}
                </Button>
              ))}
              <Button
                testID="play-toggle"
                delayPressIn={0}
                delayPressOut={0}
                appearance="ghost"
                style={styles.playButton}
                onPress={toggleVideo}
                accessoryRight={paused ? PlayIcon : PauseIcon}
              />
              {[1, 2, 3].map((frames) => (
                <Button
                  key={frames}
                  testID={`step-${frames}`}
                  delayPressIn={0}
                  delayPressOut={0}
                  appearance="ghost"
                  style={styles.stepButton}
                  onPress={() => stepByFrames(frames)}>
                  {`+${frames}f`}
                </Button>
              ))}
            </ScrollView>

            {duration && (
              <React.Fragment>
                <FramesTimeline
                  testID="frames-timeline"
                  duration={duration}
                  fps={effectiveFps}
                  position={currentTime}
                  rangeStart={startTime}
                  rangeEnd={endTime}
                  onSeek={(time) => setPositionAsync(time)}
                  onRangeChange={updateTrimRange}
                  onInteractionStart={() => setPaused(true)}
                />
                <Layout style={styles.trimActions}>
                  <Button testID="set-in" appearance="outline" style={styles.trimAction} onPress={setTrimIn}>
                    Set In
                  </Button>
                  <Button testID="set-out" appearance="outline" style={styles.trimAction} onPress={setTrimOut}>
                    Set Out
                  </Button>
                </Layout>
              </React.Fragment>
            )}
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
                onPress={() => setRate(speed)}>
                {`${speed}×`}
              </Button>
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
                onPress={() => setFpsMode(option.value)}>
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
            <Image
              style={styles.captureImage}
              resizeMode="contain"
              source={{ uri: Platform.OS === 'android' ? `file://${capturePath}` : capturePath }}
            />
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
  root: {
    flex: 1,
  },
  transportIcon: {
    width: 25,
    height: 25,
  },
  editor: {
    flex: 1,
  },
  editorContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  videoStage: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  videoSurface: {
    width: '100%',
    height: '100%',
  },
  controlPanel: {
    width: '100%',
    paddingTop: 10,
  },
  statusRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  frameReadout: {
    minHeight: 44,
    paddingHorizontal: 4,
  },
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
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    marginTop: 16,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  dialogCard: {
    width: 300,
  },
  dialogTitle: {
    marginBottom: 12,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  trimActions: {
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 6,
  },
  trimAction: {
    flex: 1,
    minHeight: 44,
    marginHorizontal: 4,
  },
  flippedVideo: {
    transform: [{ scaleX: -1 }],
  },
  settingsCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'flex-end',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  settingsModal: {
    width: '100%',
    justifyContent: 'flex-end',
    margin: 0,
  },
  settingsLabel: {
    marginTop: 16,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionButton: {
    minHeight: 44,
    marginRight: 6,
    marginBottom: 6,
  },
  fpsButton: {
    minHeight: 44,
    marginRight: 8,
    marginBottom: 8,
  },
  flipToggle: {
    minHeight: 44,
    marginVertical: 10,
  },
  captureButton: {
    minHeight: 48,
    marginBottom: 6,
  },
  captureCard: {
    width: '94%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  captureImage: {
    width: '100%',
    height: 360,
    backgroundColor: '#000000',
  },
  captureActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  captureProgress: {
    position: 'absolute',
    alignSelf: 'center',
  },
});
