import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import MapView from 'react-native-maps';

import { PaymentMethodModal } from '../../common/PaymentMethodModal';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { AttachmentThumbnails } from '../AttachmentThumbnails';
import { AttachmentAsset } from '../AttachmentThumbnails/types';
import { BackButton } from '../BackButton';
import { JobDescriptionSection } from '../JobDescriptionSection';
import { PriceDisplay } from '../PriceDisplay';
import { ScheduleButton } from '../ScheduleButton';
import { SignInModal } from '../SignInModal';
import { TogglesSection } from '../TogglesSection';
import { LocationDivider } from './LocationDivider';
import { LocationSection } from './LocationSection';
import { MapWithRoute } from './MapWithRoute';
import { ServiceHeader } from './ServiceHeader';
import { ServiceQuestionsModal } from './ServiceQuestionsModal';
import { styles } from './styles';
import { ServiceComposerConfig, ServiceFormState, ServiceReturnData } from './types';
import { applyAnswersToDescription, useQuestionFlow } from './useQuestionFlow';
import { usePaymentManagement } from './usePaymentManagement';
import { usePlaceLocations } from './usePlaceLocations';
import { usePriceEstimate } from './usePriceEstimate';
import { useServiceSubmission } from './useServiceSubmission';
import { useToggleAnimations } from './useToggleAnimations';
import { useVoiceInput } from './useVoiceInput';
import { cloneAttachments, cloneSelectedLocation } from './utils';

