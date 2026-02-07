import React from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { styles } from './moving.styles';
import { MovingModalQuestion } from './moving.types';

interface MovingQuestionsModalProps {
  visible: boolean;
  currentQuestion: MovingModalQuestion | null;
  animation: Animated.Value;
  
  // State values
  apartmentSize: string;
  packingStatus: '' | 'packed' | 'not-packed';
  needsTruck: '' | 'yes' | 'no';
  boxesNeeded: '' | 'yes' | 'no';
  optionalDetails: string;
  attachments: AttachmentAsset[];
  
  // State setters
  onApartmentSizeChange: (size: string) => void;
  onPackingStatusChange: (status: '' | 'packed' | 'not-packed') => void;
  onNeedsTruckChange: (needs: '' | 'yes' | 'no') => void;
  onBoxesNeededChange: (needs: '' | 'yes' | 'no') => void;
  onOptionalDetailsChange: (details: string) => void;
  onRemoveAttachment: (index: number) => void;
  
  // Actions
  onBack: () => void;
  onNext: () => void;
  onUploadPhotos: () => void;
}

export const MovingQuestionsModal: React.FC<MovingQuestionsModalProps> = ({
  visible,
  currentQuestion,
  animation,
  apartmentSize,
  packingStatus,
  needsTruck,
  boxesNeeded,
  optionalDetails,
  attachments,
  onApartmentSizeChange,
  onPackingStatusChange,
  onNeedsTruckChange,
  onBoxesNeededChange,
  onOptionalDetailsChange,
  onRemoveAttachment,
  onBack,
  onNext,
  onUploadPhotos,
}) => {
  const isNextDisabled =
    currentQuestion === 'uploadPhotos' || currentQuestion === 'details'
      ? false
      : (currentQuestion === 'apartmentSize' && !apartmentSize.trim()) ||
        (currentQuestion === 'packingStatus' && !packingStatus) ||
        (currentQuestion === 'needsTruck' && !needsTruck) ||
        (currentQuestion === 'boxesNeeded' && !boxesNeeded);

  const formatApartmentSizeLabel = (size: string) => {
    switch (size) {
      case '1BR': return '1 Bedroom';
      case '2BR': return '2 Bedrooms';
      case '3BR': return '3 Bedrooms';
      case '4BR+': return '4+ Bedrooms';
      default: return size;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => {}}
    >
      <View style={styles.movingAnalysisOverlayBackground}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <Animated.View
            style={[
              styles.movingAnalysisModal,
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
            {/* Apartment Size */}
            {currentQuestion === 'apartmentSize' && (
              <>
                <Text style={styles.movingAnalysisTitle}>How big is your apartment?</Text>
                <Text style={styles.movingAnalysisMessage}>
                  This will help us determine the best price for your service.
                </Text>
                <View style={styles.movingAnalysisOptionsContainer}>
                  {['Studio', '1BR', '2BR', '3BR', '4BR+'].map((size) => (
                    <Pressable
                      key={size}
                      style={[
                        styles.movingAnalysisOption,
                        apartmentSize === size && styles.movingAnalysisOptionSelected,
                      ]}
                      onPress={() => onApartmentSizeChange(size)}
                    >
                      <Text
                        style={[
                          styles.movingAnalysisOptionText,
                          apartmentSize === size && styles.movingAnalysisOptionTextSelected,
                        ]}
                      >
                        {formatApartmentSizeLabel(size)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* Packing Status */}
            {currentQuestion === 'packingStatus' && (
              <>
                <Text style={styles.movingAnalysisTitle}>Do you need help packing?</Text>
                <Text style={styles.movingAnalysisMessage}>
                  Let your helpr know if you need your things packed into boxes.
                </Text>
                <View style={styles.movingAnalysisOptionsContainer}>
                  <Pressable
                    style={[
                      styles.movingAnalysisOption,
                      packingStatus === 'not-packed' && styles.movingAnalysisOptionSelected,
                    ]}
                    onPress={() => onPackingStatusChange('not-packed')}
                  >
                    <Text
                      style={[
                        styles.movingAnalysisOptionText,
                        packingStatus === 'not-packed' && styles.movingAnalysisOptionTextSelected,
                      ]}
                    >
                      Yes, I need help packing
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.movingAnalysisOption,
                      packingStatus === 'packed' && styles.movingAnalysisOptionSelected,
                    ]}
                    onPress={() => onPackingStatusChange('packed')}
                  >
                    <Text
                      style={[
                        styles.movingAnalysisOptionText,
                        packingStatus === 'packed' && styles.movingAnalysisOptionTextSelected,
                      ]}
                    >
                      No, everything is already packed
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Needs Truck */}
            {currentQuestion === 'needsTruck' && (
              <>
                <Text style={styles.movingAnalysisTitle}>Do you need a moving truck?</Text>
                <Text style={styles.movingAnalysisMessage}>
                  This helps us determine the right equipment and pricing.
                </Text>
                <View style={styles.movingAnalysisOptionsContainer}>
                  <Pressable
                    style={[
                      styles.movingAnalysisOption,
                      needsTruck === 'yes' && styles.movingAnalysisOptionSelected,
                    ]}
                    onPress={() => onNeedsTruckChange('yes')}
                  >
                    <Text
                      style={[
                        styles.movingAnalysisOptionText,
                        needsTruck === 'yes' && styles.movingAnalysisOptionTextSelected,
                      ]}
                    >
                      Yes, I need a truck
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.movingAnalysisOption,
                      needsTruck === 'no' && styles.movingAnalysisOptionSelected,
                    ]}
                    onPress={() => onNeedsTruckChange('no')}
                  >
                    <Text
                      style={[
                        styles.movingAnalysisOptionText,
                        needsTruck === 'no' && styles.movingAnalysisOptionTextSelected,
                      ]}
                    >
                      No, I don't need a truck
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Boxes Needed */}
            {currentQuestion === 'boxesNeeded' && (
              <>
                <Text style={styles.movingAnalysisTitle}>Do you need boxes?</Text>
                <Text style={styles.movingAnalysisMessage}>
                  Let your helpr know if they should bring moving boxes.
                </Text>
                <View style={styles.movingAnalysisOptionsContainer}>
                  <Pressable
                    style={[
                      styles.movingAnalysisOption,
                      boxesNeeded === 'yes' && styles.movingAnalysisOptionSelected,
                    ]}
                    onPress={() => onBoxesNeededChange('yes')}
                  >
                    <Text
                      style={[
                        styles.movingAnalysisOptionText,
                        boxesNeeded === 'yes' && styles.movingAnalysisOptionTextSelected,
                      ]}
                    >
                      Yes, please bring boxes
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.movingAnalysisOption,
                      boxesNeeded === 'no' && styles.movingAnalysisOptionSelected,
                    ]}
                    onPress={() => onBoxesNeededChange('no')}
                  >
                    <Text
                      style={[
                        styles.movingAnalysisOptionText,
                        boxesNeeded === 'no' && styles.movingAnalysisOptionTextSelected,
                      ]}
                    >
                      No, I have boxes
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Upload Photos */}
            {currentQuestion === 'uploadPhotos' && (
              <>
                <Text style={styles.movingAnalysisTitle}>
                  Upload photos for a more accurate price quote?
                </Text>
                <Text style={styles.movingAnalysisMessage}>
                  Photos of your space help us provide the best estimate.
                </Text>
                <View style={styles.movingAnalysisOptionsContainer}>
                  <View style={styles.thumbnailsListModal}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.thumbnailsScrollModal}
                    >
                      {attachments.map((att, idx) => (
                        <View key={att.uri ?? idx} style={styles.thumbnailWrapperModal}>
                          <Image source={{ uri: att.uri }} style={styles.thumbnailImage} />
                          <Pressable
                            style={styles.thumbnailRemoveButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              onRemoveAttachment(idx);
                            }}
                          >
                            <Text style={styles.thumbnailRemoveText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                      <View style={styles.thumbnailAddContainerModal}>
                        <Pressable style={styles.thumbnailAddButton} onPress={onUploadPhotos}>
                          <Text style={styles.thumbnailAddText}>+</Text>
                        </Pressable>
                        <Text style={styles.thumbnailAddLabelTextModal}>Add photo</Text>
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </>
            )}

            {/* Details */}
            {currentQuestion === 'details' && (
              <>
                <Text style={styles.movingAnalysisTitle}>Details (optional)</Text>
                <Text style={styles.movingAnalysisMessage}>
                  Anything else you'd like us to know?
                </Text>
                <TextInput
                  style={styles.movingAnalysisInput}
                  value={optionalDetails}
                  onChangeText={onOptionalDetailsChange}
                  placeholder="Add any other information..."
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#777"
                />
              </>
            )}

            {/* Action Buttons */}
            <View style={styles.movingAnalysisButtonsRow}>
              <Pressable style={styles.movingAnalysisCancelButton} onPress={onBack}>
                <Text style={styles.movingAnalysisCancelButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.movingAnalysisButton,
                  isNextDisabled && styles.movingAnalysisButtonDisabled,
                ]}
                onPress={onNext}
                disabled={isNextDisabled}
              >
                <Text style={styles.movingAnalysisButtonText}>
                  {currentQuestion === 'details' ? 'Done' : 'Next'}
                </Text>
              </Pressable>
            </View>

            {/* Skip Button for Upload Photos */}
            {currentQuestion === 'uploadPhotos' && (
              <View style={styles.movingAnalysisSkipRowBelow}>
                <Pressable style={styles.movingAnalysisSkipButton} onPress={onNext}>
                  <Text style={styles.movingAnalysisSkipText}>Skip ›</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};






