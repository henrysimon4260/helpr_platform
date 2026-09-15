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

import { AttachmentAsset } from '../AttachmentThumbnails/types';
import { QuestionDef } from './types';

export interface ServiceQuestionsModalProps {
  visible: boolean;
  questions: QuestionDef[];
  currentQuestionId: string | null;
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  attachments: AttachmentAsset[];
  setAttachments: React.Dispatch<React.SetStateAction<AttachmentAsset[]>>;
  onBack: () => void;
  onNext: () => void;
  showModal: (config: { title: string; message: string }) => void;
}

export const ServiceQuestionsModal: React.FC<ServiceQuestionsModalProps> = ({
  visible,
  questions,
  currentQuestionId,
  answers,
  onAnswer,
  attachments,
  setAttachments,
  onBack,
  onNext,
  showModal,
}) => {
  const animation = useRef(new Animated.Value(0)).current;
  const currentQuestion = questions.find(q => q.id === currentQuestionId) ?? null;
  const currentValue = currentQuestion ? answers[currentQuestion.id] ?? '' : '';

  useEffect(() => {
    Animated.timing(animation, {
      toValue: visible ? 1 : 0,
      duration: visible ? 250 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, animation]);

  const handleMediaUpload = useCallback(
    async (options?: { source?: 'camera' | 'library' }) => {
      try {
        if (options?.source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            showModal({ title: 'Permission needed', message: 'Enable camera access to take photos.' });
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: false,
            quality: 0.8,
          });
          if (result.canceled || !result.assets?.length) return;
          setAttachments(prev => [
            ...prev,
            ...result.assets.map(asset => ({
              uri: asset.uri,
              type: asset.type === 'video' ? 'video' as const : 'photo' as const,
              name: asset.fileName ?? 'photo-upload.jpg',
            })),
          ]);
          return;
        }

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showModal({ title: 'Permission needed', message: 'Enable photo library access to attach images or videos.' });
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          quality: 0.8,
        });
        if (result.canceled || !result.assets?.length) return;
        setAttachments(prev => [
          ...prev,
          ...result.assets.map(asset => ({
            uri: asset.uri,
            type: asset.type === 'video' ? 'video' as const : 'photo' as const,
            name: asset.fileName ?? (asset.type === 'video' ? 'video-upload.mp4' : 'photo-upload.jpg'),
          })),
        ]);
      } catch {
        showModal({ title: 'Upload failed', message: 'Unable to select media right now.' });
      }
    },
    [setAttachments, showModal],
  );

  const handleUploadPhotosPress = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take Photo', 'Upload from Camera Roll', 'Cancel'], cancelButtonIndex: 2 },
        buttonIndex => {
          if (buttonIndex === 0) handleMediaUpload({ source: 'camera' });
          else if (buttonIndex === 1) handleMediaUpload({ source: 'library' });
        },
      );
      return;
    }
    Alert.alert('Upload Photos', 'Choose an option', [
      { text: 'Take Photo', onPress: () => handleMediaUpload({ source: 'camera' }) },
      { text: 'Upload from Camera Roll', onPress: () => handleMediaUpload({ source: 'library' }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleMediaUpload]);

  const isOptional = currentQuestion?.required === false || currentQuestion?.kind === 'photos';
  const isNextDisabled = !isOptional && currentQuestion?.kind !== 'photos' && !currentValue.trim();
  const isLast = currentQuestionId != null && questions[questions.length - 1]?.id === currentQuestionId;

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
                transform: [{ translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              },
            ]}
          >
            {currentQuestion?.kind === 'choice' && (
              <>
                <Text style={styles.title}>{currentQuestion.title}</Text>
                <Text style={styles.message}>{currentQuestion.message}</Text>
                <View style={styles.optionsContainer}>
                  {currentQuestion.options?.map(option => {
                    const selected = currentValue === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        style={[styles.option, selected && styles.optionSelected]}
                        onPress={() => onAnswer(currentQuestion.id, option.value)}
                      >
                        <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                        {option.description ? (
                          <Text style={[styles.optionDescription, selected && styles.optionTextSelected]}>
                            {option.description}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {currentQuestion?.kind === 'text' && (
              <>
                <Text style={styles.title}>{currentQuestion.title}</Text>
                <Text style={styles.message}>{currentQuestion.message}</Text>
                <TextInput
                  style={styles.input}
                  value={currentValue}
                  onChangeText={value => onAnswer(currentQuestion.id, value)}
                  placeholder={currentQuestion.placeholder ?? 'Add details...'}
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#777"
                />
              </>
            )}

            {currentQuestion?.kind === 'photos' && (
              <>
                <Text style={styles.title}>{currentQuestion.title}</Text>
                <Text style={styles.message}>{currentQuestion.message}</Text>
                <View style={styles.optionsContainer}>
                  <View style={styles.thumbnailsList}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailsScroll}>
                      {attachments.map((att, idx) => (
                        <View key={att.uri ?? idx} style={styles.thumbnailWrapper}>
                          <Image source={{ uri: att.uri }} style={styles.thumbnailImage} />
                          <Pressable
                            style={styles.thumbnailRemoveButton}
                            onPress={e => {
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

            <View style={styles.buttonsRow}>
              <Pressable style={styles.cancelButton} onPress={onBack}>
                <Text style={styles.cancelButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.nextButton, isNextDisabled && styles.nextButtonDisabled]}
                onPress={onNext}
                disabled={isNextDisabled}
              >
                <Text style={styles.nextButtonText}>{isLast ? 'Done' : 'Next'}</Text>
              </Pressable>
            </View>
            {currentQuestion?.kind === 'photos' && (
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
  optionDescription: {
    fontSize: 13,
    color: '#7C7160',
    textAlign: 'center',
    marginTop: 4,
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
