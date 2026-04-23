import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { styles } from './furniture-assembly.styles';

const cameraIconSvg = `
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke="#ffffff" stroke-width="2"/>
    <circle cx="12" cy="13" r="4" fill="none" stroke="#ffffff" stroke-width="2"/>
  </svg>
`;

// ---- Assembly Complexity Modal ----

export interface AssemblyComplexityModalProps {
  visible: boolean;
  assemblyComplexity: '' | 'simple' | 'complex';
  onSelect: (type: 'simple' | 'complex') => void;
  onClose: () => void;
}

export const AssemblyComplexityModal: React.FC<AssemblyComplexityModalProps> = ({
  visible,
  assemblyComplexity,
  onSelect,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.signInModal}>
        <Text style={styles.signInTitle}>Select Assembly Complexity</Text>
        <View style={styles.signInDivider} />
        <Text style={styles.signInMessage}>
          Please select the complexity of your furniture assembly:
        </Text>
        <View style={styles.assemblyComplexityOptionsContainer}>
          <Pressable
            style={[
              styles.assemblyComplexityOption,
              assemblyComplexity === 'simple' && styles.assemblyComplexityOptionSelected,
            ]}
            onPress={() => onSelect('simple')}
          >
            <Text
              style={[
                styles.assemblyComplexityOptionText,
                assemblyComplexity === 'simple' && styles.assemblyComplexityOptionTextSelected,
              ]}
            >
              Simple Assembly
            </Text>
            <Text style={styles.assemblyComplexityOptionDescription}>
              Basic furniture items like chairs, small tables, or simple shelves
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.assemblyComplexityOption,
              assemblyComplexity === 'complex' && styles.assemblyComplexityOptionSelected,
            ]}
            onPress={() => onSelect('complex')}
          >
            <Text
              style={[
                styles.assemblyComplexityOptionText,
                assemblyComplexity === 'complex' && styles.assemblyComplexityOptionTextSelected,
              ]}
            >
              Complex Assembly
            </Text>
            <Text style={styles.assemblyComplexityOptionDescription}>
              Large or intricate items like bed frames, wardrobes, entertainment centers, or
              multiple pieces
            </Text>
          </Pressable>
        </View>
        <Pressable style={styles.assemblyComplexityModalCancelButton} onPress={onClose}>
          <Text style={styles.assemblyComplexityModalCancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);

// ---- Apartment Size Modal ----

