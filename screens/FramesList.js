import React, { useCallback, useEffect, useState, useRef } from 'react';
import { SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { Divider, Layout, TopNavigation, TopNavigationAction, Icon, Text, Button } from '@ui-kitten/components';
import FastImage from 'react-native-fast-image';
import { RNFFmpeg } from 'react-native-ffmpeg';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import Toast from 'react-native-simple-toast';
import ImageView from 'react-native-image-viewing';
import { saveMediaToDownloads } from '../util/mediaStore';

const BackIcon = (props) => <Icon {...props} name="arrow-back-outline" />;
const CloseIcon = (props) => <Icon {...props} name="close-outline" />;
const CheckmarkIcon = (props) => (
  <Icon
    style={{ position: 'absolute', bottom: 2, right: 2, width: 25, height: 25, zIndex: 10 }}
    name="checkmark-circle-2"
    fill="#E3170A"
  />
);
const SelectIcon = () => <Text category="s2">Select</Text>;
const DownloadIcon = (props) => <Icon {...props} name="download-outline" />;
const ShareIcon = (props) => <Icon {...props} name="share-outline" />;

const formatSeconds = (seconds) => {
  return new Date(seconds ? seconds * 1000 : 0).toISOString().substr(14, 8);
};

export const FramesListScreen = ({ navigation, route }) => {
  const mounted = useRef(true);
  const executionId = useRef(null);
  const cacheDirectory = useRef(`${RNFS.CachesDirectoryPath}/framesCache/${route.params.id}_${Date.now()}`);
  const startTime = route.params.startTime;
  const endTime = route.params.endTime;
  const id = route.params.id;
  const title = route.params.title;
  const url = route.params.url;

  const [selectView, setSelectView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [frames, setFrames] = useState([]);
  const [visible, setIsVisible] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const getVideoFrames = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const newFrames = [];
      const directory = cacheDirectory.current;
      await RNFS.mkdir(directory);
      const date = new Date().valueOf();
      const dif = startTime - 1;
      const seek = dif <= 0 ? '00:00.0' : formatSeconds(dif);
      const from = dif <= 0 ? '00:00.0' : formatSeconds(startTime - dif);
      const duration = formatSeconds(endTime - startTime);
      const fileName = title.replace(/\s/g, '_').replace(/:/g, '_');
      const args = ['-y', '-nostats', '-loglevel', '0', '-ss', seek, '-i', url, '-ss', from, '-t', duration, '-vsync', '0', '-q:v', '1', `${directory}/${fileName}_${id}_${date}_%06d.jpg`];
      const result = await new Promise(async (resolve, reject) => {
        try {
          executionId.current = await RNFFmpeg.executeAsyncWithArguments(args, ({ returnCode }) => resolve(returnCode));
        } catch (error) {
          reject(error);
        }
      });
      executionId.current = null;
      if (result !== 0) throw new Error(`FFmpeg exited with code ${result}`);
      const dir = await RNFS.readDir(directory);
      for (const d of dir) {
        newFrames.push({
          uri: Platform.OS === 'android' ? 'file://' + d.path : d.path,
        });
      }

      newFrames.sort((a, b) => ('' + a.uri).localeCompare(b.uri));
      if (newFrames.length === 0) throw new Error('FFmpeg produced no frames');

      if (mounted.current) setFrames(newFrames);
      if (mounted.current) setLoading(false);
    } catch (error) {
      console.log('ERROR FRAMES', error);
      if (mounted.current) {
        setLoadError(true);
        setLoading(false);
      }
    }
  }, [startTime, endTime, title, url, id]);

  useEffect(() => {
    const directory = cacheDirectory.current;
    mounted.current = true;
    getVideoFrames();
    return () => {
      mounted.current = false;
      if (executionId.current !== null) RNFFmpeg.cancelExecution(executionId.current);
      RNFS.exists(directory).then((exists) => exists && RNFS.unlink(directory)).catch(() => {});
    };
  }, [getVideoFrames]);

  const toggleSelectView = () => {
    if (selectView) clearSelectedItems();
    setSelectView(!selectView);
  };

  const navigateBack = () => {
    navigation.goBack();
  };
  const renderBackAction = () => <TopNavigationAction icon={BackIcon} onPress={navigateBack} />;

  const renderRightActions = () =>
    loadingImages ? (
      <React.Fragment>
        <ActivityIndicator color="#D4D4D4" />
      </React.Fragment>
    ) : (
      <React.Fragment>
        <TopNavigationAction icon={selectView ? CloseIcon : SelectIcon} onPress={toggleSelectView} />
        {selectView && <TopNavigationAction icon={ShareIcon} onPress={shareMultipleImages} />}
        {selectView && <TopNavigationAction icon={DownloadIcon} onPress={downloadMultipleImages} />}
      </React.Fragment>
    );

  const clearSelectedItems = () => {
    const newFrames = frames.map((f) => ({ uri: f.uri, selected: false }));
    setFrames(newFrames);
  };

  const shareMultipleImages = async () => {
    try {
      setLoadingImages(true);
      const urls = frames.filter((f) => f.selected).map((f) => f.uri);
      if (!urls || urls.length === 0) return Toast.show('Please select a image');
      const shareOptions = {
        title: 'Share frames',
        message: title ? title : 'frames',
        failOnCancel: false,
        urls,
        type: 'image/jpeg',
      };
      await Share.open(shareOptions);
    } catch (error) {
      Toast.show('Error, Please try again later :(');
      console.log('SHARE_MULTIPLE_ERROR: ', error);
    } finally {
      setLoadingImages(false);
    }
  };

  const downloadMultipleImages = async () => {
    try {
      setLoadingImages(true);
      const fileName = title.replace(/\s/g, '_').replace(/:/g, '_');
      const urls = frames.filter((f) => f.selected).map((f, i) => ({ uri: f.uri, name: `${fileName}_${id}_${i}` }));
      if (urls.length === 0) {
        Toast.show('Please select an image');
        return;
      }
      for (const item of urls) {
        await saveMediaToDownloads(item.uri.replace(/^file:\/\//, ''), `${item.name}.jpg`, 'image/jpeg');
      }
      Toast.showWithGravity('Success! Files downloaded', Toast.SHORT, Toast.CENTER);
    } catch (error) {
      Toast.show('Error, Please try again later :(');
      console.log('DOWNLOAD_MULTIPLE_ERROR: ', error);
    } finally {
      setLoadingImages(false);
    }
  };

  const selectItem = (index) => {
    const newFrames = [...frames];
    newFrames[index] = { uri: newFrames[index].uri, selected: newFrames[index].selected ? false : true };
    setFrames(newFrames);
  };

  const openImage = (index) => {
    // RNFetchBlob.ios.openDocument(path);
    setImageIndex(index);
    setIsVisible(true);
  };

  const onItemPress = ({ item, index }) => {
    selectView ? selectItem(index) : openImage(index);
  };

  const renderItem = ({ item, index }) => (
    <TouchableOpacity
      delayPressIn={0}
      delayPressOut={0}
      activeOpacity={0.7}
      style={{ width: '33%', height: 100, marginRight: 2, marginBottom: 2 }}
      onPress={() => onItemPress({ item, index })}>
      <FastImage style={{ width: '100%', height: '100%' }} source={item} />
      {item.selected && <CheckmarkIcon />}
    </TouchableOpacity>
  );

  const keyExtractor = (item) => item.uri;

  const closeImageView = () => setIsVisible(false);

  if (loading || loadError)
    return (
      <Layout style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <TopNavigation
            title="Frames"
            subtitle={`${formatSeconds(startTime)} ~ ${formatSeconds(endTime)}`}
            alignment="center"
            accessoryLeft={renderBackAction}
          />
          <Divider />
          <Layout style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            {loading ? <ActivityIndicator color="#D4D4D4" /> : <React.Fragment><Text>Could not extract frames</Text><Button onPress={getVideoFrames}>Try again</Button></React.Fragment>}
          </Layout>
        </SafeAreaView>
      </Layout>
    );

  return (
    <Layout style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ImageView
          images={frames}
          imageIndex={imageIndex}
          visible={visible}
          onRequestClose={closeImageView}
          swipeToCloseEnabled={false}
        />
        <TopNavigation
          title="Frames"
          subtitle={`${formatSeconds(startTime)} ~ ${formatSeconds(endTime)}`}
          alignment="center"
          accessoryLeft={renderBackAction}
          accessoryRight={renderRightActions}
        />
        <Divider />
        <Layout
          style={{
            flex: 1,
          }}>
          <FlatList
            data={frames}
            initialNumToRender={30}
            maxToRenderPerBatch={15}
            windowSize={18}
            onEndReachedThreshold={8}
            updateCellsBatchingPeriod={100}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={3}
            columnWrapperStyle={{
              flex: 1,
              justifyContent: 'flex-start',
            }}
          />
        </Layout>
        <Divider />
      </SafeAreaView>
    </Layout>
  );
};
