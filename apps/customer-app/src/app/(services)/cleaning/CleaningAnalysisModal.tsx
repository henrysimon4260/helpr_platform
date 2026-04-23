import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { AttachmentAsset } from './cleaning.types';
import { styles } from './cleaning.styles';

const cameraIconSvg = `
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke="#ffffff" stroke-width="2"/>
    <circle cx="12" cy="13" r="4" fill="none" stroke="#ffffff" stroke-width="2"/>
  </svg>
`;

// ─── Cleaning Type Modal ────────────────────────────────────────────────────

interface CleaningTypeModalProps {
  visible: boolean;
  cleaningType: '' | 'basic' | 'deep';
  onSelect: (type: 'basic' | 'deep') => void;
  onClose: () => void;
}

export const CleaningTypeModal: React.FC<CleaningTypeModalProps> = ({
  visible,
  cleaningType,
  onSelect,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.signInModal}>
        <Text style={styles.signInTitle}>Select Cleaning Type</Text>
        <View style={styles.signInDivider} />
        <Text style={styles.signInMessage}>
          Please select the type of cleaning you need:
        </Text>
        <View style={styles.cleaningTypeOptionsContainer}>
          <Pressable
            style={[styles.cleaningTypeOption, cleaningType === 'basic' && styles.cleaningTypeOptionSelected]}
            onPress={() => onSelect('basic')}
          >
            <Text style={[styles.cleaningTypeOptionText, cleaningType === 'basic' && styles.cleaningTypeOptionTextSelected]}>
              Basic Cleaning
            </Text>
            <Text style={styles.cleaningTypeOptionDescription}>
              General tidying, dusting, vacuuming, and surface cleaning
            </Text>
          </Pressable>
          <Pressable
            style={[styles.cleaningTypeOption, cleaningType === 'deep' && styles.cleaningTypeOptionSelected]}
            onPress={() => onSelect('deep')}
          >
            <Text style={[styles.cleaningTypeOptionText, cleaningType === 'deep' && styles.cleaningTypeOptionTextSelected]}>
              Deep Cleaning
            </Text>
            <Text style={styles.cleaningTypeOptionDescription}>
              Comprehensive cleaning including baseboards, inside appliances, and hard-to-reach areas
            </Text>
          </Pressable>
        </View>
        <Pressable style={styles.cleaningTypeModalCancelButton} onPress={onClose}>
          <Text style={styles.cleaningTypeModalCancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);

// ─── Apartment Size Modal ───────────────────────────────────────────────────

interface ApartmentSizeModalProps {
  visible: boolean;
  apartmentSize: string;
  onChangeText: (text: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const ApartmentSizeModal: React.FC<ApartmentSizeModalProps> = ({
  visible,
  apartmentSize,
  onChangeText,
  onBack,
  onSubmit,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.apartmentSizeModal}>
        <Text style={styles.apartmentSizeTitle}>Space Size</Text>
        <View style={styles.apartmentSizeDivider} />
        <Text style={styles.apartmentSizeMessage}>
          Please specify the size of your home or office:
        </Text>
        <TextInput
          style={styles.cleaningAnalysisInput}
          placeholder="e.g., 2-bedroom apartment, 1500 sq ft house, 3-room office..."
          placeholderTextColor="#7C7160"
          value={apartmentSize}
          onChangeText={onChangeText}
          autoFocus
        />
        <View style={styles.apartmentSizeButtonsRow}>
          <Pressable style={styles.apartmentSizeBackButton} onPress={onBack}>
            <Text style={styles.apartmentSizeBackButtonText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.apartmentSizeContinueButton, !apartmentSize.trim() && { opacity: 0.5 }]}
            onPress={onSubmit}
            disabled={!apartmentSize.trim()}
          >
            <Text style={styles.apartmentSizeContinueButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Supplies Modal ─────────────────────────────────────────────────────────

interface SuppliesModalProps {
  visible: boolean;
  suppliesNeeded: string;
  onChangeText: (text: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const SuppliesModal: React.FC<SuppliesModalProps> = ({
  visible,
  suppliesNeeded,
  onChangeText,
  onBack,
  onSubmit,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.suppliesModal}>
        <Text style={styles.suppliesModalTitle}>Cleaning Supplies</Text>
        <View style={styles.suppliesModalDivider} />
        <Text style={styles.suppliesModalMessage}>
          What cleaning supplies or equipment should your Helpr bring?
        </Text>
        <TextInput
          style={styles.cleaningAnalysisInput}
          placeholder="e.g., All cleaning supplies, vacuum, mop, eco-friendly products..."
          placeholderTextColor="#7C7160"
          value={suppliesNeeded}
          onChangeText={onChangeText}
          multiline
          numberOfLines={3}
          autoFocus
        />
        <View style={styles.suppliesModalButtonsRow}>
          <Pressable style={styles.suppliesModalBackButton} onPress={onBack}>
            <Text style={styles.suppliesModalBackButtonText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.suppliesModalContinueButton, !suppliesNeeded.trim() && { opacity: 0.5 }]}
            onPress={onSubmit}
            disabled={!suppliesNeeded.trim()}
          >
            <Text style={styles.suppliesModalContinueButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Details / Photos Modal ─────────────────────────────────────────────────

interface DetailsModalProps {
  visible: boolean;
  specialRequests: string;
  onChangeSpecialRequests: (text: string) => void;
  detailsPhotos: AttachmentAsset[];
  onUploadPhoto: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const DetailsModal: React.FC<DetailsModalProps> = ({
  visible,
  specialRequests,
  onChangeSpecialRequests,
  detailsPhotos,
  onUploadPhoto,
  onBack,
  onSubmit,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.detailsModal}>
        <Text style={styles.detailsModalTitle}>Any Special Requests?</Text>
        <View style={styles.detailsModalDivider} />
        <Text style={styles.detailsModalMessage}>
          Share any specific details or add photos to help us understand your cleaning needs better (optional):
        </Text>
        <TextInput
          style={styles.specialRequestsInput}
          placeholder="e.g., Focus on kitchen and bathrooms, pet-friendly products, etc..."
          multiline
          numberOfLines={4}
          placeholderTextColor="#7C7160"
          value={specialRequests}
          onChangeText={onChangeSpecialRequests}
        />
        <Pressable style={styles.addPhotosButton} onPress={onUploadPhoto}>
          <SvgXml xml={cameraIconSvg} width="20" height="20" />
          <Text style={styles.addPhotosButtonText}>Add Photos</Text>
        </Pressable>
        {detailsPhotos.length > 0 && (
          <View style={styles.detailsPhotosSummary}>
            <Text style={styles.detailsPhotosSummaryText}>
              {detailsPhotos.length} photo{detailsPhotos.length > 1 ? 's' : ''} attached
            </Text>
          </View>
        )}
        <View style={styles.signInButtonsRow}>
          <Pressable style={styles.detailsModalSkipButton} onPress={onBack}>
            <Text style={styles.detailsModalSkipButtonText}>Back</Text>
          </Pressable>
          <Pressable style={styles.detailsModalContinueButton} onPress={onSubmit}>
            <Text style={styles.detailsModalContinueButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Cleaning Analysis Modal ────────────────────────────────────────────────

interface CleaningAnalysisModalProps {
  visible: boolean;
  questionsToShow: Array<{
    id: string;
    title: string;
    message: string;
    placeholder: string;
    multiline?: boolean;
    options?: string[];
  }>;
  currentQuestionStep: number;
  apartmentSize: string;
  setApartmentSize: (value: string) => void;
  packingStatus: '' | 'packed' | 'not-packed';
  setPackingStatus: (value: 'packed' | 'not-packed') => void;
  needsTruck: '' | 'yes' | 'no';
  setNeedsTruck: (value: 'yes' | 'no') => void;
  boxesNeeded: '' | 'yes' | 'no';
  setBoxesNeeded: (value: 'yes' | 'no') => void;
  furnitureScope: string;
  setFurnitureScope: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const CleaningAnalysisModal: React.FC<CleaningAnalysisModalProps> = ({
  visible,
  questionsToShow,
  currentQuestionStep,
  apartmentSize,
  setApartmentSize,
  packingStatus,
  setPackingStatus,
  needsTruck,
  setNeedsTruck,
  boxesNeeded,
  setBoxesNeeded,
  furnitureScope,
  setFurnitureScope,
  onBack,
  onSubmit,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.cleaningAnalysisOverlayBackground}>
      <View style={styles.cleaningAnalysisModal}>
        {questionsToShow.length > 0 && (
          <>
            <Text style={styles.cleaningAnalysisTitle}>
              {questionsToShow[currentQuestionStep]?.title}
            </Text>
            <Text style={styles.cleaningAnalysisMessage}>
              {questionsToShow[currentQuestionStep]?.message}
            </Text>

            {questionsToShow[currentQuestionStep]?.id === 'needsTruck' && (
              <View style={styles.cleaningAnalysisOptionsContainer}>
                <Pressable
                  style={[styles.cleaningAnalysisOption, needsTruck === 'yes' && styles.cleaningAnalysisOptionSelected]}
                  onPress={() => setNeedsTruck('yes')}
                >
                  <Text style={[styles.cleaningAnalysisOptionText, needsTruck === 'yes' && styles.cleaningAnalysisOptionTextSelected]}>
                    Yes, I need a truck
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.cleaningAnalysisOption, needsTruck === 'no' && styles.cleaningAnalysisOptionSelected]}
                  onPress={() => setNeedsTruck('no')}
                >
                  <Text style={[styles.cleaningAnalysisOptionText, needsTruck === 'no' && styles.cleaningAnalysisOptionTextSelected]}>
                    No, I don&apos;t need a truck
                  </Text>
                </Pressable>
              </View>
            )}

            {questionsToShow[currentQuestionStep]?.id === 'packingStatus' && (
              <View style={styles.cleaningAnalysisOptionsContainer}>
                <Pressable
                  style={[styles.cleaningAnalysisOption, packingStatus === 'not-packed' && styles.cleaningAnalysisOptionSelected]}
                  onPress={() => setPackingStatus('not-packed')}
                >
                  <Text style={[styles.cleaningAnalysisOptionText, packingStatus === 'not-packed' && styles.cleaningAnalysisOptionTextSelected]}>
                    Yes, I need help packing
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.cleaningAnalysisOption, packingStatus === 'packed' && styles.cleaningAnalysisOptionSelected]}
                  onPress={() => setPackingStatus('packed')}
                >
                  <Text style={[styles.cleaningAnalysisOptionText, packingStatus === 'packed' && styles.cleaningAnalysisOptionTextSelected]}>
                    No, everything is already packed
                  </Text>
                </Pressable>
              </View>
            )}

            {questionsToShow[currentQuestionStep]?.id === 'boxesNeeded' && (
              <View style={styles.cleaningAnalysisOptionsContainer}>
                <Pressable
                  style={[styles.cleaningAnalysisOption, boxesNeeded === 'yes' && styles.cleaningAnalysisOptionSelected]}
                  onPress={() => setBoxesNeeded('yes')}
                >
                  <Text style={[styles.cleaningAnalysisOptionText, boxesNeeded === 'yes' && styles.cleaningAnalysisOptionTextSelected]}>
                    Yes, please bring boxes
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.cleaningAnalysisOption, boxesNeeded === 'no' && styles.cleaningAnalysisOptionSelected]}
                  onPress={() => setBoxesNeeded('no')}
                >
                  <Text style={[styles.cleaningAnalysisOptionText, boxesNeeded === 'no' && styles.cleaningAnalysisOptionTextSelected]}>
                    No, I have boxes
                  </Text>
                </Pressable>
              </View>
            )}

            {questionsToShow[currentQuestionStep]?.id === 'apartmentSize' && (
              <TextInput
                style={styles.cleaningAnalysisInput}
                placeholder={questionsToShow[currentQuestionStep]?.placeholder}
                value={apartmentSize}
                onChangeText={setApartmentSize}
                autoFocus
              />
            )}

            {questionsToShow[currentQuestionStep]?.id === 'furnitureScope' && (
              <TextInput
                style={styles.cleaningAnalysisInput}
                placeholder={questionsToShow[currentQuestionStep]?.placeholder}
                value={furnitureScope}
                onChangeText={setFurnitureScope}
                autoFocus
                multiline
                numberOfLines={3}
              />
            )}

            <View style={styles.cleaningAnalysisButtonsRow}>
              <Pressable style={styles.cleaningAnalysisCancelButton} onPress={onBack}>
                <Text style={styles.cleaningAnalysisCancelButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={styles.cleaningAnalysisButton}
                onPress={onSubmit}
                disabled={
                  (questionsToShow[currentQuestionStep]?.id === 'packingStatus' && !packingStatus) ||
                  (questionsToShow[currentQuestionStep]?.id === 'needsTruck' && !needsTruck) ||
                  (questionsToShow[currentQuestionStep]?.id === 'boxesNeeded' && !boxesNeeded) ||
                  (questionsToShow[currentQuestionStep]?.id === 'apartmentSize' && !apartmentSize.trim()) ||
                  (questionsToShow[currentQuestionStep]?.id === 'furnitureScope' && !furnitureScope.trim())
                }
              >
                <Text style={styles.cleaningAnalysisButtonText}>
                  {currentQuestionStep < questionsToShow.length - 1 ? 'Next' : 'Continue'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  </Modal>
);
