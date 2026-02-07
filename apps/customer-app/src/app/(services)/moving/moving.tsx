import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Platform, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import MapView from 'react-native-maps';

import {
  AttachmentThumbnails,
  BackButton,
  JobDescriptionSection,
  PriceDisplay,
  ScheduleButton,
  SignInModal,
  TogglesSection,
} from '../../../components/services';
import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';

import { PaymentMethodModal } from '../../../components/common/PaymentMethodModal';
import { EndLocationSection } from './EndLocationSection';
import { LocationDivider } from './LocationDivider';
import { MapWithRoute } from './MapWithRoute';
import {
  useLocationManagement,
  useMovingAnalysis,
  usePaymentManagement,
  usePriceEstimate,
  useServiceSubmission,
  useVoiceInput,
} from './moving.hooks';
import { styles } from './moving.styles';
import { MovingModalQuestion } from './moving.types';
import { MovingAnalysisModal } from './MovingAnalysisModal';
import { MovingHeader } from './MovingHeader';
import { StartLocationSection } from './StartLocationSection';

export default function Moving() {
  const { user } = useAuth();
  const { showModal } = useModal();
  const params = useLocalSearchParams<{ editServiceId?: string; editService?: string }>();
  const mapRef = useRef<MapView | null>(null);
  const descriptionInputRef = useRef<TextInput | null>(null);

  // Core form state
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<AttachmentAsset[]>([]);
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Toggle states
  const [isAuto, setIsAuto] = useState(false);
  const [isPersonal, setIsPersonal] = useState(true);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation2 = useRef(new Animated.Value(0)).current;
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const slideAnimation2Ref = useRef<Animated.CompositeAnimation | null>(null);

  // Moving questions modal state
  const [showMovingAnalysisModal, setShowMovingAnalysisModal] = useState(false);
  const [currentModalQuestion, setCurrentModalQuestion] = useState<MovingModalQuestion | null>(null);
  const [apartmentSize, setApartmentSize] = useState('');
  const [packingStatus, setPackingStatus] = useState<'' | 'packed' | 'not-packed'>('');
  const [needsTruck, setNeedsTruck] = useState<'' | 'yes' | 'no'>('');
  const [boxesNeeded, setBoxesNeeded] = useState<'' | 'yes' | 'no'>('');
  const [optionalDetails, setOptionalDetails] = useState('');
  const [promptingCompleted, setPromptingCompleted] = useState(false);
  const [forceHideSuggestions, setForceHideSuggestions] = useState(false);

  // Custom hooks
  const locationManagement = useLocationManagement({ showModal, mapRef });
  const priceEstimate = usePriceEstimate({ showModal });
  const paymentManagement = usePaymentManagement({ user, showModal });
  const movingAnalysis = useMovingAnalysis({
    description,
    startQuery: locationManagement.startQuery,
    endQuery: locationManagement.endQuery,
    startLocation: locationManagement.startLocation,
    endLocation: locationManagement.endLocation,
    apartmentSize,
    packingStatus,
    needsTruck,
    boxesNeeded,
    promptingCompleted,
    setPromptingCompleted,
    setShowMovingAnalysisModal,
    setCurrentModalQuestion,
    showModal,
  });
  const voiceInput = useVoiceInput({
    setDescription,
    resetPriceState: priceEstimate.resetPriceState,
    showModal,
  });
  const serviceSubmission = useServiceSubmission({
    user,
    description,
    startLocation: locationManagement.startLocation,
    endLocation: locationManagement.endLocation,
    priceQuote: priceEstimate.priceQuote,
    isAuto,
    isPersonal,
    activePaymentMethod: paymentManagement.activePaymentMethod,
    showModal,
    setShowSignInModal,
    params,
  });

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

  // Handle description changes
  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    priceEstimate.resetPriceState();
  }, [priceEstimate]);

  // Handle description focus - trigger prompting flow
  const handleDescriptionFocus = useCallback(() => {
    if (promptingCompleted) return;

    if (showMovingAnalysisModal) return;

    movingAnalysis.startPromptingFlow();
  }, [
    promptingCompleted,
    showMovingAnalysisModal,
    movingAnalysis,
  ]);

  // Modal navigation handlers
  const handleModalBack = useCallback(() => {
    if (!currentModalQuestion) return;
    movingAnalysis.handleBack();
  }, [currentModalQuestion, movingAnalysis]);

  const handleModalNext = useCallback(() => {
    if (!currentModalQuestion) return;

    const isComplete = movingAnalysis.handleNext();
    if (isComplete) {
      setShowMovingAnalysisModal(false);
      setCurrentModalQuestion(null);
      setPromptingCompleted(true);

      // Build final description and fetch price
      const finalDescription = movingAnalysis.applyAnswersToDescription(description, {
        apartmentSize,
        packingStatus,
        needsTruck,
        boxesNeeded,
        optionalDetails,
        attachments,
      });
      setDescription(finalDescription);
      
      setTimeout(() => {
        priceEstimate.fetchPrice(finalDescription, {
          start: locationManagement.startLocation,
          end: locationManagement.endLocation,
          needsTruck: needsTruck === 'yes',
        });
      }, 0);
    }
  }, [
    currentModalQuestion,
    movingAnalysis,
    description,
    apartmentSize,
    packingStatus,
    needsTruck,
    boxesNeeded,
    optionalDetails,
    attachments,
    priceEstimate,
    locationManagement.startLocation,
    locationManagement.endLocation,
  ]);

  // Clean up animations on unmount
  useEffect(() => {
    return () => {
      slideAnimationRef.current?.stop();
      slideAnimation2Ref.current?.stop();
    };
  }, []);

  // Close sign-in modal when user logs in
  useEffect(() => {
    if (user) setShowSignInModal(false);
  }, [user]);

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
        <MapWithRoute
          ref={mapRef}
          startLocation={locationManagement.startLocation}
          endLocation={locationManagement.endLocation}
          routeCoordinates={locationManagement.routeCoordinates}
        />
        <BackButton />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.contentArea}
        >
          <View style={styles.panel}>
            <View style={styles.panelContent}>
              <View>
                <MovingHeader />

                <StartLocationSection
                  value={locationManagement.startQuery}
                  onChangeText={locationManagement.handleStartChange}
                  onSelectSuggestion={locationManagement.handleStartSelect}
                  onClear={locationManagement.handleStartClear}
                  suggestions={locationManagement.startSuggestions}
                  loading={locationManagement.startLoading}
                  currentLocationOption={locationManagement.startCurrentLocationOption}
                  forceHideSuggestions={forceHideSuggestions}
                  onFocusInput={() => setForceHideSuggestions(false)}
                />

                <LocationDivider />

                <EndLocationSection
                  value={locationManagement.endQuery}
                  onChangeText={locationManagement.handleEndChange}
                  onSelectSuggestion={locationManagement.handleEndSelect}
                  onClear={locationManagement.handleEndClear}
                  suggestions={locationManagement.endSuggestions}
                  loading={locationManagement.endLoading}
                  currentLocationOption={locationManagement.endCurrentLocationOption}
                  forceHideSuggestions={forceHideSuggestions}
                  onFocusInput={() => setForceHideSuggestions(false)}
                />

                <PriceDisplay
                  priceQuote={locationManagement.startLocation && locationManagement.endLocation ? priceEstimate.priceQuote : null}
                  priceNote={priceEstimate.priceNote}
                  priceError={priceEstimate.priceError}
                  isLoading={priceEstimate.isPriceLoading}
                />

                <JobDescriptionSection
                  ref={descriptionInputRef}
                  value={description}
                  onChangeText={handleDescriptionChange}
                  onFocus={handleDescriptionFocus}
                  editable={!voiceInput.isTranscribing}
                >
                  {attachments.length > 0 && (
                    <AttachmentThumbnails
                      attachments={attachments}
                      onRemove={(idx) => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                      onAdd={movingAnalysis.handleUploadPhotos}
                    />
                  )}
                </JobDescriptionSection>

                <TogglesSection
                  isAuto={isAuto}
                  onToggleAuto={handleAutoToggle}
                  autoAnimation={slideAnimation}
                  isPersonal={isPersonal}
                  onTogglePersonal={handlePersonalToggle}
                  personalAnimation={slideAnimation2}
                  activePaymentMethod={
                    paymentManagement.activePaymentMethod
                      ? {
                          brand: paymentManagement.activePaymentMethod.brand,
                          last4: paymentManagement.activePaymentMethod.last4,
                        }
                      : null
                  }
                  onPaymentMethodPress={paymentManagement.openPaymentModal}
                />
              </View>

              <ScheduleButton
                onPress={serviceSubmission.handleSchedule}
                loading={serviceSubmission.isSubmitting}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      <SignInModal
        visible={showSignInModal}
        onClose={() => setShowSignInModal(false)}
        onSignIn={serviceSubmission.preserveFormForAuth}
        onSignUp={serviceSubmission.preserveFormForAuth}
        title="Sign In Required"
        message="Please sign in or sign up to schedule a moving service."
      />

      <MovingAnalysisModal
        visible={showMovingAnalysisModal}
        currentQuestion={currentModalQuestion}
        apartmentSize={apartmentSize}
        setApartmentSize={setApartmentSize}
        packingStatus={packingStatus}
        setPackingStatus={setPackingStatus}
        needsTruck={needsTruck}
        setNeedsTruck={setNeedsTruck}
        boxesNeeded={boxesNeeded}
        setBoxesNeeded={setBoxesNeeded}
        optionalDetails={optionalDetails}
        setOptionalDetails={setOptionalDetails}
        attachments={attachments}
        setAttachments={setAttachments}
        onBack={handleModalBack}
        onNext={handleModalNext}
        showModal={showModal}
      />

      <PaymentMethodModal
        visible={paymentManagement.paymentModalVisible}
        onClose={paymentManagement.closePaymentModal}
        savedPaymentMethods={paymentManagement.savedPaymentMethods}
        activePaymentMethodId={paymentManagement.activePaymentMethodId}
        onSelectPaymentMethod={paymentManagement.handleSelectPaymentMethod}
        showAddForm={paymentManagement.showAddPaymentForm}
        setShowAddForm={paymentManagement.setShowAddPaymentForm}
        cardComplete={paymentManagement.cardComplete}
        setCardComplete={paymentManagement.setCardComplete}
        setCardDetailsSnapshot={paymentManagement.setCardDetailsSnapshot}
        onSavePaymentMethod={paymentManagement.handleSavePaymentMethod}
        loading={paymentManagement.loadingPaymentMethods}
        saving={paymentManagement.savingPaymentMethod}
        showModal={showModal}
      />
    </View>
    </TouchableWithoutFeedback>
  );
}
