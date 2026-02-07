import React, { useCallback, useEffect, useRef } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { MovingModalQuestion } from './moving.types';

export interface MovingAnalysisModalProps {
  visible: boolean;
  currentQuestion: MovingModalQuestion | null;
  apartmentSize: string;
  setApartmentSize: (value: string) => void;
  packingStatus: '' | 'packed' | 'not-packed';
  setPackingStatus: (value: '' | 'packed' | 'not-packed') => void;
  needsTruck: '' | 'yes' | 'no';
  setNeedsTruck: (value: '' | 'yes' | 'no') => void;
  boxesNeeded: '' | 'yes' | 'no';
  setBoxesNeeded: (value: '' | 'yes' | 'no') => void;
  optionalDetails: string;
  setOptionalDetails: (value: string) => void;
  attachments: AttachmentAsset[];
  setAttachments: React.Dispatch<React.SetStateAction<AttachmentAsset[]>>;
  onBack: () => void;
  onNext: () => void;
  showModal: (config: { title: string; message: string }) => void;
}

export const MovingAnalysisModal: React.FC<MovingAnalysisModalProps> = ({
  visible,
  currentQuestion,
  apartmentSize,
  setApartmentSize,
  packingStatus,
  setPackingStatus,
  needsTruck,
  setNeedsTruck,
  boxesNeeded,
  setBoxesNeeded,
  optionalDetails,
  setOptionalDetails,
  attachments,
  setAttachments,
  onBack,
  onNext,
  showModal,
}) => {
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      animation.setValue(0);
      Animated.timing(animation, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(animation, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, animation]);

  const handleMediaUpload = useCallback(
    async (options?: { source?: 'camera' | 'library' }) => {
      try {
        if (options?.source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            showModal({
              title: 'Permission needed',
              message: 'Enable camera access to take photos.',
            });
            return;
          }

          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: false,
            quality: 0.8,
          });

          if (result.canceled || !(result.assets && result.assets.length > 0)) {
            return;
          }

          const newAssets = result.assets.map((asset: any) => ({
            uri: asset.uri,
            type: asset.type === 'video' ? 'video' : 'photo',
            name: asset.fileName ?? (asset.type === 'video' ? 'video-upload.mp4' : 'photo-upload.jpg'),
          } as AttachmentAsset));

          setAttachments(prev => [...prev, ...newAssets]);
          return;
        }

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showModal({
            title: 'Permission needed',
            message: 'Enable photo library access to attach images or videos.',
          });
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          quality: 0.8,
        });

        if (result.canceled || !(result.assets && result.assets.length > 0)) {
          return;
        }

        const newAssets = result.assets.map((asset: any) => ({
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'photo',
          name: asset.fileName ?? (asset.type === 'video' ? 'video-upload.mp4' : 'photo-upload.jpg'),
        } as AttachmentAsset));

        setAttachments(prev => [...prev, ...newAssets]);
      } catch (error) {
        console.warn('Media picker error', error);
        showModal({
          title: 'Upload failed',
          message: 'Unable to select media right now.',
        });
      }
    },
    [setAttachments, showModal]
  );

  const handleUploadPhotosPress = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Take Photo', 'Upload from Camera Roll', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleMediaUpload({ source: 'camera' });
          } else if (buttonIndex === 1) {
            handleMediaUpload({ source: 'library' });
          }
        }
      );
      return;
    }

    Alert.alert('Upload Photos', 'Choose an option', [
      { text: 'Take Photo', onPress: () => handleMediaUpload({ source: 'camera' }) },
      { text: 'Upload from Camera Roll', onPress: () => handleMediaUpload({ source: 'library' }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleMediaUpload]);

  const isNextDisabled =
    currentQuestion === 'uploadPhotos' || currentQuestion === 'details'
      ? false
      : (currentQuestion === 'apartmentSize' && !apartmentSize.trim()) ||
        (currentQuestion === 'packingStatus' && !packingStatus) ||
        (currentQuestion === 'needsTruck' && !needsTruck) ||
        (currentQuestion === 'boxesNeeded' && !boxesNeeded);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => {}}>
      <View style={styles.overlayBackground}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <Animated.View
            style={[
              styles.modal,
              {
                opacity: animation,
                transform: [
                  {
                    translateY: animation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {currentQuestion === 'apartmentSize' && (
              <>
                <Text style={styles.title}>How big is your apartment?</Text>
                <Text style={styles.message}>This will help us determine the best price for your service.</Text>
                <View style={styles.optionsContainer}>
                  {['Studio', '1BR', '2BR', '3BR', '4BR+'].map((size) => (
                    <Pressable
                      key={size}
                      style={[styles.option, apartmentSize === size && styles.optionSelected]}
                      onPress={() => setApartmentSize(size)}
                    >
                      <Text style={[styles.optionText, apartmentSize === size && styles.optionTextSelected]}>
                        {size === '1BR' ? '1 Bedroom' : size === '2BR' ? '2 Bedrooms' : size === '3BR' ? '3 Bedrooms' : size === '4BR+' ? '4+ Bedrooms' : size}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {currentQuestion === 'packingStatus' && (
              <>
                <Text style={styles.title}>Do you need help packing?</Text>
                <Text style={styles.message}>Let your helpr know if you need your things packed into boxes.</Text>
                <View style={styles.optionsContainer}>
                  <Pressable
                    style={[styles.option, packingStatus === 'not-packed' && styles.optionSelected]}
                    onPress={() => setPackingStatus('not-packed')}
                  >
                    <Text style={[styles.optionText, packingStatus === 'not-packed' && styles.optionTextSelected]}>
                      Yes, I need help packing
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.option, packingStatus === 'packed' && styles.optionSelected]}
                    onPress={() => setPackingStatus('packed')}
                  >
                    <Text style={[styles.optionText, packingStatus === 'packed' && styles.optionTextSelected]}>
                      No, everything is already packed
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {currentQuestion === 'needsTruck' && (
              <>
                <Text style={styles.title}>Do you need a moving truck?</Text>
                <Text style={styles.message}>This helps us determine the right equipment and pricing.</Text>
                <View style={styles.optionsContainer}>
                  <Pressable
                    style={[styles.option, needsTruck === 'yes' && styles.optionSelected]}
                    onPress={() => setNeedsTruck('yes')}
                  >
                    <Text style={[styles.optionText, needsTruck === 'yes' && styles.optionTextSelected]}>
                      Yes, I need a truck
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.option, needsTruck === 'no' && styles.optionSelected]}
                    onPress={() => setNeedsTruck('no')}
                  >
                    <Text style={[styles.optionText, needsTruck === 'no' && styles.optionTextSelected]}>
                      No, I don't need a truck
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {currentQuestion === 'boxesNeeded' && (
              <>
                <Text style={styles.title}>Do you need boxes?</Text>
                <Text style={styles.message}>Let your helpr know if they should bring moving boxes.</Text>
                <View style={styles.optionsContainer}>
                  <Pressable
                    style={[styles.option, boxesNeeded === 'yes' && styles.optionSelected]}
                    onPress={() => setBoxesNeeded('yes')}
                  >
                    <Text style={[styles.optionText, boxesNeeded === 'yes' && styles.optionTextSelected]}>
                      Yes, please bring boxes
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.option, boxesNeeded === 'no' && styles.optionSelected]}
                    onPress={() => setBoxesNeeded('no')}
                  >
                    <Text style={[styles.optionText, boxesNeeded === 'no' && styles.optionTextSelected]}>
                      No, I have boxes
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {currentQuestion === 'uploadPhotos' && (
              <>
                <Text style={styles.title}>Upload photos for a more accurate price quote?</Text>
                <Text style={styles.message}>Photos of your space help us provide the best estimate.</Text>
                <View style={styles.optionsContainer}>
                  <View style={styles.thumbnailsList}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailsScroll}>
                      {attachments.map((att, idx) => (
                        <View key={att.uri ?? idx} style={styles.thumbnailWrapper}>
                          <Image source={{ uri: att.uri }} style={styles.thumbnailImage} />
                          <Pressable
                            style={styles.thumbnailRemoveButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              setAttachments(prev => prev.filter((_, i) => i !== idx));
                            }}
                          >
                            <Text style={styles.thumbnailRemoveText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                      <View style={styles.thumbnailAddContainer}>
                        <Pressable style={styles.thumbnailAddButton} onPress={handleUploadPhotosPress}>
                          <Text style={styles.thumbnailAddText}>+</Text>
                        </Pressable>
                        <Text style={styles.thumbnailAddLabel}>Add photo</Text>
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </>
            )}

            {currentQuestion === 'details' && (
              <>
                <Text style={styles.title}>Details (optional)</Text>
                <Text style={styles.message}>Anything else you'd like us to know?</Text>
                <TextInput
                  style={styles.input}
                  value={optionalDetails}
                  onChangeText={setOptionalDetails}
                  placeholder="Add any other information..."
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#777"
                />
              </>
            )}

            <View style={styles.buttonsRow}>
              <Pressable style={styles.cancelButton} onPress={onBack}>
                <Text style={styles.cancelButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.nextButton, isNextDisabled && styles.nextButtonDisabled]}
                onPress={onNext}
                disabled={isNextDisabled}
              >
                <Text style={styles.nextButtonText}>
                  {currentQuestion === 'details' ? 'Done' : 'Next'}
                </Text>
              </Pressable>
            </View>
            {currentQuestion === 'uploadPhotos' && (
              <View style={styles.skipRow}>
                <Pressable style={styles.skipButton} onPress={onNext}>
                  <Text style={styles.skipText}>Skip ›</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modal: {
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#49454F',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 21,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  option: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5DCC9',
  },
  optionSelected: {
    backgroundColor: '#0c4309',
    borderColor: '#0c4309',
  },
  optionText: {
    fontSize: 16,
    color: '#333333',
    textAlign: 'center',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5DCC9',
    marginBottom: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#E5DCC9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#0c4309',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  skipRow: {
    marginTop: 12,
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: '#49454F',
    fontSize: 15,
    fontWeight: '500',
  },
  thumbnailsList: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  thumbnailsScroll: {
    gap: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  thumbnailWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailRemoveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  thumbnailAddContainer: {
    alignItems: 'center',
  },
  thumbnailAddButton: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5DCC9',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  thumbnailAddText: {
    fontSize: 28,
    color: '#0c4309',
    fontWeight: '300',
  },
  thumbnailAddLabel: {
    fontSize: 12,
    color: '#49454F',
    marginTop: 6,
  },
});