export interface ApartmentSizeModalProps {
  visible: boolean;
  apartmentSize: string;
  onChangeText: (text: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export const ApartmentSizeModal: React.FC<ApartmentSizeModalProps> = ({
  visible,
  apartmentSize,
  onChangeText,
  onBack,
  onSubmit,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.apartmentSizeModal}>
        <Text style={styles.apartmentSizeTitle}>Space Size</Text>
        <View style={styles.apartmentSizeDivider} />
        <Text style={styles.apartmentSizeMessage}>
          Please specify the size of your home or office:
        </Text>
        <TextInput
          style={styles.furnitureAssemblyAnalysisInput}
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

// ---- Tools Needed Modal ----

export interface ToolsModalProps {
  visible: boolean;
  toolsNeeded: string;
  onChangeText: (text: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export const ToolsModal: React.FC<ToolsModalProps> = ({
  visible,
  toolsNeeded,
  onChangeText,
  onBack,
  onSubmit,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.toolsModal}>
        <Text style={styles.toolsModalTitle}>Assembly Tools</Text>
        <View style={styles.toolsModalDivider} />
        <Text style={styles.toolsModalMessage}>
          What assembly tools or equipment should your Helpr bring?
        </Text>
        <TextInput
          style={styles.furnitureAssemblyAnalysisInput}
          placeholder="e.g., Allen wrenches, power drill, screwdriver set..."
          placeholderTextColor="#7C7160"
          value={toolsNeeded}
          onChangeText={onChangeText}
          multiline
          numberOfLines={3}
          autoFocus
        />
        <View style={styles.toolsModalButtonsRow}>
          <Pressable style={styles.toolsModalBackButton} onPress={onBack}>
            <Text style={styles.toolsModalBackButtonText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.toolsModalContinueButton, !toolsNeeded.trim() && { opacity: 0.5 }]}
            onPress={onSubmit}
            disabled={!toolsNeeded.trim()}
          >
            <Text style={styles.toolsModalContinueButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

// ---- Details & Special Requests Modal ----

export interface DetailsModalProps {
  visible: boolean;
  specialRequests: string;
  detailsPhotos: AttachmentAsset[];
  onChangeText: (text: string) => void;
  onPhotoUpload: () => void;
  onBack: () => void;
  onSubmit: () => void;
}

export const DetailsModal: React.FC<DetailsModalProps> = ({
  visible,
  specialRequests,
  detailsPhotos,
  onChangeText,
  onPhotoUpload,
  onBack,
  onSubmit,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
    <View style={styles.signInOverlayBackground}>
      <View style={styles.detailsModal}>
        <Text style={styles.detailsModalTitle}>Any Special Requests?</Text>
        <View style={styles.detailsModalDivider} />
        <Text style={styles.detailsModalMessage}>
          Share any specific details or add photos to help us understand your assembly needs better
          (optional):
        </Text>
        <TextInput
          style={styles.specialRequestsInput}
          placeholder="e.g., Multiple IKEA items, need wall mounting, delicate surface protection..."
          multiline
          numberOfLines={4}
          placeholderTextColor="#7C7160"
          value={specialRequests}
          onChangeText={onChangeText}
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

// ---- Furniture Assembly Analysis Modal (legacy question flow) ----

export interface FurnitureAssemblyAnalysisModalProps {
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
  needsTruck: '' | 'yes' | 'no';
  packingStatus: '' | 'packed' | 'not-packed';
  boxesNeeded: '' | 'yes' | 'no';
  apartmentSize: string;
  furnitureScope: string;
  onSetNeedsTruck: (v: 'yes' | 'no') => void;
  onSetPackingStatus: (v: 'packed' | 'not-packed') => void;
  onSetBoxesNeeded: (v: 'yes' | 'no') => void;
  onSetApartmentSize: (v: string) => void;
  onSetFurnitureScope: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const FurnitureAssemblyAnalysisModal: React.FC<FurnitureAssemblyAnalysisModalProps> = ({
  visible,
  questionsToShow,
  currentQuestionStep,
  needsTruck,
  packingStatus,
  boxesNeeded,
  apartmentSize,
  furnitureScope,
  onSetNeedsTruck,
  onSetPackingStatus,
  onSetBoxesNeeded,
  onSetApartmentSize,
  onSetFurnitureScope,
  onBack,
  onSubmit,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.furnitureAssemblyAnalysisOverlayBackground}>
      <View style={styles.furnitureAssemblyAnalysisModal}>
        {questionsToShow.length > 0 && (
          <>
            <Text style={styles.furnitureAssemblyAnalysisTitle}>
              {questionsToShow[currentQuestionStep]?.title}
            </Text>
            <Text style={styles.furnitureAssemblyAnalysisMessage}>
              {questionsToShow[currentQuestionStep]?.message}
            </Text>

            {questionsToShow[currentQuestionStep]?.id === 'needsTruck' && (
              <View style={styles.furnitureAssemblyAnalysisOptionsContainer}>
                <Pressable
                  style={[
                    styles.furnitureAssemblyAnalysisOption,
                    needsTruck === 'yes' && styles.furnitureAssemblyAnalysisOptionSelected,
                  ]}
                  onPress={() => onSetNeedsTruck('yes')}
                >
                  <Text
                    style={[
                      styles.furnitureAssemblyAnalysisOptionText,
                      needsTruck === 'yes' && styles.furnitureAssemblyAnalysisOptionTextSelected,
                    ]}
                  >
                    Yes, I need a truck
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.furnitureAssemblyAnalysisOption,
                    needsTruck === 'no' && styles.furnitureAssemblyAnalysisOptionSelected,
                  ]}
                  onPress={() => onSetNeedsTruck('no')}
                >
                  <Text
                    style={[
                      styles.furnitureAssemblyAnalysisOptionText,
                      needsTruck === 'no' && styles.furnitureAssemblyAnalysisOptionTextSelected,
                    ]}
                  >
                    No, I don't need a truck
                  </Text>
                </Pressable>
              </View>
            )}

            {questionsToShow[currentQuestionStep]?.id === 'packingStatus' && (
              <View style={styles.furnitureAssemblyAnalysisOptionsContainer}>
                <Pressable
                  style={[
                    styles.furnitureAssemblyAnalysisOption,
                    packingStatus === 'not-packed' && styles.furnitureAssemblyAnalysisOptionSelected,
                  ]}
                  onPress={() => onSetPackingStatus('not-packed')}
                >
                  <Text
                    style={[
                      styles.furnitureAssemblyAnalysisOptionText,
                      packingStatus === 'not-packed' &&
                        styles.furnitureAssemblyAnalysisOptionTextSelected,
                    ]}
                  >
                    Yes, I need help packing
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.furnitureAssemblyAnalysisOption,
                    packingStatus === 'packed' && styles.furnitureAssemblyAnalysisOptionSelected,
                  ]}
                  onPress={() => onSetPackingStatus('packed')}
                >
                  <Text
                    style={[
                      styles.furnitureAssemblyAnalysisOptionText,
                      packingStatus === 'packed' &&
                        styles.furnitureAssemblyAnalysisOptionTextSelected,
                    ]}
                  >
                    No, everything is already packed
                  </Text>
                </Pressable>
              </View>
            )}

            {questionsToShow[currentQuestionStep]?.id === 'boxesNeeded' && (
              <View style={styles.furnitureAssemblyAnalysisOptionsContainer}>
                <Pressable
                  style={[
                    styles.furnitureAssemblyAnalysisOption,
                    boxesNeeded === 'yes' && styles.furnitureAssemblyAnalysisOptionSelected,
                  ]}
                  onPress={() => onSetBoxesNeeded('yes')}
                >
                  <Text
                    style={[
                      styles.furnitureAssemblyAnalysisOptionText,
                      boxesNeeded === 'yes' && styles.furnitureAssemblyAnalysisOptionTextSelected,
                    ]}
                  >
                    Yes, please bring boxes
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.furnitureAssemblyAnalysisOption,
                    boxesNeeded === 'no' && styles.furnitureAssemblyAnalysisOptionSelected,
                  ]}
                  onPress={() => onSetBoxesNeeded('no')}
                >
                  <Text
                    style={[
                      styles.furnitureAssemblyAnalysisOptionText,
                      boxesNeeded === 'no' && styles.furnitureAssemblyAnalysisOptionTextSelected,
                    ]}
                  >
                    No, I have boxes
                  </Text>
                </Pressable>
              </View>
            )}

            {questionsToShow[currentQuestionStep]?.id === 'apartmentSize' && (
              <TextInput
                style={styles.furnitureAssemblyAnalysisInput}
                placeholder={questionsToShow[currentQuestionStep]?.placeholder}
                value={apartmentSize}
                onChangeText={onSetApartmentSize}
                autoFocus
              />
            )}

            {questionsToShow[currentQuestionStep]?.id === 'furnitureScope' && (
              <TextInput
                style={styles.furnitureAssemblyAnalysisInput}
                placeholder={questionsToShow[currentQuestionStep]?.placeholder}
                value={furnitureScope}
                onChangeText={onSetFurnitureScope}
                autoFocus
                multiline
                numberOfLines={3}
              />
            )}

            <View style={styles.furnitureAssemblyAnalysisButtonsRow}>
              <Pressable style={styles.furnitureAssemblyAnalysisCancelButton} onPress={onBack}>
                <Text style={styles.furnitureAssemblyAnalysisCancelButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={styles.furnitureAssemblyAnalysisButton}
                onPress={onSubmit}
                disabled={
                  (questionsToShow[currentQuestionStep]?.id === 'packingStatus' &&
                    !packingStatus) ||
                  (questionsToShow[currentQuestionStep]?.id === 'needsTruck' && !needsTruck) ||
                  (questionsToShow[currentQuestionStep]?.id === 'boxesNeeded' && !boxesNeeded) ||
                  (questionsToShow[currentQuestionStep]?.id === 'apartmentSize' &&
                    !apartmentSize.trim()) ||
                  (questionsToShow[currentQuestionStep]?.id === 'furnitureScope' &&
                    !furnitureScope.trim())
                }
              >
                <Text style={styles.furnitureAssemblyAnalysisButtonText}>
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
