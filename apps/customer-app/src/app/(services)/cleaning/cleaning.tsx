import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import MapView from 'react-native-maps';
import { SvgXml } from 'react-native-svg';

import { BackButton, ScheduleButton, SignInModal } from '../../../components/services';
import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';

import {
  ApartmentSizeModal,
  CleaningAnalysisModal,
  CleaningTypeModal,
  DetailsModal,
  SuppliesModal,
} from './CleaningAnalysisModal';
import { CleaningHeader } from './CleaningHeader';
import {
  useCleaningAnalysis,
  useLocationManagement,
  usePriceEstimate,
  useServiceSubmission,
  useVoiceInput,
} from './cleaning.hooks';
import { styles } from './cleaning.styles';
import { CleaningFormState } from './cleaning.types';
import { cloneAttachments, cloneSelectedLocation, formatCurrency } from './cleaning.utils';
import { LocationSection } from './LocationSection';
import { MapWithMarker } from './MapWithMarker';

const voiceIconSvg = `
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="#0c4309"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="#0c4309" stroke-width="2"/>
    <line x1="12" y1="19" x2="12" y2="23" stroke="#0c4309" stroke-width="2"/>
    <line x1="8" y1="23" x2="16" y2="23" stroke="#0c4309" stroke-width="2"/>
  </svg>
`;

const cameraIconSvg = `
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke="#ffffff" stroke-width="2"/>
    <circle cx="12" cy="13" r="4" fill="none" stroke="#ffffff" stroke-width="2"/>
  </svg>
`;