export function ServiceRequestScreen({ config }: { config: ServiceComposerConfig }) {
  const { user, setReturnTo, getReturnTo, clearReturnTo } = useAuth();
  const { showModal } = useModal();
  const params = useLocalSearchParams<{ editServiceId?: string; editService?: string }>();
  const mapRef = useRef<MapView | null>(null);
  const descriptionInputRef = useRef<TextInput | null>(null);

  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<AttachmentAsset[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [forceHideSuggestions, setForceHideSuggestions] = useState(false);
  const [pendingResumeAction, setPendingResumeAction] = useState<string | null>(null);

  const toggles = useToggleAnimations();
  const locationManagement = usePlaceLocations({ showModal, mapRef, mode: config.locationMode });
  const priceEstimate = usePriceEstimate({
    showModal,
    systemPrompt: config.pricingSystemPrompt,
    priceAdjust: config.priceAdjust,
  });
  const paymentManagement = usePaymentManagement({ user, showModal });
  const questionFlow = useQuestionFlow({
    questions: config.questions,
    answers,
    description,
    locationMode: config.locationMode,
    startQuery: locationManagement.startQuery,
    endQuery: locationManagement.endQuery,
    startLocation: locationManagement.startLocation,
    endLocation: locationManagement.endLocation,
    showModal,
  });
  const voiceInput = useVoiceInput({
    setDescription,
    resetPriceState: priceEstimate.resetPriceState,
    showModal,
  });

  const collectFormState = useCallback((): ServiceFormState => ({
    startQuery: locationManagement.startQuery,
    endQuery: locationManagement.endQuery,
    startLocation: cloneSelectedLocation(locationManagement.startLocation),
    endLocation: cloneSelectedLocation(locationManagement.endLocation),
    description,
    isAuto: toggles.isAuto,
    isPersonal: toggles.isPersonal,
    priceQuote: priceEstimate.priceQuote,
    priceNote: priceEstimate.priceNote,
    priceError: priceEstimate.priceError,
    attachments: cloneAttachments(attachments),
    answers: { ...answers },
  }), [
    answers,
    attachments,
    description,
    locationManagement.endLocation,
    locationManagement.endQuery,
    locationManagement.startLocation,
    locationManagement.startQuery,
    priceEstimate.priceError,
    priceEstimate.priceNote,
    priceEstimate.priceQuote,
    toggles.isAuto,
    toggles.isPersonal,
  ]);

  const restoreFormState = useCallback((formState: ServiceFormState) => {
    locationManagement.restoreLocations({
      startQuery: formState.startQuery,
      endQuery: formState.endQuery,
      startLocation: cloneSelectedLocation(formState.startLocation),
      endLocation: cloneSelectedLocation(formState.endLocation),
    });
    setDescription(formState.description ?? '');
    toggles.restoreToggles(Boolean(formState.isAuto), formState.isPersonal !== false);
    priceEstimate.restorePrice({
      priceQuote: formState.priceQuote,
      priceNote: formState.priceNote,
      priceError: formState.priceError,
    });
    setAttachments(cloneAttachments(formState.attachments ?? []));
    setAnswers(formState.answers ?? {});
  }, [locationManagement, priceEstimate, toggles]);

  const preserveFormForAuth = useCallback(() => {
    const sanitizedEntries: Array<[string, string]> = [];
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) sanitizedEntries.push([key, value.trim()]);
    });
    const payload: ServiceReturnData = {
      formState: collectFormState(),
      action: config.scheduleAction,
      timestamp: Date.now(),
    };
    if (sanitizedEntries.length > 0) payload.params = Object.fromEntries(sanitizedEntries);
    setReturnTo(config.returnPath, payload);
  }, [collectFormState, config.returnPath, config.scheduleAction, params, setReturnTo]);

  const serviceSubmission = useServiceSubmission({
    user,
    description,
    locationMode: config.locationMode,
    startLocation: locationManagement.startLocation,
    endLocation: locationManagement.endLocation,
    priceQuote: priceEstimate.priceQuote,
    isAuto: toggles.isAuto,
    isPersonal: toggles.isPersonal,
    serviceType: config.serviceType,
    activePaymentMethod: paymentManagement.activePaymentMethod,
    showModal,
    setShowSignInModal,
    preserveFormForAuth,
    editServiceId: typeof params.editServiceId === 'string' ? params.editServiceId : undefined,
  });

  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    priceEstimate.resetPriceState();
  }, [priceEstimate]);

  const handleDescriptionFocus = useCallback(() => {
    questionFlow.startPromptingFlow();
  }, [questionFlow]);

  const handleModalNext = useCallback(() => {
    const isComplete = questionFlow.handleNext();
    if (!isComplete) return;

    const finalDescription = applyAnswersToDescription(description, config.questions, answers);
    setDescription(finalDescription);
    setTimeout(() => {
      priceEstimate.fetchPrice(finalDescription, {
        start: locationManagement.startLocation,
        end: config.locationMode === 'dual' ? locationManagement.endLocation : locationManagement.startLocation,
        needsTruck: answers.needsTruck === 'yes',
      });
    }, 0);
  }, [
    answers,
    config.locationMode,
    config.questions,
    description,
    locationManagement.endLocation,
    locationManagement.startLocation,
    priceEstimate,
    questionFlow,
  ]);

  useEffect(() => {
    if (user) setShowSignInModal(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const returnTo = getReturnTo();
    if (!returnTo || returnTo.path !== config.returnPath || !returnTo.data) return;
    const payload = returnTo.data as ServiceReturnData;
    if (!payload?.formState) {
      clearReturnTo();
      return;
    }
    restoreFormState(payload.formState);
    clearReturnTo();
    if (payload.action === config.scheduleAction) {
      setPendingResumeAction(config.scheduleAction);
    }
  }, [clearReturnTo, config.returnPath, config.scheduleAction, getReturnTo, restoreFormState, user]);

  useEffect(() => {
    if (!user || pendingResumeAction !== config.scheduleAction || serviceSubmission.isSubmitting) return;
    const timeout = setTimeout(() => {
      setPendingResumeAction(null);
      serviceSubmission.handleSchedule();
    }, 0);
    return () => clearTimeout(timeout);
  }, [config.scheduleAction, pendingResumeAction, serviceSubmission, user]);

  const hasPriceLocations = config.locationMode === 'dual'
    ? Boolean(locationManagement.startLocation && locationManagement.endLocation)
    : Boolean(locationManagement.startLocation);

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
            endLocation={config.locationMode === 'dual' ? locationManagement.endLocation : null}
            routeCoordinates={config.locationMode === 'dual' ? locationManagement.routeCoordinates : []}
          />
          <BackButton />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.contentArea}
          >
            <View style={styles.panel}>
              <View style={styles.panelContent}>
                <View>
                  <ServiceHeader title={config.title} />

                  <LocationSection
                    variant={config.locationMode === 'dual' ? 'start' : 'single'}
                    value={locationManagement.startQuery}
                    placeholder={config.locationMode === 'dual' ? (config.startPlaceholder ?? 'Start Location') : (config.locationPlaceholder ?? 'Location')}
                    onChangeText={locationManagement.handleStartChange}
                    onSelectSuggestion={locationManagement.handleStartSelect}
                    onClear={locationManagement.handleStartClear}
                    suggestions={locationManagement.startSuggestions}
                    loading={locationManagement.startLoading}
                    currentLocationOption={locationManagement.startCurrentLocationOption}
                    forceHideSuggestions={forceHideSuggestions}
                    onFocusInput={() => setForceHideSuggestions(false)}
                  />

                  {config.locationMode === 'dual' && (
                    <>
                      <LocationDivider />
                      <LocationSection
                        variant="end"
                        value={locationManagement.endQuery}
                        placeholder={config.endPlaceholder ?? 'End Location'}
                        onChangeText={locationManagement.handleEndChange}
                        onSelectSuggestion={locationManagement.handleEndSelect}
                        onClear={locationManagement.handleEndClear}
                        suggestions={locationManagement.endSuggestions}
                        loading={locationManagement.endLoading}
                        currentLocationOption={locationManagement.endCurrentLocationOption}
                        forceHideSuggestions={forceHideSuggestions}
                        onFocusInput={() => setForceHideSuggestions(false)}
                      />
                    </>
                  )}

                  <PriceDisplay
                    priceQuote={hasPriceLocations ? priceEstimate.priceQuote : null}
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
                    placeholder={config.descriptionPlaceholder}
                  >
                    {attachments.length > 0 && (
                      <AttachmentThumbnails
                        attachments={attachments}
                        onRemove={idx => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                        onAdd={() => undefined}
                      />
                    )}
                  </JobDescriptionSection>

                  <TogglesSection
                    isAuto={toggles.isAuto}
                    onToggleAuto={toggles.handleAutoToggle}
                    autoAnimation={toggles.slideAnimation}
                    isPersonal={toggles.isPersonal}
                    onTogglePersonal={toggles.handlePersonalToggle}
                    personalAnimation={toggles.slideAnimation2}
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
          onSignIn={preserveFormForAuth}
          onSignUp={preserveFormForAuth}
          title="Sign In Required"
          message={config.signInMessage}
        />

        <ServiceQuestionsModal
          visible={questionFlow.visible}
          questions={config.questions}
          currentQuestionId={questionFlow.currentQuestionId}
          answers={answers}
          onAnswer={(id, value) => setAnswers(prev => ({ ...prev, [id]: value }))}
          attachments={attachments}
          setAttachments={setAttachments}
          onBack={questionFlow.handleBack}
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
