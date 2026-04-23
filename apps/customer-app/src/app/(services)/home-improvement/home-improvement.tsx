import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView from 'react-native-maps';
import { SvgXml } from 'react-native-svg';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';

import {
  ApartmentSizeModal,
  DetailsModal,
  HomeImprovementAnalysisQuestionModal,
  MaterialsModal,
  ProjectTypeModal,
} from './HomeImprovementAnalysisModal';
import { HomeImprovementHeader } from './HomeImprovementHeader';
import {
  useHomeImprovementAnalysis,
  useLocationManagement,
  usePriceEstimate,
  useServiceSubmission,
  useVoiceInput,
} from './home-improvement.hooks';
import { styles } from './home-improvement.styles';
import { EditServicePayload, HomeImprovementFormState, HomeImprovementReturnData } from './home-improvement.types';
import {
  cloneAttachments,
  cloneSelectedLocation,
  containsStreetNumber,
  formatCurrency,
  HOME_IMPROVEMENT_RETURN_PATH,
} from './home-improvement.utils';
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

export default function HomeImprovement() {
  const { user, setReturnTo, getReturnTo, clearReturnTo } = useAuth();
  const { showModal } = useModal();
  const params = useLocalSearchParams<{ editServiceId?: string | string[]; editService?: string | string[] }>();
  const mapRef = useRef<MapView | null>(null);

  const editServiceId = useMemo(() => {
    const raw = params.editServiceId;
    if (!raw) return null;
    return Array.isArray(raw) ? raw[0] ?? null : raw;
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

  // Toggle states
  const [isAuto, setIsAuto] = useState(false);
  const [isPersonal, setIsPersonal] = useState(true);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation2 = useRef(new Animated.Value(0)).current;
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const slideAnimation2Ref = useRef<Animated.CompositeAnimation | null>(null);

  // Core form state
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<AttachmentAsset[]>([]);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [pendingResumeAction, setPendingResumeAction] = useState<null | 'schedule-home-improvement'>(null);

  // Home improvement-specific modal state
  const [projectType, setProjectType] = useState<'repair' | 'renovation' | ''>('');
  const [apartmentSize, setApartmentSize] = useState('');
  const [materialsNeeded, setMaterialsNeeded] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [detailsPhotos, setDetailsPhotos] = useState<AttachmentAsset[]>([]);
  const [showProjectTypeModal, setShowProjectTypeModal] = useState(false);
  const [showApartmentSizeModal, setShowApartmentSizeModal] = useState(false);
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const lastEnhancedDescriptionRef = useRef<string | null>(null);

  // Legacy analysis modal state
  const [showHomeImprovementAnalysisModal, setShowHomeImprovementAnalysisModal] = useState(false);
  const [currentQuestionStep, setCurrentQuestionStep] = useState(0);
  const [packingStatus, setPackingStatus] = useState<'' | 'packed' | 'not-packed'>('');
  const [needsTruck, setNeedsTruck] = useState<'' | 'yes' | 'no'>('');
  const [boxesNeeded, setBoxesNeeded] = useState<'' | 'yes' | 'no'>('');
  const [furnitureScope, setFurnitureScope] = useState('');

  // Voice animation
  const voicePulseValue = useRef(new Animated.Value(1)).current;
  const voicePulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [forceHideSuggestions, setForceHideSuggestions] = useState(false);

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

  const analysis = useHomeImprovementAnalysis({
    description,
    locationQuery: locationManagement.locationQuery,
    location: locationManagement.location,
    showModal,
  });

  // Collect / restore form state for auth flow
  const collectFormState = useCallback((): HomeImprovementFormState => ({
    locationQuery: locationManagement.locationQuery,
    location: cloneSelectedLocation(locationManagement.location),
    description,
    isAuto,
    isPersonal,
    priceQuote: priceEstimate.priceQuote,
    priceNote: priceEstimate.priceNote,
    priceError: priceEstimate.priceError,
    attachments: cloneAttachments(attachments),
    apartmentSize,
    packingStatus,
    needsTruck,
    boxesNeeded,
    furnitureScope,
    projectType,
    specialRequests,
    detailsPhotos: cloneAttachments(detailsPhotos),
    materialsNeeded,
  }), [
    locationManagement.locationQuery, locationManagement.location, description,
    isAuto, isPersonal, priceEstimate.priceQuote, priceEstimate.priceNote,
    priceEstimate.priceError, attachments, apartmentSize, packingStatus,
    needsTruck, boxesNeeded, furnitureScope, projectType, specialRequests,
    detailsPhotos, materialsNeeded,
  ]);

  const restoreFormState = useCallback((formState: HomeImprovementFormState) => {
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
    setApartmentSize(formState.apartmentSize ?? '');
    setPackingStatus(formState.packingStatus ?? '');
    setNeedsTruck(formState.needsTruck ?? '');
    setBoxesNeeded(formState.boxesNeeded ?? '');
    setFurnitureScope(formState.furnitureScope ?? '');
    setProjectType(formState.projectType ?? '');
    setSpecialRequests(formState.specialRequests ?? '');
    setDetailsPhotos(cloneAttachments(formState.detailsPhotos ?? []));
    setMaterialsNeeded(formState.materialsNeeded ?? '');
  }, [slideAnimation, slideAnimation2, locationManagement, priceEstimate]);

  const serviceSubmission = useServiceSubmission({
    user,
    description,
    location: locationManagement.location,
    locationQuery: locationManagement.locationQuery,
    priceQuote: priceEstimate.priceQuote,
    isAuto,
    isPersonal,
    isEditing,
    editServiceId,
    showModal,
    collectFormState,
    setReturnTo,
    params,
    snapshotLocations: locationManagement.snapshotLocations,
    restoreLocations: locationManagement.restoreLocations,
    projectType,
    apartmentSize,
    materialsNeeded,
    specialRequests,
  });

  // Restore form after sign-in
  useEffect(() => {
    if (!user) return;
    const returnTo = getReturnTo();
    if (!returnTo || returnTo.path !== HOME_IMPROVEMENT_RETURN_PATH || !returnTo.data) return;
    const payload = returnTo.data as HomeImprovementReturnData;
    if (!payload?.formState) { clearReturnTo(); return; }
    restoreFormState(payload.formState);
    clearReturnTo();
    if (payload.action === 'schedule-home-improvement') {
      setPendingResumeAction('schedule-home-improvement');
    }
  }, [user, getReturnTo, clearReturnTo, restoreFormState]);

  // Close sign-in modal on login
  useEffect(() => {
    if (user) setShowSignInModal(false);
  }, [user]);

  // Resume pending action
  useEffect(() => {
    if (!user || pendingResumeAction !== 'schedule-home-improvement' || serviceSubmission.isSubmitting) return;
    const timeout = setTimeout(() => {
      setPendingResumeAction(null);
      serviceSubmission.handleSchedule(setShowSignInModal);
    }, 0);
    return () => clearTimeout(timeout);
  }, [serviceSubmission.handleSchedule, serviceSubmission.isSubmitting, pendingResumeAction, user]);

  // Hydrate from editing payload
  useEffect(() => {
    if (!editingPayload || !editServiceId) return;
    const nextIsAuto = (editingPayload.autofill_type ?? 'AutoFill').toLowerCase() !== 'custom';
    const nextIsPersonal = (editingPayload.payment_method_type ?? 'Personal').toLowerCase() !== 'business';

    setIsAuto(nextIsAuto);
    slideAnimation.setValue(nextIsAuto ? 1 : 0);
    setIsPersonal(nextIsPersonal);
    slideAnimation2.setValue(nextIsPersonal ? 0 : 1);

    if (typeof editingPayload.price === 'number' && Number.isFinite(editingPayload.price)) {
      priceEstimate.setPriceQuote(formatCurrency(editingPayload.price));
    } else {
      priceEstimate.setPriceQuote(null);
    }
    if (typeof editingPayload.description === 'string') {
      setDescription(editingPayload.description.trim());
    } else {
      setDescription('');
    }
    priceEstimate.setPriceNote(null);
    priceEstimate.setPriceError(null);

    let cancelled = false;
    const hydrateLocations = async () => {
      const address = editingPayload.location?.trim();
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
  }, [editServiceId, editingPayload, slideAnimation, slideAnimation2, locationManagement, priceEstimate]);

  // Voice pulse animation
  useEffect(() => {
    if (voiceInput.isRecording) {
      voicePulseAnimationRef.current?.stop();
      voicePulseAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(voicePulseValue, { toValue: 1.2, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(voicePulseValue, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      voicePulseAnimationRef.current.start();
    } else {
      voicePulseAnimationRef.current?.stop();
      voicePulseValue.setValue(1);
    }
    return () => { voicePulseAnimationRef.current?.stop(); };
  }, [voiceInput.isRecording, voicePulseValue]);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      voicePulseAnimationRef.current?.stop();
      slideAnimationRef.current?.stop();
      slideAnimation2Ref.current?.stop();
      voiceInput.recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
    };
  }, []);

  // Sync state from description edits
  useEffect(() => {
    const hasEnhancedFormat = analysis.checkIfDescriptionAlreadyEnhanced(description);
    if (!description) {
      if (lastEnhancedDescriptionRef.current && (projectType || apartmentSize || materialsNeeded || specialRequests)) {
        setProjectType('');
        setApartmentSize('');
        setMaterialsNeeded('');
        setSpecialRequests('');
        lastEnhancedDescriptionRef.current = null;
      }
      return;
    }
    if (hasEnhancedFormat) lastEnhancedDescriptionRef.current = description;
    if (!hasEnhancedFormat && lastEnhancedDescriptionRef.current && (projectType || apartmentSize || materialsNeeded || specialRequests)) {
      setProjectType('');
      setApartmentSize('');
      setMaterialsNeeded('');
      setSpecialRequests('');
      lastEnhancedDescriptionRef.current = null;
      return;
    }
    if (!hasEnhancedFormat) return;

    const typeMatch = description.match(/\.\s*Type:\s*(Basic|Deep)\s*cleaning/i);
    if (typeMatch) {
      const type = typeMatch[1].toLowerCase() as 'repair' | 'renovation';
      if (projectType !== type) setProjectType(type);
    } else if (projectType) setProjectType('');

    const sizeMatch = description.match(/\.\s*Property size:\s*([^.]+)/i);
    if (sizeMatch) {
      const size = sizeMatch[1].trim();
      if (apartmentSize !== size) setApartmentSize(size);
    } else if (apartmentSize) setApartmentSize('');

    const materialsMatch = description.match(/\.\s*Materials to bring:\s*([^.]+)/i);
    if (materialsMatch) {
      const materials = materialsMatch[1].trim();
      if (materialsNeeded !== materials) setMaterialsNeeded(materials);
    } else if (materialsNeeded) setMaterialsNeeded('');

    const requestsMatch = description.match(/\.\s*Special requests:\s*([^.]+)/i);
    if (requestsMatch) {
      const requests = requestsMatch[1].trim();
      if (specialRequests !== requests) setSpecialRequests(requests);
    } else if (specialRequests) setSpecialRequests('');
  }, [description, projectType, apartmentSize, materialsNeeded, specialRequests, analysis]);

  // Handlers
  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    priceEstimate.resetPriceState();
  }, [priceEstimate]);

  const handleDescriptionSubmit = useCallback(() => {
    if (priceEstimate.isPriceLoading || voiceInput.isTranscribing) return;
    const trimmed = description.trim();
    if (trimmed.length === 0) {
      priceEstimate.setPriceQuote(null);
      priceEstimate.setPriceNote(null);
      priceEstimate.setPriceError('Add a brief task description to see a price.');
      return;
    }
    if (!locationManagement.location) {
      showModal({ title: 'Missing location', message: 'Please enter a location.' });
      return;
    }
    Keyboard.dismiss();

    if (projectType) {
      if (analysis.checkForPropertySize(description) || apartmentSize) {
        if (materialsNeeded) {
          const baseDesc = description
            .replace(/\.\s*Type:\s*(Basic|Deep)\s*cleaning/gi, '')
            .replace(/\.\s*Property size:\s*[^.]+/gi, '')
            .replace(/\.\s*Materials to bring:\s*[^.]+/gi, '')
            .replace(/\.\s*Special requests:\s*[^.]+/gi, '')
            .trim();
          const projectTypeText = projectType === 'repair' ? 'Basic repair' : projectType === 'renovation' ? 'Major renovation' : '';
          const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
          const materialsInfo2 = materialsNeeded ? `. Materials to bring: ${materialsNeeded}` : '';
          const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';
          const rebuiltDescription = `${baseDesc}${projectTypeText ? `. Type: ${projectTypeText}` : ''}${sizeInfo}${materialsInfo2}${requestsInfo}`;
          if (rebuiltDescription !== description) setDescription(rebuiltDescription);
          priceEstimate.fetchPrice(rebuiltDescription, { start: locationManagement.location, end: locationManagement.location });
        } else {
          setShowMaterialsModal(true);
        }
      } else {
        setShowApartmentSizeModal(true);
      }
    } else {
      setShowProjectTypeModal(true);
    }
  }, [description, locationManagement.location, priceEstimate, voiceInput.isTranscribing, projectType, apartmentSize, materialsNeeded, specialRequests, showModal, analysis]);

  const handleHomeImprovementAnalysisSubmit = useCallback(() => {
    const result = analysis.analyzeDescription(description);
    if (!result.hasStreetNumber) {
      showModal({ title: 'Add street number', message: 'Update your location to include the street number so your helpr can find you.' });
      return;
    }
    handleDescriptionSubmit();
  }, [analysis, description, handleDescriptionSubmit, showModal]);

  const handleProjectTypeSelect = useCallback((type: 'repair' | 'renovation') => {
    setProjectType(type);
    setShowProjectTypeModal(false);
    if (analysis.checkForPropertySize(description)) {
      setShowMaterialsModal(true);
    } else {
      setShowApartmentSizeModal(true);
    }
  }, [description, analysis]);

  const handleApartmentSizeBack = useCallback(() => {
    setShowApartmentSizeModal(false);
    setShowProjectTypeModal(true);
  }, []);

  const handleApartmentSizeSubmit = useCallback(() => {
    if (!apartmentSize.trim()) return;
    setShowApartmentSizeModal(false);
    setShowMaterialsModal(true);
  }, [apartmentSize]);

  const handleMaterialsBack = useCallback(() => {
    setShowMaterialsModal(false);
    if (analysis.checkForPropertySize(description)) {
      setShowProjectTypeModal(true);
    } else {
      setShowApartmentSizeModal(true);
    }
  }, [description, analysis]);

  const handleMaterialsSubmit = useCallback(() => {
    setShowMaterialsModal(false);
    setShowDetailsModal(true);
  }, []);

  const handleDetailsBack = useCallback(() => {
    setShowDetailsModal(false);
    setShowMaterialsModal(true);
  }, []);

  const handleDetailsSubmit = useCallback(() => {
    setShowDetailsModal(false);
    if (description.trim() && locationManagement.location) {
      if (analysis.checkIfDescriptionAlreadyEnhanced(description)) {
        priceEstimate.fetchPrice(description, { start: locationManagement.location, end: locationManagement.location });
      } else {
        const projectTypeText = projectType === 'repair' ? 'Basic repair' : projectType === 'renovation' ? 'Major renovation' : '';
        const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
        const materialsInfo2 = materialsNeeded ? `. Materials to bring: ${materialsNeeded}` : '';
        const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';
        const enhancedDescription = `${description}${projectTypeText ? `. Type: ${projectTypeText}` : ''}${sizeInfo}${materialsInfo2}${requestsInfo}`;
        setDescription(enhancedDescription);
        priceEstimate.fetchPrice(enhancedDescription, { start: locationManagement.location, end: locationManagement.location });
      }
    }
  }, [description, locationManagement.location, projectType, apartmentSize, materialsNeeded, specialRequests, analysis, priceEstimate]);

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

  const handleDetailsPhotoUpload = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showModal({ title: 'Permission needed', message: 'Enable photo library access to attach images.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.8,
      });
      if (result.canceled || !(result.assets && result.assets.length > 0)) return;
      const asset = result.assets[0];
      setDetailsPhotos(prev => [...prev, { uri: asset.uri, type: 'photo', name: asset.fileName ?? 'details-photo.jpg' }]);
    } catch (error) {
      console.warn('Photo picker error', error);
      showModal({ title: 'Upload failed', message: 'Unable to select photo right now.' });
    }
  }, [showModal]);

  const resetHomeImprovementAnalysisFlow = useCallback(() => {
    setShowHomeImprovementAnalysisModal(false);
    setCurrentQuestionStep(0);
    setApartmentSize('');
    setFurnitureScope('');
    setPackingStatus('');
    setNeedsTruck('');
    setBoxesNeeded('');
  }, []);

  const handleAnalysisModalBack = useCallback(() => {
    if (currentQuestionStep === 0) { resetHomeImprovementAnalysisFlow(); return; }
    setCurrentQuestionStep(prev => Math.max(0, prev - 1));
  }, [currentQuestionStep, resetHomeImprovementAnalysisFlow]);

  const handleAnalysisModalSubmit = useCallback(() => {
    resetHomeImprovementAnalysisFlow();
    handleDescriptionSubmit();
  }, [handleDescriptionSubmit, resetHomeImprovementAnalysisFlow]);

  const homeImprovementAnalysis = useMemo(() => {
    const result = analysis.analyzeDescription(description);
    const missingInfo: string[] = [];
    if (result.missingStreetNumber) missingInfo.push('street number');
    const questionsToShow: Array<{ id: string; title: string; message: string; placeholder: string; multiline?: boolean; options?: string[] }> = [];
    return { ...result, missingInfo, questionsToShow };
  }, [analysis, description]);

  const handleScheduleHelpr = useCallback(async () => {
    await serviceSubmission.handleSchedule(setShowSignInModal);
  }, [serviceSubmission]);

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <MapWithMarker ref={mapRef} location={locationManagement.location} />

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Image source={require('../../../assets/icons/backButton.png')} style={styles.backButtonIcon} />
        </Pressable>

        <View style={styles.contentArea}>
          <View style={styles.panel}>
            <HomeImprovementHeader />

            <LocationSection
              value={locationManagement.locationQuery}
              onChangeText={locationManagement.handleLocationChange}
              onSelectSuggestion={locationManagement.handleLocationSelect}
              onClear={locationManagement.handleLocationClear}
              suggestions={locationManagement.suggestions}
              loading={locationManagement.loading || locationManagement.currentLocationLoading}
              currentLocationOption={locationManagement.currentLocationOption}
              forceHideSuggestions={forceHideSuggestions}
              onFocusInput={() => setForceHideSuggestions(false)}
              onSuggestionsVisibilityChange={locationManagement.handleSuggestionsVisibilityChange}
            />

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
                        <Text style={[styles.PriceOfServiceQuoteText, styles.PriceOfServiceQuotePrice]} numberOfLines={1}>
                          {priceEstimate.priceQuote}
                        </Text>
                        <Text style={styles.PriceOfServiceQuoteEstimateText}>est.</Text>
                      </View>
                    ) : (
                      <>
                        <Text style={[styles.PriceOfServiceQuoteText, priceEstimate.priceError ? styles.PriceOfServiceQuoteTextError : null]} numberOfLines={2}>
                          {priceEstimate.priceError ?? 'Enter description to see price'}
                        </Text>
                        {priceEstimate.priceNote ? (
                          <Text style={styles.PriceOfServiceQuoteNoteText} numberOfLines={2}>{priceEstimate.priceNote}</Text>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </View>
            </View>

            <View style={styles.jobDescriptionContainer}>
              <TextInput
                style={styles.jobDescriptionText}
                placeholder="Describe your task...                                         (e.g.  'I need my one bedroom apartment renovation cleaned.')"
                multiline
                numberOfLines={4}
                placeholderTextColor="#333333ab"
                value={description}
                onChangeText={handleDescriptionChange}
                onSubmitEditing={handleHomeImprovementAnalysisSubmit}
                blurOnSubmit
                returnKeyType="done"
                editable={!voiceInput.isTranscribing}
              />
              <View style={styles.inputButtonsContainer}>
                <View style={styles.voiceContainer}>
                  <Pressable
                    style={[styles.voiceButton, (voiceInput.isRecording || voiceInput.isTranscribing) && styles.voiceButtonActive]}
                    onPress={voiceInput.handleVoicePress}
                    disabled={voiceInput.isTranscribing}
                  >
                    <Animated.View style={{ transform: [{ scale: voicePulseValue }] }}>
                      <SvgXml xml={voiceIconSvg} width="20" height="20" />
                    </Animated.View>
                  </Pressable>
                  <View style={styles.voiceStatusRow}>
                    <Text style={styles.inputButtonsText}>
                      {voiceInput.isRecording ? 'Listening…' : voiceInput.isTranscribing ? 'Processing…' : 'Voice Mode'}
                    </Text>
                    {voiceInput.isTranscribing ? <ActivityIndicator size="small" color="#0c4309" style={styles.voiceStatusSpinner} /> : null}
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

            <View style={styles.DividerContainer2}>
              <View style={styles.DividerLine2} />
            </View>

            <View style={styles.binarySliderContainer}>
              <Animated.View style={styles.binarySlider}>
                <View style={styles.binarySliderIcons}>
                  <Image source={require('../../../assets/icons/ChooseHelprIcon.png')} style={[styles.binarySliderIcon, { opacity: isAuto ? 0.5 : 1, marginLeft: 7 }]} />
                  <Image source={require('../../../assets/icons/AutoFillIcon.png')} style={[styles.binarySliderIcon, { opacity: isAuto ? 1 : 0.5, marginLeft: 12 }]} />
                </View>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    setIsAuto(prev => {
                      const next = !prev;
                      slideAnimationRef.current?.stop();
                      slideAnimationRef.current = Animated.spring(slideAnimation, { toValue: next ? 1 : 0, useNativeDriver: false, friction: 8, tension: 50 });
                      slideAnimationRef.current.start();
                      return next;
                    });
                  }}
                >
                  <Animated.View style={[styles.binarySliderThumb, { transform: [{ translateX: slideAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }] }]} />
                </Pressable>
              </Animated.View>
              <Text style={styles.binarySliderLabel}>
                <Text style={[styles.binarySliderLabel, styles.isAutoSliderTitle]}>{isAuto ? 'AutoFill' : 'Custom'}</Text>
                {'\n'}
                <Text style={[styles.binarySliderLabel, styles.isAutoSliderSubtitle]}>
                  {isAuto ? 'Confirm the first available helpr at this price' : 'Choose from available pros'}
                </Text>
              </Text>
            </View>

            <View style={styles.sliderRowContainer}>
              <View style={styles.binarySliderContainer}>
                <Animated.View style={styles.binarySlider}>
                  <View style={styles.binarySliderIcons2}>
                    <Image source={require('../../../assets/icons/PersonalPMIcon.png')} style={styles.binarySliderIcon2} />
                    <Image source={require('../../../assets/icons/BusinessPMIcon.png')} style={styles.BusinessPMIcon} />
                  </View>
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => {
                      setIsPersonal(prev => {
                        const next = !prev;
                        slideAnimation2Ref.current?.stop();
                        slideAnimation2Ref.current = Animated.spring(slideAnimation2, { toValue: next ? 0 : 1, useNativeDriver: false, friction: 8, tension: 50 });
                        slideAnimation2Ref.current.start();
                        return next;
                      });
                    }}
                  >
                    <Animated.View style={[styles.binarySliderThumb, { transform: [{ translateX: slideAnimation2.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }] }]} />
                  </Pressable>
                </Animated.View>
                <Text style={styles.binarySliderLabel}>
                  <Text style={[styles.binarySliderLabel, styles.isPersonalSliderTitle]}>{isPersonal ? 'Personal' : 'Business'}</Text>
                  {'\n'}
                  <Text style={[styles.binarySliderLabel, styles.isPersonalSliderSubtitle]}>
                    {isPersonal ? '*Insert Payment Method*' : '*Insert Payment Method*'}
                  </Text>
                </Text>
              </View>
              <View style={styles.pmIconContainer}>
                <Image source={require('../../../assets/icons/PMIcon.png')} style={styles.pmIcon} />
                <Image source={require('../../../assets/icons/ArrowIcon.png')} style={[styles.arrowIcon, { resizeMode: 'contain' }]} />
              </View>
            </View>

            <View style={styles.bottomRowContainer}>
              <Pressable onPress={handleScheduleHelpr} style={styles.scheduleHelprContainer}>
                <Text style={styles.scheduleHelprText}>Schedule Helpr</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Sign-In Modal */}
      <Modal visible={showSignInModal} transparent animationType="fade" onRequestClose={() => setShowSignInModal(false)}>
        <View style={styles.signInOverlayBackground}>
          <View style={styles.signInModal}>
            <Text style={styles.signInTitle}>Sign In Required</Text>
            <View style={styles.signInDivider} />
            <Text style={styles.signInMessage}>Please sign in or sign up to schedule a home improvement service.</Text>
            <View style={styles.signInButtonsRow}>
              <Pressable
                style={styles.signInButton}
                onPress={() => {
                  serviceSubmission.preserveFormForAuth();
                  setShowSignInModal(false);
                  router.push('/(auth)/login' as any);
                }}
              >
                <Text style={styles.signInButtonText}>Sign In</Text>
              </Pressable>
              <Pressable
                style={styles.signUpButton}
                onPress={() => {
                  serviceSubmission.preserveFormForAuth();
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

      {/* Project Type, Apartment Size, Materials, Details Modals */}
      <ProjectTypeModal
        visible={showProjectTypeModal}
        projectType={projectType}
        onSelect={handleProjectTypeSelect}
        onClose={() => setShowProjectTypeModal(false)}
      />
      <ApartmentSizeModal
        visible={showApartmentSizeModal}
        apartmentSize={apartmentSize}
        onChangeText={setApartmentSize}
        onBack={handleApartmentSizeBack}
        onSubmit={handleApartmentSizeSubmit}
        onClose={() => setShowApartmentSizeModal(false)}
      />
      <MaterialsModal
        visible={showMaterialsModal}
        materialsNeeded={materialsNeeded}
        onChangeText={setMaterialsNeeded}
        onBack={handleMaterialsBack}
        onSubmit={handleMaterialsSubmit}
        onClose={() => setShowMaterialsModal(false)}
      />
      <DetailsModal
        visible={showDetailsModal}
        specialRequests={specialRequests}
        onChangeSpecialRequests={setSpecialRequests}
        detailsPhotos={detailsPhotos}
        onPhotoUpload={handleDetailsPhotoUpload}
        onBack={handleDetailsBack}
        onSubmit={handleDetailsSubmit}
        onClose={() => setShowDetailsModal(false)}
      />

      {/* Legacy Analysis Modal */}
      <HomeImprovementAnalysisQuestionModal
        visible={showHomeImprovementAnalysisModal}
        questionsToShow={homeImprovementAnalysis.questionsToShow}
        currentQuestionStep={currentQuestionStep}
        needsTruck={needsTruck}
        setNeedsTruck={setNeedsTruck}
        packingStatus={packingStatus}
        setPackingStatus={setPackingStatus}
        boxesNeeded={boxesNeeded}
        setBoxesNeeded={setBoxesNeeded}
        apartmentSize={apartmentSize}
        setApartmentSize={setApartmentSize}
        furnitureScope={furnitureScope}
        setFurnitureScope={setFurnitureScope}
        onBack={handleAnalysisModalBack}
        onSubmit={handleAnalysisModalSubmit}
        onClose={resetHomeImprovementAnalysisFlow}
      />
    </View>
  );
}
