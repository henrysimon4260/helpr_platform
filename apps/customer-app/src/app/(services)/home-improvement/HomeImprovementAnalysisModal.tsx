import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { styles } from './home-improvement.styles';

const cameraIconSvg = `
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke="#ffffff" stroke-width="2"/>
    <circle cx="12" cy="13" r="4" fill="none" stroke="#ffffff" stroke-width="2"/>
  </svg>
`;

// =============================================================================
// Project Type Selection Modal
// =============================================================================
interface ProjectTypeModalProps {
  visible: boolean;
  projectType: '' | 'repair' | 'renovation';
  onSelect: (type: 'repair' | 'renovation') => void;
  onClose: () => void;
}

export const ProjectTypeModal: React.FC<ProjectTypeModalProps> = ({
  visible,
  projectType,
  onSelect,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.signInModal}>
        <Text style={styles.signInTitle}>Select Project Type</Text>
        <View style={styles.signInDivider} />
        <Text style={styles.signInMessage}>
          Please select the type of cleaning you need:
        </Text>
        <View style={styles.projectTypeOptionsContainer}>
          <Pressable
            style={[styles.projectTypeOption, projectType === 'repair' && styles.projectTypeOptionSelected]}
            onPress={() => onSelect('repair')}
          >
            <Text style={[styles.projectTypeOptionText, projectType === 'repair' && styles.projectTypeOptionTextSelected]}>
              Basic Cleaning
            </Text>
            <Text style={styles.projectTypeOptionDescription}>
              General tidying, dusting, vacuuming, and surface cleaning
            </Text>
          </Pressable>
          <Pressable
            style={[styles.projectTypeOption, projectType === 'renovation' && styles.projectTypeOptionSelected]}
            onPress={() => onSelect('renovation')}
          >
            <Text style={[styles.projectTypeOptionText, projectType === 'renovation' && styles.projectTypeOptionTextSelected]}>
              Deep Cleaning
            </Text>
            <Text style={styles.projectTypeOptionDescription}>
              Comprehensive cleaning including baseboards, inside appliances, and hard-to-reach areas
            </Text>
          </Pressable>
        </View>
        <Pressable style={styles.projectTypeModalCancelButton} onPress={onClose}>
          <Text style={styles.projectTypeModalCancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);

// =============================================================================
// Apartment Size Modal
// =============================================================================
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
          style={styles.homeImprovementAnalysisInput}
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

// =============================================================================
// Materials Needed Modal
// =============================================================================
interface MaterialsModalProps {
  visible: boolean;
  materialsNeeded: string;
  onChangeText: (text: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const MaterialsModal: React.FC<MaterialsModalProps> = ({
  visible,
  materialsNeeded,
  onChangeText,
  onBack,
  onSubmit,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.materialsModal}>
        <Text style={styles.materialsModalTitle}>Cleaning Materials</Text>
        <View style={styles.materialsModalDivider} />
        <Text style={styles.materialsModalMessage}>
          What cleaning materials or equipment should your Helpr bring?
        </Text>
        <TextInput
          style={styles.homeImprovementAnalysisInput}
          placeholder="e.g., All cleaning materials, vacuum, mop, eco-friendly products..."
          placeholderTextColor="#7C7160"
          value={materialsNeeded}
          onChangeText={onChangeText}
          multiline
          numberOfLines={3}
          autoFocus
        />
        <View style={styles.materialsModalButtonsRow}>
          <Pressable style={styles.materialsModalBackButton} onPress={onBack}>
            <Text style={styles.materialsModalBackButtonText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.materialsModalContinueButton, !materialsNeeded.trim() && { opacity: 0.5 }]}
            onPress={onSubmit}
            disabled={!materialsNeeded.trim()}
          >
            <Text style={styles.materialsModalContinueButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

// =============================================================================
// Details and Photos Modal
// =============================================================================
interface DetailsModalProps {
  visible: boolean;
  specialRequests: string;
  onChangeSpecialRequests: (text: string) => void;
  detailsPhotos: AttachmentAsset[];
  onPhotoUpload: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const DetailsModal: React.FC<DetailsModalProps> = ({
  visible,
  specialRequests,
  onChangeSpecialRequests,
  detailsPhotos,
  onPhotoUpload,
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
        <Pressable style={styles.addPhotosButton} onPress={onPhotoUpload}>
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

// =============================================================================
// Home Improvement Analysis Modal (legacy questions flow)
// =============================================================================
interface HomeImprovementAnalysisModalProps {
  visible: boolean;
  questionsToShow: Array<{ id: string; title: string; message: string; placeholder: string; multiline?: boolean; options?: string[] }>;
  currentQuestionStep: number;
  needsTruck: '' | 'yes' | 'no';
  setNeedsTruck: (v: '' | 'yes' | 'no') => void;
  packingStatus: '' | 'packed' | 'not-packed';
  setPackingStatus: (v: '' | 'packed' | 'not-packed') => void;
  boxesNeeded: '' | 'yes' | 'no';
  setBoxesNeeded: (v: '' | 'yes' | 'no') => void;
  apartmentSize: string;
  setApartmentSize: (v: string) => void;
  furnitureScope: string;
  setFurnitureScope: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const HomeImprovementAnalysisQuestionModal: React.FC<HomeImprovementAnalysisModalProps> = ({
  visible,
  questionsToShow,
  currentQuestionStep,
  needsTruck,
  setNeedsTruck,
  packingStatus,
  setPackingStatus,
  boxesNeeded,
  setBoxesNeeded,
  apartmentSize,
  setApartmentSize,
  furnitureScope,
  setFurnitureScope,
  onBack,
  onSubmit,
  onClose,
}) => {
  const currentQuestion = questionsToShow[currentQuestionStep];
  const isLastStep = currentQuestionStep >= questionsToShow.length - 1;

  const isDisabled =
    (currentQuestion?.id === 'packingStatus' && !packingStatus) ||
    (currentQuestion?.id === 'needsTruck' && !needsTruck) ||
    (currentQuestion?.id === 'boxesNeeded' && !boxesNeeded) ||
    (currentQuestion?.id === 'apartmentSize' && !apartmentSize.trim()) ||
    (currentQuestion?.id === 'furnitureScope' && !furnitureScope.trim());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.homeImprovementAnalysisOverlayBackground}>
        <View style={styles.homeImprovementAnalysisModal}>
          {questionsToShow.length > 0 && currentQuestion && (
            <>
              <Text style={styles.homeImprovementAnalysisTitle}>{currentQuestion.title}</Text>
              <Text style={styles.homeImprovementAnalysisMessage}>{currentQuestion.message}</Text>

              {currentQuestion.id === 'needsTruck' && (
                <View style={styles.homeImprovementAnalysisOptionsContainer}>
                  <Pressable
                    style={[styles.homeImprovementAnalysisOption, needsTruck === 'yes' && styles.homeImprovementAnalysisOptionSelected]}
                    onPress={() => setNeedsTruck('yes')}
                  >
                    <Text style={[styles.homeImprovementAnalysisOptionText, needsTruck === 'yes' && styles.homeImprovementAnalysisOptionTextSelected]}>
                      Yes, I need a truck
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.homeImprovementAnalysisOption, needsTruck === 'no' && styles.homeImprovementAnalysisOptionSelected]}
                    onPress={() => setNeedsTruck('no')}
                  >
                    <Text style={[styles.homeImprovementAnalysisOptionText, needsTruck === 'no' && styles.homeImprovementAnalysisOptionTextSelected]}>
                      No, I don't need a truck
                    </Text>
                  </Pressable>
                </View>
              )}

              {currentQuestion.id === 'packingStatus' && (
                <View style={styles.homeImprovementAnalysisOptionsContainer}>
                  <Pressable
                    style={[styles.homeImprovementAnalysisOption, packingStatus === 'not-packed' && styles.homeImprovementAnalysisOptionSelected]}
                    onPress={() => setPackingStatus('not-packed')}
                  >
                    <Text style={[styles.homeImprovementAnalysisOptionText, packingStatus === 'not-packed' && styles.homeImprovementAnalysisOptionTextSelected]}>
                      Yes, I need help packing
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.homeImprovementAnalysisOption, packingStatus === 'packed' && styles.homeImprovementAnalysisOptionSelected]}
                    onPress={() => setPackingStatus('packed')}
                  >
                    <Text style={[styles.homeImprovementAnalysisOptionText, packingStatus === 'packed' && styles.homeImprovementAnalysisOptionTextSelected]}>
                      No, everything is already packed
                    </Text>
                  </Pressable>
                </View>
              )}

              {currentQuestion.id === 'boxesNeeded' && (
                <View style={styles.homeImprovementAnalysisOptionsContainer}>
                  <Pressable
                    style={[styles.homeImprovementAnalysisOption, boxesNeeded === 'yes' && styles.homeImprovementAnalysisOptionSelected]}
                    onPress={() => setBoxesNeeded('yes')}
                  >
                    <Text style={[styles.homeImprovementAnalysisOptionText, boxesNeeded === 'yes' && styles.homeImprovementAnalysisOptionTextSelected]}>
                      Yes, please bring boxes
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.homeImprovementAnalysisOption, boxesNeeded === 'no' && styles.homeImprovementAnalysisOptionSelected]}
                    onPress={() => setBoxesNeeded('no')}
                  >
                    <Text style={[styles.homeImprovementAnalysisOptionText, boxesNeeded === 'no' && styles.homeImprovementAnalysisOptionTextSelected]}>
                      No, I have boxes
                    </Text>
                  </Pressable>
                </View>
              )}

              {currentQuestion.id === 'apartmentSize' && (
                <TextInput
                  style={styles.homeImprovementAnalysisInput}
                  placeholder={currentQuestion.placeholder}
                  value={apartmentSize}
                  onChangeText={setApartmentSize}
                  autoFocus
                />
              )}

              {currentQuestion.id === 'furnitureScope' && (
                <TextInput
                  style={styles.homeImprovementAnalysisInput}
                  placeholder={currentQuestion.placeholder}
                  value={furnitureScope}
                  onChangeText={setFurnitureScope}
                  autoFocus
                  multiline
                  numberOfLines={3}
                />
              )}

              <View style={styles.homeImprovementAnalysisButtonsRow}>
                <Pressable style={styles.homeImprovementAnalysisCancelButton} onPress={onBack}>
                  <Text style={styles.homeImprovementAnalysisCancelButtonText}>Back</Text>
                </Pressable>
                <Pressable style={styles.homeImprovementAnalysisButton} onPress={onSubmit} disabled={isDisabled}>
                  <Text style={styles.homeImprovementAnalysisButtonText}>
                    {isLastStep ? 'Continue' : 'Next'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};
