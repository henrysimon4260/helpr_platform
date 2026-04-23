import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView from 'react-native-maps';
import { SvgXml } from 'react-native-svg';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';

import { LocationSection } from './LocationSection';
import { MapWithMarker } from './MapWithMarker';
import {
  ApartmentSizeModal,
  CleaningTypeModal,
  DetailsModal,
  SuppliesModal,
  WallMountingAnalysisFlowModal,
} from './WallMountingAnalysisModal';
import { WallMountingHeader } from './WallMountingHeader';
import {
  useLocationManagement,
  usePriceEstimate,
  useServiceSubmission,
  useVoiceInput,
  useWallMountingAnalysis,
} from './wall-mounting.hooks';
import { styles } from './wall-mounting.styles';
import { EditServicePayload, WallMountingFormState, WallMountingReturnData } from './wall-mounting.types';
import { cloneAttachments, cloneSelectedLocation, formatCurrency, WALL_MOUNTING_RETURN_PATH } from './wall-mounting.utils';

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

export default function WallMounting() {
  const { user, setReturnTo, getReturnTo, clearReturnTo } = useAuth();
  const { showModal } = useModal();
  const params = useLocalSearchParams<{ editServiceId?: string | string[]; editService?: string | string[] }>();

  const editServiceId = useMemo(() => {
    const raw = params.editServiceId;
    if (!raw) return null;
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw;
  }, [params.editServiceId]);

  const editingPayload = useMemo<EditServicePayload | null>(() => {
    const raw = params.editService;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    try {
      const decoded = decodeURIComponent(value);
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed as EditServicePayload;
        return candidate.service_id ? candidate : null;
      }
    } catch (error) {
      console.warn('Failed to parse edit payload:', error);
    }
    return null;
  }, [params.editService]);

  const isEditing = Boolean(editServiceId && editingPayload);

  const [isAuto, setIsAuto] = useState(false);
  const [isPersonal, setIsPersonal] = useState(true);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation2 = useRef(new Animated.Value(0)).current;
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const slideAnimation2Ref = useRef<Animated.CompositeAnimation | null>(null);

  const mapRef = useRef<MapView | null>(null);
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<AttachmentAsset[]>([]);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [pendingResumeAction, setPendingResumeAction] = useState<null | 'schedule-wall-mounting'>(null);

  const voicePulseValue = useRef(new Animated.Value(1)).current;
  const voicePulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // --- Hooks ---
  const priceHook = usePriceEstimate({ showModal });

  const locationHook = useLocationManagement({
    showModal,
    mapRef,
    resetPriceState: priceHook.resetPriceState,
  });

  const voiceHook = useVoiceInput({
    setDescription,
    resetPriceState: priceHook.resetPriceState,
    showModal,
  });

  const analysisHook = useWallMountingAnalysis({
    description,
    setDescription,
    locationQuery: locationHook.locationQuery,
    location: locationHook.location,
    fetchPriceEstimate: priceHook.fetchPriceEstimate,
    checkForPropertySize: priceHook.checkForPropertySize,
    isPriceLoading: priceHook.isPriceLoading,
    isTranscribing: voiceHook.isTranscribing,
    showModal,
  });

  // --- Form state collect/restore ---
  const collectFormState = useCallback((): WallMountingFormState => ({
    locationQuery: locationHook.locationQuery,
    location: cloneSelectedLocation(locationHook.location),
    description,
    isAuto,
    isPersonal,
    priceQuote: priceHook.priceQuote,
    priceNote: priceHook.priceNote,
    priceError: priceHook.priceError,
    attachments: cloneAttachments(attachments),
    apartmentSize: analysisHook.apartmentSize,
    packingStatus: analysisHook.packingStatus,
    needsTruck: analysisHook.needsTruck,
    boxesNeeded: analysisHook.boxesNeeded,
    furnitureScope: analysisHook.furnitureScope,
    cleaningType: analysisHook.cleaningType,
    specialRequests: analysisHook.specialRequests,
    detailsPhotos: cloneAttachments(analysisHook.detailsPhotos),
    suppliesNeeded: analysisHook.suppliesNeeded,
  }), [
    locationHook.locationQuery,
    locationHook.location,
    description,
    isAuto,
    isPersonal,
    priceHook.priceQuote,
    priceHook.priceNote,
    priceHook.priceError,
    attachments,
    analysisHook.apartmentSize,
    analysisHook.packingStatus,
    analysisHook.needsTruck,
    analysisHook.boxesNeeded,
    analysisHook.furnitureScope,
    analysisHook.cleaningType,
    analysisHook.specialRequests,
    analysisHook.detailsPhotos,
    analysisHook.suppliesNeeded,
  ]);

  const restoreFormState = useCallback(
    (formState: WallMountingFormState) => {
      locationHook.setLocationQuery(formState.locationQuery ?? '');
      locationHook.setLocation(cloneSelectedLocation(formState.location ?? null));
      setDescription(formState.description ?? '');

      const nextIsAuto = Boolean(formState.isAuto);
      setIsAuto(nextIsAuto);
      slideAnimation.setValue(nextIsAuto ? 1 : 0);

      const nextIsPersonal = Boolean(formState.isPersonal);
      setIsPersonal(nextIsPersonal);
      slideAnimation2.setValue(nextIsPersonal ? 0 : 1);

      priceHook.setPriceQuote(formState.priceQuote ?? null);
      priceHook.setPriceNote(formState.priceNote ?? null);
      priceHook.setPriceError(formState.priceError ?? null);
      setAttachments(cloneAttachments(formState.attachments ?? []));
      analysisHook.setApartmentSize(formState.apartmentSize ?? '');
      analysisHook.setPackingStatus(formState.packingStatus ?? '');
      analysisHook.setNeedsTruck(formState.needsTruck ?? '');
      analysisHook.setBoxesNeeded(formState.boxesNeeded ?? '');
      analysisHook.setFurnitureScope(formState.furnitureScope ?? '');
      analysisHook.setCleaningType(formState.cleaningType ?? '');
      analysisHook.setSpecialRequests(formState.specialRequests ?? '');
      analysisHook.setSuppliesNeeded(formState.suppliesNeeded ?? '');
    },
    [slideAnimation, slideAnimation2, locationHook, priceHook, analysisHook],
  );

  const preserveFormForAuth = useCallback(() => {
    const formState = collectFormState();
    const sanitizedEntries: Array<[string, string]> = [];
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) sanitizedEntries.push([key, trimmed]);
        return;
      }
      if (Array.isArray(value)) {
        const candidate = value.find((item) => typeof item === 'string' && item.trim().length > 0);
        if (typeof candidate === 'string') sanitizedEntries.push([key, candidate.trim()]);
      }
    });

    const payload: WallMountingReturnData = {
      formState,
      action: 'schedule-wall-mounting',
      timestamp: Date.now(),
    };
    if (sanitizedEntries.length > 0) payload.params = Object.fromEntries(sanitizedEntries);
    setReturnTo(WALL_MOUNTING_RETURN_PATH, payload);
  }, [collectFormState, params, setReturnTo]);

  // --- Service submission ---
  const submissionHook = useServiceSubmission({
    user,
    description,
    location: locationHook.location,
    priceQuote: priceHook.priceQuote,
    isAuto,
    isPersonal,
    isEditing,
    editServiceId,
    cleaningType: analysisHook.cleaningType,
    apartmentSize: analysisHook.apartmentSize,
    suppliesNeeded: analysisHook.suppliesNeeded,
    specialRequests: analysisHook.specialRequests,
    attachments,
    showModal,
    setShowSignInModal,
    preserveFormForAuth,
    snapshotLocations: locationHook.snapshotLocations,
    restoreLocations: locationHook.restoreLocations,
  });

  // --- Restore after sign-in ---
  useEffect(() => {
    if (!user) return;
    const returnTo = getReturnTo();
    if (!returnTo || returnTo.path !== WALL_MOUNTING_RETURN_PATH || !returnTo.data) return;
    const payload = returnTo.data as WallMountingReturnData;
    if (!payload?.formState) {
      clearReturnTo();
      return;
    }
    restoreFormState(payload.formState);
    clearReturnTo();
    if (payload.action === 'schedule-wall-mounting') {
      setPendingResumeAction('schedule-wall-mounting');
    }
  }, [user, getReturnTo, clearReturnTo, restoreFormState]);

  useEffect(() => {
    if (user) setShowSignInModal(false);
  }, [user]);

  // --- Edit mode prefill ---
  useEffect(() => {
    if (!editingPayload || !editServiceId) return;

    const nextIsAuto = (editingPayload.autofill_type ?? 'AutoFill').toLowerCase() !== 'custom';
    const nextIsPersonal = (editingPayload.payment_method_type ?? 'Personal').toLowerCase() !== 'business';

    setIsAuto(nextIsAuto);
    slideAnimation.setValue(nextIsAuto ? 1 : 0);
    setIsPersonal(nextIsPersonal);
    slideAnimation2.setValue(nextIsPersonal ? 0 : 1);

    if (typeof editingPayload.price === 'number' && Number.isFinite(editingPayload.price)) {
      priceHook.setPriceQuote(formatCurrency(editingPayload.price));
    } else {
      priceHook.setPriceQuote(null);
    }

    if (typeof editingPayload.description === 'string') {
      setDescription(editingPayload.description.trim());
    } else {
      setDescription('');
    }

    priceHook.setPriceNote(null);
    priceHook.setPriceError(null);

    let cancelled = false;
    const hydrateLocations = async () => {
      const address = editingPayload.location?.trim();
      if (address) {
        const resolved = await locationHook.geocodeAddress(address);
        if (cancelled) return;
        if (resolved) {
          locationHook.applyLocation(resolved, { showStreetNumberWarning: false });
        } else {
          locationHook.setLocationQuery(address);
          locationHook.setLocation(null);
        }
      } else {
        locationHook.setLocationQuery('');
        locationHook.setLocation(null);
      }
    };

    hydrateLocations();
    return () => { cancelled = true; };
  }, [editServiceId, editingPayload, slideAnimation, slideAnimation2, locationHook, priceHook]);

  // --- Description change handler ---
  const handleDescriptionChange = useCallback(
    (text: string) => {
      setDescription(text);
      priceHook.resetPriceState();
    },
    [priceHook],
  );

  // --- Voice pulse animation ---
  useEffect(() => {
    if (voiceHook.isRecording) {
      voicePulseAnimationRef.current?.stop();
      voicePulseAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(voicePulseValue, {
            toValue: 1.2,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(voicePulseValue, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      voicePulseAnimationRef.current.start();
    } else {
      voicePulseAnimationRef.current?.stop();
      voicePulseValue.setValue(1);
    }
    return () => { voicePulseAnimationRef.current?.stop(); };
  }, [voiceHook.isRecording, voicePulseValue]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      voicePulseAnimationRef.current?.stop();
      slideAnimationRef.current?.stop();
      slideAnimation2Ref.current?.stop();
      const currentRecording = voiceHook.recordingRef.current;
      if (currentRecording) currentRecording.stopAndUnloadAsync().catch(() => undefined);
    };
  }, [voiceHook.recordingRef]);

  // --- Pending resume action ---
  useEffect(() => {
    if (!user || pendingResumeAction !== 'schedule-wall-mounting' || submissionHook.isSubmitting) return;
    const timeout = setTimeout(() => {
      setPendingResumeAction(null);
      submissionHook.handleScheduleHelpr();
    }, 0);
    return () => { clearTimeout(timeout); };
  }, [submissionHook.handleScheduleHelpr, submissionHook.isSubmitting, pendingResumeAction, user]);

  // --- Media upload handler ---
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
      setAttachments((prev) => [...prev, { uri: asset.uri, type, name }]);
    } catch (error) {
      console.warn('Media picker error', error);
      showModal({ title: 'Upload failed', message: 'Unable to select media right now.' });
    }
  }, [showModal]);

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <MapWithMarker ref={mapRef} location={locationHook.location} />

        <View style={styles.contentArea}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Image source={require('../../../assets/icons/backButton.png')} style={styles.backButtonIcon} />
          </Pressable>

          <View style={styles.panel}>
            <WallMountingHeader />

            <LocationSection
              locationQuery={locationHook.locationQuery}
              suggestions={locationHook.suggestions}
              loading={locationHook.loading || locationHook.currentLocationLoading}
              currentLocationOption={locationHook.currentLocationOption}
              isSuggestionsVisible={locationHook.isSuggestionsVisible}
              onChangeText={locationHook.handleLocationChange}
              onSelectSuggestion={locationHook.handleLocationSelect}
              onClear={locationHook.handleLocationClear}
              onSuggestionsVisibilityChange={locationHook.handleSuggestionsVisibilityChange}
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
                {priceHook.isPriceLoading ? (
                  <ActivityIndicator size="small" color="#0c4309" />
                ) : (
                  <>
                    {priceHook.priceQuote ? (
                      <View style={styles.PriceOfServiceQuoteRow}>
                        <Text
                          style={[styles.PriceOfServiceQuoteText, styles.PriceOfServiceQuotePrice]}
                          numberOfLines={1}
                        >
                          {priceHook.priceQuote}
                        </Text>
                        <Text style={styles.PriceOfServiceQuoteEstimateText}>est.</Text>
                      </View>
                    ) : (
                      <>
                        <Text
                          style={[
                            styles.PriceOfServiceQuoteText,
                            priceHook.priceError ? styles.PriceOfServiceQuoteTextError : null,
                          ]}
                          numberOfLines={2}
                        >
                          {priceHook.priceError ?? 'Enter description to see price'}
                        </Text>
                        {priceHook.priceNote ? (
                          <Text style={styles.PriceOfServiceQuoteNoteText} numberOfLines={2}>
                            {priceHook.priceNote}
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
                onSubmitEditing={analysisHook.handleWallMountingAnalysisSubmit}
                blurOnSubmit
                returnKeyType="done"
                editable={!voiceHook.isTranscribing}
              />
              <View style={styles.inputButtonsContainer}>
                <View style={styles.voiceContainer}>
                  <Pressable
                    style={[
                      styles.voiceButton,
                      (voiceHook.isRecording || voiceHook.isTranscribing) && styles.voiceButtonActive,
                    ]}
                    onPress={voiceHook.handleVoiceModePress}
                    disabled={voiceHook.isTranscribing}
                  >
                    <Animated.View style={{ transform: [{ scale: voicePulseValue }] }}>
                      <SvgXml xml={voiceIconSvg} width="20" height="20" />
                    </Animated.View>
                  </Pressable>
                  <View style={styles.voiceStatusRow}>
                    <Text style={styles.inputButtonsText}>
                      {voiceHook.isRecording
                        ? 'Listening\u2026'
                        : voiceHook.isTranscribing
                          ? 'Processing\u2026'
                          : 'Voice Mode'}
                    </Text>
                    {voiceHook.isTranscribing ? (
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

            {/* AutoFill / Custom Toggle */}
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
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    setIsAuto((prev) => {
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
                  }}
                >
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

            {/* Personal / Business Toggle */}
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
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => {
                      setIsPersonal((prev) => {
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
                    }}
                  >
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

            {/* Schedule Button */}
            <View style={styles.bottomRowContainer}>
              <Pressable onPress={submissionHook.handleScheduleHelpr} style={styles.scheduleHelprContainer}>
                <Text style={styles.scheduleHelprText}>Schedule Helpr</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Sign-In Required Modal */}
      <Modal
        visible={showSignInModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignInModal(false)}
      >
        <View style={styles.signInOverlayBackground}>
          <View style={styles.signInModal}>
            <Text style={styles.signInTitle}>Sign In Required</Text>
            <View style={styles.signInDivider} />
            <Text style={styles.signInMessage}>
              Please sign in or sign up to schedule a wall mounting service.
            </Text>
            <View style={styles.signInButtonsRow}>
              <Pressable
                style={styles.signInButton}
                onPress={() => {
                  preserveFormForAuth();
                  setShowSignInModal(false);
                  router.push('/(auth)/login' as any);
                }}
              >
                <Text style={styles.signInButtonText}>Sign In</Text>
              </Pressable>
              <Pressable
                style={styles.signUpButton}
                onPress={() => {
                  preserveFormForAuth();
                  setShowSignInModal(false);
                  router.push('/(auth)/signup' as any);
                }}
              >
                <Text style={styles.signUpButtonText}>Sign Up</Text>
              </Pressable>
            </View>
            <Pressable style={styles.cancelButton} onPress={() => setShowSignInModal(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Cleaning Type Selection Modal */}
      <CleaningTypeModal
        visible={analysisHook.showCleaningTypeModal}
        cleaningType={analysisHook.cleaningType}
        onSelect={analysisHook.handleCleaningTypeSelect}
        onClose={() => analysisHook.setShowCleaningTypeModal(false)}
      />

      {/* Space Size Modal */}
      <ApartmentSizeModal
        visible={analysisHook.showApartmentSizeModal}
        apartmentSize={analysisHook.apartmentSize}
        onChangeText={analysisHook.setApartmentSize}
        onBack={analysisHook.handleApartmentSizeBack}
        onSubmit={analysisHook.handleApartmentSizeSubmit}
        onClose={() => analysisHook.setShowApartmentSizeModal(false)}
      />

      {/* Supplies Needed Modal */}
      <SuppliesModal
        visible={analysisHook.showSuppliesModal}
        suppliesNeeded={analysisHook.suppliesNeeded}
        onChangeText={analysisHook.setSuppliesNeeded}
        onBack={analysisHook.handleSuppliesBack}
        onSubmit={analysisHook.handleSuppliesSubmit}
        onClose={() => analysisHook.setShowSuppliesModal(false)}
      />

      {/* Details and Photos Modal */}
      <DetailsModal
        visible={analysisHook.showDetailsModal}
        specialRequests={analysisHook.specialRequests}
        detailsPhotos={analysisHook.detailsPhotos}
        onChangeText={analysisHook.setSpecialRequests}
        onBack={analysisHook.handleDetailsBack}
        onSubmit={analysisHook.handleDetailsSubmit}
        onPhotoUpload={analysisHook.handleDetailsPhotoUpload}
        onClose={() => {}}
      />

      {/* Wall Mounting Analysis Modal */}
      <WallMountingAnalysisFlowModal
        visible={analysisHook.showWallMountingAnalysisModal}
        questionsToShow={analysisHook.wallMountingAnalysis.questionsToShow}
        currentQuestionStep={analysisHook.currentQuestionStep}
        needsTruck={analysisHook.needsTruck}
        packingStatus={analysisHook.packingStatus}
        boxesNeeded={analysisHook.boxesNeeded}
        apartmentSize={analysisHook.apartmentSize}
        furnitureScope={analysisHook.furnitureScope}
        setNeedsTruck={analysisHook.setNeedsTruck}
        setPackingStatus={analysisHook.setPackingStatus}
        setBoxesNeeded={analysisHook.setBoxesNeeded}
        setApartmentSize={analysisHook.setApartmentSize}
        setFurnitureScope={analysisHook.setFurnitureScope}
        onBack={analysisHook.handleAnalysisModalBack}
        onSubmit={analysisHook.handleAnalysisModalSubmit}
        onClose={analysisHook.resetWallMountingAnalysisFlow}
      />
    </View>
  );
}
