import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { SvgXml } from 'react-native-svg';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';

import {
  ApartmentSizeModal,
  AssemblyComplexityModal,
  DetailsModal,
  FurnitureAssemblyAnalysisModal,
  ToolsModal,
} from './FurnitureAssemblyAnalysisModal';
import {
  useFurnitureAssemblyAnalysis,
  useLocationManagement,
  usePriceEstimate,
  useServiceSubmission,
  useVoiceInput,
} from './furniture-assembly.hooks';
import { styles } from './furniture-assembly.styles';
import { EditServicePayload, FurnitureAssemblyFormState, FurnitureAssemblyReturnData } from './furniture-assembly.types';
import {
  cloneAttachments,
  cloneSelectedLocation,
  formatCurrency,
  FURNITURE_ASSEMBLY_RETURN_PATH,
} from './furniture-assembly.utils';
import { FurnitureAssemblyHeader } from './FurnitureAssemblyHeader';
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

export default function FurnitureAssembly() {
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
    } catch (error) { console.warn('Failed to parse edit payload:', error); }
    return null;
  }, [params.editService]);

  const isEditing = Boolean(editServiceId && editingPayload);

  // Core form state
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<AttachmentAsset[]>([]);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [pendingResumeAction, setPendingResumeAction] = useState<null | 'schedule-furniture-assembly'>(null);

  // Toggle states
  const [isAuto, setIsAuto] = useState(false);
  const [isPersonal, setIsPersonal] = useState(true);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation2 = useRef(new Animated.Value(0)).current;
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const slideAnimation2Ref = useRef<Animated.CompositeAnimation | null>(null);

  // Furniture assembly analysis modal state
  const [showFurnitureAssemblyAnalysisModal, setShowFurnitureAssemblyAnalysisModal] = useState(false);
  const [showAssemblyComplexityModal, setShowAssemblyComplexityModal] = useState(false);
  const [showApartmentSizeModal, setShowApartmentSizeModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [currentQuestionStep, setCurrentQuestionStep] = useState(0);
  const [apartmentSize, setApartmentSize] = useState('');
  const [packingStatus, setPackingStatus] = useState<'' | 'packed' | 'not-packed'>('');
  const [needsTruck, setNeedsTruck] = useState<'' | 'yes' | 'no'>('');
  const [boxesNeeded, setBoxesNeeded] = useState<'' | 'yes' | 'no'>('');
  const [furnitureScope, setFurnitureScope] = useState('');
  const [assemblyComplexity, setAssemblyComplexity] = useState<'' | 'simple' | 'complex'>('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [detailsPhotos, setDetailsPhotos] = useState<AttachmentAsset[]>([]);
  const [toolsNeeded, setToolsNeeded] = useState('');

  // Voice pulse animation
  const voicePulseValue = useRef(new Animated.Value(1)).current;
  const voicePulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Hooks
  const locationMgmt = useLocationManagement({ showModal, mapRef });
  const priceEstimate = usePriceEstimate({ showModal });
  const voiceInput = useVoiceInput({ setDescription, resetPriceState: priceEstimate.resetPriceState, showModal });

  // Wire up the location hook's resetPriceState ref
  locationMgmt.resetPriceStateRef.current = priceEstimate.resetPriceState;

  const furnitureAssemblyAnalysis = useFurnitureAssemblyAnalysis({
    description, location: locationMgmt.location, locationQuery: locationMgmt.locationQuery,
    assemblyComplexity, apartmentSize, toolsNeeded, specialRequests,
    showModal, setAssemblyComplexity, setApartmentSize, setToolsNeeded, setSpecialRequests,
    setDescription, setShowAssemblyComplexityModal, setShowApartmentSizeModal,
    setShowToolsModal, setShowDetailsModal, fetchPriceEstimate: priceEstimate.fetchPriceEstimate,
  });

  // Form state collect/restore for auth
  const collectFormState = useCallback((): FurnitureAssemblyFormState => ({
    locationQuery: locationMgmt.locationQuery,
    location: cloneSelectedLocation(locationMgmt.location),
    description, isAuto, isPersonal,
    priceQuote: priceEstimate.priceQuote, priceNote: priceEstimate.priceNote, priceError: priceEstimate.priceError,
    attachments: cloneAttachments(attachments), apartmentSize, packingStatus, needsTruck, boxesNeeded,
    furnitureScope, assemblyComplexity, specialRequests,
    detailsPhotos: cloneAttachments(detailsPhotos), toolsNeeded,
  }), [
    locationMgmt.locationQuery, locationMgmt.location, description, isAuto, isPersonal,
    priceEstimate.priceQuote, priceEstimate.priceNote, priceEstimate.priceError,
    attachments, apartmentSize, packingStatus, needsTruck, boxesNeeded,
    furnitureScope, assemblyComplexity, specialRequests, detailsPhotos, toolsNeeded,
  ]);

  const restoreFormState = useCallback((formState: FurnitureAssemblyFormState) => {
    locationMgmt.setLocationQuery(formState.locationQuery ?? '');
    locationMgmt.setLocation(cloneSelectedLocation(formState.location ?? null));
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
    setAssemblyComplexity(formState.assemblyComplexity ?? '');
    setSpecialRequests(formState.specialRequests ?? '');
    setDetailsPhotos(cloneAttachments(formState.detailsPhotos ?? []));
    setToolsNeeded(formState.toolsNeeded ?? '');
  }, [slideAnimation, slideAnimation2, locationMgmt, priceEstimate]);

  const preserveFormForAuth = useCallback(() => {
    const formState = collectFormState();
    const sanitizedEntries: Array<[string, string]> = [];
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') { const trimmed = value.trim(); if (trimmed.length > 0) sanitizedEntries.push([key, trimmed]); return; }
      if (Array.isArray(value)) { const candidate = value.find(item => typeof item === 'string' && item.trim().length > 0); if (typeof candidate === 'string') sanitizedEntries.push([key, candidate.trim()]); }
    });
    const payload: FurnitureAssemblyReturnData = { formState, action: 'schedule-furniture-assembly', timestamp: Date.now() };
    if (sanitizedEntries.length > 0) payload.params = Object.fromEntries(sanitizedEntries);
    setReturnTo(FURNITURE_ASSEMBLY_RETURN_PATH, payload);
  }, [collectFormState, params, setReturnTo]);

  const serviceSubmission = useServiceSubmission({
    user, description, location: locationMgmt.location, locationQuery: locationMgmt.locationQuery,
    priceQuote: priceEstimate.priceQuote, isAuto, isPersonal, isEditing, editServiceId,
    assemblyComplexity, apartmentSize, toolsNeeded, specialRequests,
    showModal, setShowSignInModal, preserveFormForAuth,
    snapshotLocations: locationMgmt.snapshotLocations, restoreLocations: locationMgmt.restoreLocations,
  });

  // Restore after sign-in
  useEffect(() => {
    if (!user) return;
    const returnTo = getReturnTo();
    if (!returnTo || returnTo.path !== FURNITURE_ASSEMBLY_RETURN_PATH || !returnTo.data) return;
    const payload = returnTo.data as FurnitureAssemblyReturnData;
    if (!payload?.formState) { clearReturnTo(); return; }
    restoreFormState(payload.formState);
    clearReturnTo();
    if (payload.action === 'schedule-furniture-assembly') setPendingResumeAction('schedule-furniture-assembly');
  }, [user, getReturnTo, clearReturnTo, restoreFormState]);

  useEffect(() => { if (user) setShowSignInModal(false); }, [user]);

  // Resume scheduling after auth
  useEffect(() => {
    if (!user || pendingResumeAction !== 'schedule-furniture-assembly' || serviceSubmission.isSubmitting) return;
    const timeout = setTimeout(() => { setPendingResumeAction(null); serviceSubmission.handleScheduleHelpr(); }, 0);
    return () => clearTimeout(timeout);
  }, [serviceSubmission.handleScheduleHelpr, serviceSubmission.isSubmitting, pendingResumeAction, user]);

  // Edit prefill
  useEffect(() => {
    if (!editingPayload || !editServiceId) return;
    const nextIsAuto = (editingPayload.autofill_type ?? 'AutoFill').toLowerCase() !== 'custom';
    const nextIsPersonal = (editingPayload.payment_method_type ?? 'Personal').toLowerCase() !== 'business';
    setIsAuto(nextIsAuto); slideAnimation.setValue(nextIsAuto ? 1 : 0);
    setIsPersonal(nextIsPersonal); slideAnimation2.setValue(nextIsPersonal ? 0 : 1);
    if (typeof editingPayload.price === 'number' && Number.isFinite(editingPayload.price)) priceEstimate.setPriceQuote(formatCurrency(editingPayload.price));
    else priceEstimate.setPriceQuote(null);
    if (typeof editingPayload.description === 'string') setDescription(editingPayload.description.trim());
    else setDescription('');
    priceEstimate.setPriceNote(null);
    priceEstimate.setPriceError(null);

    let cancelled = false;
    (async () => {
      const address = editingPayload.location?.trim();
      if (address) {
        const resolved = await locationMgmt.geocodeAddress(address);
        if (cancelled) return;
        if (resolved) locationMgmt.applyLocation(resolved, { showStreetNumberWarning: false });
        else { locationMgmt.setLocationQuery(address); locationMgmt.setLocation(null); }
      } else { locationMgmt.setLocationQuery(''); locationMgmt.setLocation(null); }
    })();
    return () => { cancelled = true; };
  }, [editingPayload, editServiceId, slideAnimation, slideAnimation2]);

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
    } else { voicePulseAnimationRef.current?.stop(); voicePulseValue.setValue(1); }
    return () => { voicePulseAnimationRef.current?.stop(); };
  }, [voiceInput.isRecording, voicePulseValue]);

  // Cleanup on unmount
  useEffect(() => () => {
    voicePulseAnimationRef.current?.stop();
    slideAnimationRef.current?.stop();
    slideAnimation2Ref.current?.stop();
    voiceInput.recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
  }, []);

  // Handlers
  const handleDescriptionChange = useCallback((text: string) => { setDescription(text); priceEstimate.resetPriceState(); }, [priceEstimate]);

  const handleMediaUpload = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { showModal({ title: 'Permission needed', message: 'Enable photo library access to attach images or videos.' }); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsMultipleSelection: false, quality: 0.8 });
      if (result.canceled || !(result.assets && result.assets.length > 0)) return;
      const asset = result.assets[0];
      const type = asset.type === 'video' ? 'video' : 'photo';
      const name = asset.fileName ?? (type === 'video' ? 'video-upload.mp4' : 'photo-upload.jpg');
      setAttachments(prev => [...prev, { uri: asset.uri, type, name }]);
    } catch (error) { console.warn('Media picker error', error); showModal({ title: 'Upload failed', message: 'Unable to select media right now.' }); }
  }, [showModal]);

  const handleDetailsPhotoUpload = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { showModal({ title: 'Permission needed', message: 'Enable photo library access to attach images.' }); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: false, quality: 0.8 });
      if (result.canceled || !(result.assets && result.assets.length > 0)) return;
      const asset = result.assets[0];
      setDetailsPhotos(prev => [...prev, { uri: asset.uri, type: 'photo', name: asset.fileName ?? 'details-photo.jpg' }]);
    } catch (error) { console.warn('Photo picker error', error); showModal({ title: 'Upload failed', message: 'Unable to select photo right now.' }); }
  }, [showModal]);

  const resetFurnitureAssemblyAnalysisFlow = useCallback(() => {
    setShowFurnitureAssemblyAnalysisModal(false);
    setCurrentQuestionStep(0);
    setApartmentSize('');
    setFurnitureScope('');
    setPackingStatus('');
    setNeedsTruck('');
    setBoxesNeeded('');
  }, []);

  const handleAnalysisModalSubmit = useCallback(() => {
    resetFurnitureAssemblyAnalysisFlow();
    furnitureAssemblyAnalysis.handleDescriptionSubmit(priceEstimate.isPriceLoading, voiceInput.isTranscribing);
  }, [resetFurnitureAssemblyAnalysisFlow, furnitureAssemblyAnalysis, priceEstimate.isPriceLoading, voiceInput.isTranscribing]);

  const handleAnalysisModalBack = useCallback(() => {
    if (currentQuestionStep === 0) { resetFurnitureAssemblyAnalysisFlow(); return; }
    setCurrentQuestionStep(prev => Math.max(0, prev - 1));
  }, [currentQuestionStep, resetFurnitureAssemblyAnalysisFlow]);

  const furnitureAssemblyAnalysisData = useMemo(() => {
    const analysis = furnitureAssemblyAnalysis.analyzeFurnitureAssemblyDescription(description);
    const missingInfo: string[] = [];
    if (analysis.missingStreetNumber) missingInfo.push('street number');
    const questionsToShow: Array<{ id: string; title: string; message: string; placeholder: string; multiline?: boolean; options?: string[] }> = [];
    return { ...analysis, missingInfo, questionsToShow };
  }, [furnitureAssemblyAnalysis, description]);

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <MapWithMarker ref={mapRef} location={locationMgmt.location} />
        <View style={styles.contentArea}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Image source={require('../../../assets/icons/backButton.png')} style={styles.backButtonIcon} />
          </Pressable>
          <View style={styles.panel}>
            <FurnitureAssemblyHeader />
            <LocationSection
              locationQuery={locationMgmt.locationQuery}
              suggestions={locationMgmt.suggestions}
              loading={locationMgmt.loading || locationMgmt.currentLocationLoading}
              currentLocationOption={locationMgmt.currentLocationOption}
              isSuggestionsVisible={locationMgmt.isSuggestionsVisible}
              onChangeText={locationMgmt.handleLocationChange}
              onSelectSuggestion={locationMgmt.handleLocationSelect}
              onClear={locationMgmt.handleLocationClear}
              onSuggestionsVisibilityChange={locationMgmt.handleSuggestionsVisibilityChange}
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
                        {priceEstimate.priceNote ? <Text style={styles.PriceOfServiceQuoteNoteText} numberOfLines={2}>{priceEstimate.priceNote}</Text> : null}
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
                placeholder={"Describe your task...                                         (e.g.  'I need my one bedroom apartment complex cleaned.')"}
                multiline
                numberOfLines={4}
                placeholderTextColor="#333333ab"
                value={description}
                onChangeText={handleDescriptionChange}
                onSubmitEditing={() => furnitureAssemblyAnalysis.handleFurnitureAssemblyAnalysisSubmit(priceEstimate.isPriceLoading, voiceInput.isTranscribing)}
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
                  <Text style={styles.attachmentsSummaryText}>{attachments.length} file{attachments.length > 1 ? 's' : ''} attached</Text>
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
                <Text style={[styles.binarySliderLabel, styles.isAutoSliderSubtitle]}>{isAuto ? 'Confirm the first available helpr at this price' : 'Choose from available pros'}</Text>
              </Text>
            </View>

            {/* Personal/Business Toggle */}
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
                  <Text style={[styles.binarySliderLabel, styles.isPersonalSliderSubtitle]}>*Insert Payment Method*</Text>
                </Text>
              </View>
              <View style={styles.pmIconContainer}>
                <Image source={require('../../../assets/icons/PMIcon.png')} style={styles.pmIcon} />
                <Image source={require('../../../assets/icons/ArrowIcon.png')} style={[styles.arrowIcon, { resizeMode: 'contain' }]} />
              </View>
            </View>

            {/* Schedule Button */}
            <View style={styles.bottomRowContainer}>
              <Pressable onPress={serviceSubmission.handleScheduleHelpr} style={styles.scheduleHelprContainer}>
                <Text style={styles.scheduleHelprText}>Schedule Helpr</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Sign-In Required Modal */}
      <Modal visible={showSignInModal} transparent animationType="fade" onRequestClose={() => setShowSignInModal(false)}>
        <View style={styles.signInOverlayBackground}>
          <View style={styles.signInModal}>
            <Text style={styles.signInTitle}>Sign In Required</Text>
            <View style={styles.signInDivider} />
            <Text style={styles.signInMessage}>Please sign in or sign up to schedule a furniture assembly service.</Text>
            <View style={styles.signInButtonsRow}>
              <Pressable style={styles.signInButton} onPress={() => { preserveFormForAuth(); setShowSignInModal(false); router.push('/(auth)/login' as any); }}>
                <Text style={styles.signInButtonText}>Sign In</Text>
              </Pressable>
              <Pressable style={styles.signUpButton} onPress={() => { preserveFormForAuth(); setShowSignInModal(false); router.push('/(auth)/signup' as any); }}>
                <Text style={styles.signUpButtonText}>Sign Up</Text>
              </Pressable>
            </View>
            <Pressable style={styles.cancelButton} onPress={() => setShowSignInModal(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Assembly Complexity Modal */}
      <AssemblyComplexityModal
        visible={showAssemblyComplexityModal}
        assemblyComplexity={assemblyComplexity}
        onSelect={furnitureAssemblyAnalysis.handleAssemblyComplexitySelect}
        onClose={() => setShowAssemblyComplexityModal(false)}
      />

      {/* Apartment Size Modal */}
      <ApartmentSizeModal
        visible={showApartmentSizeModal}
        apartmentSize={apartmentSize}
        onChangeText={setApartmentSize}
        onBack={furnitureAssemblyAnalysis.handleApartmentSizeBack}
        onSubmit={furnitureAssemblyAnalysis.handleApartmentSizeSubmit}
      />

      {/* Tools Needed Modal */}
      <ToolsModal
        visible={showToolsModal}
        toolsNeeded={toolsNeeded}
        onChangeText={setToolsNeeded}
        onBack={furnitureAssemblyAnalysis.handleToolsBack}
        onSubmit={furnitureAssemblyAnalysis.handleToolsSubmit}
      />

      {/* Details and Photos Modal */}
      <DetailsModal
        visible={showDetailsModal}
        specialRequests={specialRequests}
        detailsPhotos={detailsPhotos}
        onChangeText={setSpecialRequests}
        onPhotoUpload={handleDetailsPhotoUpload}
        onBack={furnitureAssemblyAnalysis.handleDetailsBack}
        onSubmit={furnitureAssemblyAnalysis.handleDetailsSubmit}
      />

      {/* Furniture Assembly Analysis Modal (legacy question flow) */}
      <FurnitureAssemblyAnalysisModal
        visible={showFurnitureAssemblyAnalysisModal}
        questionsToShow={furnitureAssemblyAnalysisData.questionsToShow}
        currentQuestionStep={currentQuestionStep}
        needsTruck={needsTruck}
        packingStatus={packingStatus}
        boxesNeeded={boxesNeeded}
        apartmentSize={apartmentSize}
        furnitureScope={furnitureScope}
        onSetNeedsTruck={setNeedsTruck}
        onSetPackingStatus={setPackingStatus}
        onSetBoxesNeeded={setBoxesNeeded}
        onSetApartmentSize={setApartmentSize}
        onSetFurnitureScope={setFurnitureScope}
        onBack={handleAnalysisModalBack}
        onSubmit={handleAnalysisModalSubmit}
        onClose={resetFurnitureAssemblyAnalysisFlow}
      />
    </View>
  );
}