export default function Cleaning() {
  const { user } = useAuth();
  const { showModal } = useModal();
  const mapRef = useRef<MapView | null>(null);

  // Core form state
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<AttachmentAsset[]>([]);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [forceHideSuggestions, setForceHideSuggestions] = useState(false);

  // Toggle states
  const [isAuto, setIsAuto] = useState(false);
  const [isPersonal, setIsPersonal] = useState(true);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation2 = useRef(new Animated.Value(0)).current;
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const slideAnimation2Ref = useRef<Animated.CompositeAnimation | null>(null);

  // Hooks
  const priceEstimate = usePriceEstimate({ showModal });

  const locationManagement = useLocationManagement({
    showModal,
    mapRef,
    resetPriceState: priceEstimate.resetPriceState,
  });

  const voiceInput = useVoiceInput({
    setDescription,
    resetPriceState: priceEstimate.resetPriceState,
    showModal,
  });

  const cleaningAnalysis = useCleaningAnalysis({
    description,
    location: locationManagement.location,
    locationQuery: locationManagement.locationQuery,
    setDescription,
    fetchPriceEstimate: priceEstimate.fetchPriceEstimate,
    checkForPropertySize: priceEstimate.checkForPropertySize,
    checkForCleaningType: priceEstimate.checkForCleaningType,
    checkIfDescriptionAlreadyEnhanced: priceEstimate.checkIfDescriptionAlreadyEnhanced,
    isPriceLoading: priceEstimate.isPriceLoading,
    isTranscribing: voiceInput.isTranscribing,
    showModal,
  });

  const collectFormState = useCallback((): CleaningFormState => {
    return {
      locationQuery: locationManagement.locationQuery,
      location: cloneSelectedLocation(locationManagement.location),
      description,
      isAuto,
      isPersonal,
      priceQuote: priceEstimate.priceQuote,
      priceNote: priceEstimate.priceNote,
      priceError: priceEstimate.priceError,
      attachments: cloneAttachments(attachments),
      apartmentSize: cleaningAnalysis.apartmentSize,
      packingStatus: cleaningAnalysis.packingStatus,
      needsTruck: cleaningAnalysis.needsTruck,
      boxesNeeded: cleaningAnalysis.boxesNeeded,
      furnitureScope: cleaningAnalysis.furnitureScope,
      cleaningType: cleaningAnalysis.cleaningType,
      specialRequests: cleaningAnalysis.specialRequests,
      detailsPhotos: cloneAttachments(cleaningAnalysis.detailsPhotos),
      suppliesNeeded: cleaningAnalysis.suppliesNeeded,
    };
  }, [
    locationManagement.locationQuery,
    locationManagement.location,
    description,
    isAuto,
    isPersonal,
    priceEstimate.priceQuote,
    priceEstimate.priceNote,
    priceEstimate.priceError,
    attachments,
    cleaningAnalysis,
  ]);

  const restoreFormState = useCallback(
    (formState: CleaningFormState) => {
      locationManagement.setLocationQuery(formState.locationQuery ?? '');
      locationManagement.setLocation(cloneSelectedLocation(formState.location ?? null));
      setDescription(formState.description ?? '');

      const nextIsAuto = Boolean(formState.isAuto);
      setIsAuto(nextIsAuto);
      slideAnimation.setValue(nextIsAuto ? 1 : 0);

      const nextIsPersonal = Boolean(formState.isPersonal);
      setIsPersonal(nextIsPersonal);
      slideAnimation2.setValue(nextIsPersonal ? 0 : 1);

      priceEstimate.setPriceQuote(formState.priceQuote ?? null);
      priceEstimate.setPriceNote(formState.priceNote ?? null);
      priceEstimate.setPriceError(formState.priceError ?? null);
      setAttachments(cloneAttachments(formState.attachments ?? []));

      cleaningAnalysis.setApartmentSize(formState.apartmentSize ?? '');
      cleaningAnalysis.setPackingStatus(formState.packingStatus ?? '' as any);
      cleaningAnalysis.setNeedsTruck(formState.needsTruck ?? '' as any);
      cleaningAnalysis.setBoxesNeeded(formState.boxesNeeded ?? '' as any);
      cleaningAnalysis.setFurnitureScope(formState.furnitureScope ?? '');
      cleaningAnalysis.setSpecialRequests(formState.specialRequests ?? '');
      cleaningAnalysis.setSuppliesNeeded(formState.suppliesNeeded ?? '');
    },
    [slideAnimation, slideAnimation2, locationManagement, priceEstimate, cleaningAnalysis],
  );

  const serviceSubmission = useServiceSubmission({
    user,
    description,
    location: locationManagement.location,
    priceQuote: priceEstimate.priceQuote,
    isAuto,
    isPersonal,
    showModal,
    setShowSignInModal,
    snapshotLocations: locationManagement.snapshotLocations,
    restoreLocations: locationManagement.restoreLocations,
    cleaningType: cleaningAnalysis.cleaningType,
    apartmentSize: cleaningAnalysis.apartmentSize,
    suppliesNeeded: cleaningAnalysis.suppliesNeeded,
    specialRequests: cleaningAnalysis.specialRequests,
    attachments,
    collectFormState,
    restoreFormState,
  });

  // Edit prefill
  useEffect(() => {
    if (!serviceSubmission.editingPayload || !serviceSubmission.editServiceId) return;
    const payload = serviceSubmission.editingPayload;

    const nextIsAuto = (payload.autofill_type ?? 'AutoFill').toLowerCase() !== 'custom';
    const nextIsPersonal = (payload.payment_method_type ?? 'Personal').toLowerCase() !== 'business';

    setIsAuto(nextIsAuto);
    slideAnimation.setValue(nextIsAuto ? 1 : 0);
    setIsPersonal(nextIsPersonal);
    slideAnimation2.setValue(nextIsPersonal ? 0 : 1);

    if (typeof payload.price === 'number' && Number.isFinite(payload.price)) {
      priceEstimate.setPriceQuote(formatCurrency(payload.price));
    } else {
      priceEstimate.setPriceQuote(null);
    }

    if (typeof payload.description === 'string') {
      setDescription(payload.description.trim());
    } else {
      setDescription('');
    }

    priceEstimate.setPriceNote(null);
    priceEstimate.setPriceError(null);

    let cancelled = false;
    const hydrateLocations = async () => {
      const address = payload.location?.trim();
      if (address) {
        const resolved = await locationManagement.geocodeAddress(address);
        if (cancelled) return;
        if (resolved) {
          locationManagement.applyLocation(resolved, { showStreetNumberWarning: false });
        } else {
          locationManagement.setLocationQuery(address);
          locationManagement.setLocation(null);
        }
      } else {
        locationManagement.setLocationQuery('');
        locationManagement.setLocation(null);
      }
    };

    hydrateLocations();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceSubmission.editServiceId, serviceSubmission.editingPayload]);

  // Toggle handlers with animation
  const handleAutoToggle = useCallback(() => {
    setIsAuto(prev => {
      const next = !prev;
      slideAnimationRef.current?.stop();
      slideAnimationRef.current = Animated.spring(slideAnimation, {
        toValue: next ? 1 : 0,
        useNativeDriver: false,
        friction: 8,
        tension: 50,
      });
      slideAnimationRef.current.start();
      return next;
    });
  }, [slideAnimation]);

  const handlePersonalToggle = useCallback(() => {
    setIsPersonal(prev => {
      const next = !prev;
      slideAnimation2Ref.current?.stop();
      slideAnimation2Ref.current = Animated.spring(slideAnimation2, {
        toValue: next ? 0 : 1,
        useNativeDriver: false,
        friction: 8,
        tension: 50,
      });
      slideAnimation2Ref.current.start();
      return next;
    });
  }, [slideAnimation2]);

  const handleDescriptionChange = useCallback(
    (text: string) => {
      setDescription(text);
      priceEstimate.resetPriceState();
    },
    [priceEstimate],
  );

  const handleMediaUpload = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showModal({ title: 'Permission needed', message: 'Enable photo library access to attach images or videos.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        quality: 0.8,
      });
      if (result.canceled || !(result.assets && result.assets.length > 0)) return;
      const asset = result.assets[0];
      const type = asset.type === 'video' ? 'video' : 'photo';
      const name = asset.fileName ?? (type === 'video' ? 'video-upload.mp4' : 'photo-upload.jpg');
      setAttachments(prev => [...prev, { uri: asset.uri, type, name }]);
    } catch (error) {
      console.warn('Media picker error', error);
      showModal({ title: 'Upload failed', message: 'Unable to select media right now.' });
    }
  }, [showModal]);

  // Close sign-in modal when user logs in
  useEffect(() => {
    if (user) setShowSignInModal(false);
  }, [user]);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      slideAnimationRef.current?.stop();
      slideAnimation2Ref.current?.stop();
    };
  }, []);

  return (
    <TouchableWithoutFeedback
      accessible={false}
      onPress={() => {
        setForceHideSuggestions(true);
        locationManagement.dismissSuggestions();
        Keyboard.dismiss();
      }}
    >
      <View style={styles.root}>
        <View style={styles.container}>
          <MapWithMarker ref={mapRef} location={locationManagement.location} />

          <BackButton />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.contentArea}
          >
            <View style={styles.panel}>
              <View style={styles.panelContent}>
                <View>
                  <CleaningHeader />

                  <LocationSection
                    value={locationManagement.locationQuery}
                    onChangeText={locationManagement.handleLocationChange}
                    onSelectSuggestion={locationManagement.handleLocationSelect}
                    onClear={locationManagement.handleLocationClear}
                    suggestions={locationManagement.suggestions}
                    loading={locationManagement.loading || locationManagement.currentLocationLoading}
                    currentLocationOption={locationManagement.currentLocationOption}
                    isSuggestionsVisible={locationManagement.isSuggestionsVisible}
                    onSuggestionsVisibilityChange={locationManagement.handleSuggestionsVisibilityChange}
                    forceHideSuggestions={forceHideSuggestions}
                    onFocusInput={() => setForceHideSuggestions(false)}
                  />

                  {/* Price Display */}
                  <View style={styles.PriceOfServiceContainer}>
                    <View style={styles.PriceOfServiceTextContainer}>
                      <View style={styles.PriceOfServiceTitleTextContainer}>
                        <Text style={styles.PriceOfServiceTitleText}>Helpr</Text>
                      </View>
                      <View style={styles.PriceOfServiceSubtitleTextContainer}>
                        <Text style={styles.PriceOfServiceSubtitleText}>Price to be confirmed on next page</Text>
                      </View>
                    </View>
                    <View style={styles.PriceOfServiceQuoteContainer}>
                      {priceEstimate.isPriceLoading ? (
                        <ActivityIndicator size="small" color="#0c4309" />
                      ) : (
                        <>
                          {priceEstimate.priceQuote ? (
                            <View style={styles.PriceOfServiceQuoteRow}>
                              <Text
                                style={[styles.PriceOfServiceQuoteText, styles.PriceOfServiceQuotePrice]}
                                numberOfLines={1}
                              >
                                {priceEstimate.priceQuote}
                              </Text>
                              <Text style={styles.PriceOfServiceQuoteEstimateText}>est.</Text>
                            </View>
                          ) : (
                            <>
                              <Text
                                style={[
                                  styles.PriceOfServiceQuoteText,
                                  priceEstimate.priceError ? styles.PriceOfServiceQuoteTextError : null,
                                ]}
                                numberOfLines={2}
                              >
                                {priceEstimate.priceError ?? 'Enter description to see price'}
                              </Text>
                              {priceEstimate.priceNote ? (
                                <Text style={styles.PriceOfServiceQuoteNoteText} numberOfLines={2}>
                                  {priceEstimate.priceNote}
                                </Text>
                              ) : null}
                            </>
                          )}
                        </>
                      )}
                    </View>
                  </View>

                  {/* Job Description */}
                  <View style={styles.jobDescriptionContainer}>
                    <TextInput
                      style={styles.jobDescriptionText}
                      placeholder="Describe your task...                                         (e.g.  'I need my one bedroom apartment deep cleaned.')"
                      multiline
                      numberOfLines={4}
                      placeholderTextColor="#333333ab"
                      value={description}
                      onChangeText={handleDescriptionChange}
                      onSubmitEditing={cleaningAnalysis.handleCleaningAnalysisSubmit}
                      blurOnSubmit
                      returnKeyType="done"
                      editable={!voiceInput.isTranscribing}
                    />
                    <View style={styles.inputButtonsContainer}>
                      <View style={styles.voiceContainer}>
                        <Pressable
                          style={[
                            styles.voiceButton,
                            (voiceInput.isRecording || voiceInput.isTranscribing) && styles.voiceButtonActive,
                          ]}
                          onPress={voiceInput.handleVoiceModePress}
                          disabled={voiceInput.isTranscribing}
                        >
                          <Animated.View style={{ transform: [{ scale: voiceInput.voicePulseValue }] }}>
                            <SvgXml xml={voiceIconSvg} width="20" height="20" />
                          </Animated.View>
                        </Pressable>
                        <View style={styles.voiceStatusRow}>
                          <Text style={styles.inputButtonsText}>
                            {voiceInput.isRecording
                              ? 'Listening\u2026'
                              : voiceInput.isTranscribing
                                ? 'Processing\u2026'
                                : 'Voice Mode'}
                          </Text>
                          {voiceInput.isTranscribing ? (
                            <ActivityIndicator size="small" color="#0c4309" style={styles.voiceStatusSpinner} />
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.cameraContainer}>
                        <Text style={styles.inputButtonsText}>Add Photo or Video</Text>
                        <Pressable style={styles.cameraButton} onPress={handleMediaUpload}>
                          <SvgXml xml={cameraIconSvg} width="20" height="20" />
                        </Pressable>
                      </View>
                    </View>
                    {attachments.length > 0 ? (
                      <View style={styles.attachmentsSummary}>
                        <Text style={styles.attachmentsSummaryText}>
                          {attachments.length} file{attachments.length > 1 ? 's' : ''} attached
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Divider */}
                  <View style={styles.DividerContainer2}>
                    <View style={styles.DividerLine2} />
                  </View>

                  {/* Auto/Custom Toggle */}
                  <View style={styles.binarySliderContainer}>
                    <Animated.View style={styles.binarySlider}>
                      <View style={styles.binarySliderIcons}>
                        <Image
                          source={require('../../../assets/icons/ChooseHelprIcon.png')}
                          style={[styles.binarySliderIcon, { opacity: isAuto ? 0.5 : 1, marginLeft: 7 }]}
                        />
                        <Image
                          source={require('../../../assets/icons/AutoFillIcon.png')}
                          style={[styles.binarySliderIcon, { opacity: isAuto ? 1 : 0.5, marginLeft: 12 }]}
                        />
                      </View>
                      <Pressable style={StyleSheet.absoluteFill} onPress={handleAutoToggle}>
                        <Animated.View
                          style={[
                            styles.binarySliderThumb,
                            {
                              transform: [
                                {
                                  translateX: slideAnimation.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 28],
                                  }),
                                },
                              ],
                            },
                          ]}
                        />
                      </Pressable>
                    </Animated.View>
                    <Text style={styles.binarySliderLabel}>
                      <Text style={[styles.binarySliderLabel, styles.isAutoSliderTitle]}>
                        {isAuto ? 'AutoFill' : 'Custom'}
                      </Text>
                      {'\n'}
                      <Text style={[styles.binarySliderLabel, styles.isAutoSliderSubtitle]}>
                        {isAuto ? 'Confirm the first available helpr at this price' : 'Choose from available pros'}
                      </Text>
                    </Text>
                  </View>

                  {/* Personal/Business Toggle */}
                  <View style={styles.sliderRowContainer}>
                    <View style={styles.binarySliderContainer}>
                      <Animated.View style={styles.binarySlider}>
                        <View style={styles.binarySliderIcons2}>
                          <Image
                            source={require('../../../assets/icons/PersonalPMIcon.png')}
                            style={styles.binarySliderIcon2}
                          />
                          <Image
                            source={require('../../../assets/icons/BusinessPMIcon.png')}
                            style={styles.BusinessPMIcon}
                          />
                        </View>
                        <Pressable style={StyleSheet.absoluteFill} onPress={handlePersonalToggle}>
                          <Animated.View
                            style={[
                              styles.binarySliderThumb,
                              {
                                transform: [
                                  {
                                    translateX: slideAnimation2.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [0, 28],
                                    }),
                                  },
                                ],
                              },
                            ]}
                          />
                        </Pressable>
                      </Animated.View>
                      <Text style={styles.binarySliderLabel}>
                        <Text style={[styles.binarySliderLabel, styles.isPersonalSliderTitle]}>
                          {isPersonal ? 'Personal' : 'Business'}
                        </Text>
                        {'\n'}
                        <Text style={[styles.binarySliderLabel, styles.isPersonalSliderSubtitle]}>
                          {isPersonal ? '*Insert Payment Method*' : '*Insert Payment Method*'}
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.pmIconContainer}>
                      <Image source={require('../../../assets/icons/PMIcon.png')} style={styles.pmIcon} />
                      <Image
                        source={require('../../../assets/icons/ArrowIcon.png')}
                        style={[styles.arrowIcon, { resizeMode: 'contain' }]}
                      />
                    </View>
                  </View>
                </View>

                {/* Schedule Button */}
                <ScheduleButton
                  onPress={serviceSubmission.handleScheduleHelpr}
                  loading={serviceSubmission.isSubmitting}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>

        {/* Modals */}
        <SignInModal
          visible={showSignInModal}
          onClose={() => setShowSignInModal(false)}
          onSignIn={serviceSubmission.preserveFormForAuth}
          onSignUp={serviceSubmission.preserveFormForAuth}
          title="Sign In Required"
          message="Please sign in or sign up to schedule a cleaning service."
        />

        <CleaningTypeModal
          visible={cleaningAnalysis.showCleaningTypeModal}
          cleaningType={cleaningAnalysis.cleaningType}
          onSelect={cleaningAnalysis.handleCleaningTypeSelect}
          onClose={() => cleaningAnalysis.setShowCleaningTypeModal(false)}
        />

        <ApartmentSizeModal
          visible={cleaningAnalysis.showApartmentSizeModal}
          apartmentSize={cleaningAnalysis.apartmentSize}
          onChangeText={cleaningAnalysis.setApartmentSize}
          onBack={cleaningAnalysis.handleApartmentSizeBack}
          onSubmit={cleaningAnalysis.handleApartmentSizeSubmit}
          onClose={() => cleaningAnalysis.setShowApartmentSizeModal(false)}
        />

        <SuppliesModal
          visible={cleaningAnalysis.showSuppliesModal}
          suppliesNeeded={cleaningAnalysis.suppliesNeeded}
          onChangeText={cleaningAnalysis.setSuppliesNeeded}
          onBack={cleaningAnalysis.handleSuppliesBack}
          onSubmit={cleaningAnalysis.handleSuppliesSubmit}
          onClose={() => cleaningAnalysis.setShowSuppliesModal(false)}
        />

        <DetailsModal
          visible={cleaningAnalysis.showDetailsModal}
          specialRequests={cleaningAnalysis.specialRequests}
          onChangeSpecialRequests={cleaningAnalysis.setSpecialRequests}
          detailsPhotos={cleaningAnalysis.detailsPhotos}
          onUploadPhoto={cleaningAnalysis.handleDetailsPhotoUpload}
          onBack={cleaningAnalysis.handleDetailsBack}
          onSubmit={cleaningAnalysis.handleDetailsSubmit}
          onClose={() => cleaningAnalysis.setShowDetailsModal(false)}
        />

        <CleaningAnalysisModal
          visible={cleaningAnalysis.showCleaningAnalysisModal}
          questionsToShow={cleaningAnalysis.cleaningAnalysis.questionsToShow}
          currentQuestionStep={cleaningAnalysis.currentQuestionStep}
          apartmentSize={cleaningAnalysis.apartmentSize}
          setApartmentSize={cleaningAnalysis.setApartmentSize}
          packingStatus={cleaningAnalysis.packingStatus}
          setPackingStatus={cleaningAnalysis.setPackingStatus as (v: 'packed' | 'not-packed') => void}
          needsTruck={cleaningAnalysis.needsTruck}
          setNeedsTruck={cleaningAnalysis.setNeedsTruck as (v: 'yes' | 'no') => void}
          boxesNeeded={cleaningAnalysis.boxesNeeded}
          setBoxesNeeded={cleaningAnalysis.setBoxesNeeded as (v: 'yes' | 'no') => void}
          furnitureScope={cleaningAnalysis.furnitureScope}
          setFurnitureScope={cleaningAnalysis.setFurnitureScope}
          onBack={cleaningAnalysis.handleAnalysisModalBack}
          onSubmit={cleaningAnalysis.handleAnalysisModalSubmit}
          onClose={cleaningAnalysis.resetCleaningAnalysisFlow}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}
