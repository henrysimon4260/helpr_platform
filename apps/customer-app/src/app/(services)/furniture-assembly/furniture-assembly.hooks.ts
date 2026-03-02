import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { PermissionStatus } from 'expo-modules-core';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import MapView from 'react-native-maps';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { CurrentLocationOption, PlaceSuggestion } from '../../../components/services/LocationAutocompleteInput';
import { supabase } from '../../../lib/supabase';

import { EditServicePayload, FurnitureAssemblyFormState, FurnitureAssemblyReturnData, SelectedLocation } from './furniture-assembly.types';
import {
  cloneAttachments,
  cloneSelectedLocation,
  containsStreetNumber,
  createSessionToken,
  createUuid,
  formatCurrency,
  FURNITURE_ASSEMBLY_RETURN_PATH,
  isWithinServiceArea,
  resolveGooglePlacesKey,
  resolveOpenAIApiKey,
} from './furniture-assembly.utils';

// =============================================================================
// useLocationManagement — single location (furniture assembly / cleaning style)
// =============================================================================
interface LocationManagementProps {
  showModal: (config: { title: string; message: string }) => void;
  mapRef: React.RefObject<MapView | null>;
}

export function useLocationManagement({ showModal, mapRef }: LocationManagementProps) {
  const googlePlacesApiKey = useMemo(resolveGooglePlacesKey, []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sessionToken, setSessionToken] = useState(createSessionToken);
  const [locationQuery, setLocationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionStatus>(PermissionStatus.UNDETERMINED);
  const [currentLocation, setCurrentLocation] = useState<SelectedLocation | null>(null);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);

  const locationSnapshotRef = useRef<{ locationQuery: string; location: SelectedLocation | null } | null>(null);

  const mapEdgePadding = useMemo(() => ({ top: 60, right: 36, bottom: 220, left: 36 }), []);
  const defaultRegion = useMemo(() => ({ latitude: 40.7128, longitude: -74.006, latitudeDelta: 0.08, longitudeDelta: 0.08 }), []);

  const formatLocationDescription = useCallback((address?: Location.LocationGeocodedAddress) => {
    if (!address) return undefined;
    const streetLine = address.name || [address.streetNumber, address.street].filter(Boolean).join(' ').trim() || address.street || undefined;
    const locality = address.city || address.subregion || undefined;
    const region = address.region || undefined;
    const parts = [streetLine, locality, region].filter(Boolean) as string[];
    if (address.postalCode && !parts.includes(address.postalCode)) parts.push(address.postalCode);
    if (address.country && !parts.includes(address.country)) parts.push(address.country);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }, []);

  const loadCurrentLocation = useCallback(async (options: { silent?: boolean } = {}): Promise<SelectedLocation | null> => {
    const { silent } = options;
    if (!silent) setCurrentLocationLoading(true);

    try {
      let status = locationPermissionStatus;
      const foregroundPermission = await Location.getForegroundPermissionsAsync();
      status = foregroundPermission.status;
      setLocationPermissionStatus(foregroundPermission.status);

      if (status !== PermissionStatus.GRANTED) {
        const permission = await Location.requestForegroundPermissionsAsync();
        status = permission.status;
        setLocationPermissionStatus(permission.status);
        if (permission.status !== PermissionStatus.GRANTED) return null;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Balanced });
      const [address] = await Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      const description = formatLocationDescription(address) ?? `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;

      const resolved: SelectedLocation = { description, coordinate: { latitude: position.coords.latitude, longitude: position.coords.longitude } };
      setCurrentLocation(resolved);
      return resolved;
    } catch (error) {
      console.warn('Unable to retrieve current location', error);
      return null;
    } finally {
      if (!silent) setCurrentLocationLoading(false);
    }
  }, [formatLocationDescription, locationPermissionStatus]);

  const resetPriceStateRef = useRef<(() => void) | null>(null);

  const applyLocation = useCallback((loc: SelectedLocation, options: { showStreetNumberWarning?: boolean } = {}) => {
    if (!isWithinServiceArea(loc.coordinate)) {
      showModal({
        title: 'Outside of Service Area',
        message: "Helpr currently serves NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick an address in these areas if you wish to continue.",
      });
      return;
    }

    resetPriceStateRef.current?.();

    const shouldWarn = options.showStreetNumberWarning ?? true;
    const hasStreetNumber = containsStreetNumber(loc.description);

    setLocationQuery(loc.description);
    setLocation(loc);
    setSuggestions([]);
    setSessionToken(createSessionToken());
    setLoading(false);

    if (shouldWarn && !hasStreetNumber) {
      showModal({ title: 'Add street number to location', message: 'Update your location to include the street number.' });
    }
  }, [showModal]);

  const geocodeAddress = useCallback(async (address: string): Promise<SelectedLocation | null> => {
    const trimmed = address?.trim();
    if (!trimmed) return null;
    try {
      const results = await Location.geocodeAsync(trimmed);
      const first = results?.[0];
      if (first) return { description: trimmed, coordinate: { latitude: first.latitude, longitude: first.longitude } };
    } catch (error) {
      console.warn('Failed to geocode address for edit prefill:', error);
    }
    return null;
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    const existingLocation = locationPermissionStatus === PermissionStatus.GRANTED && currentLocation ? currentLocation : null;
    if (existingLocation && !currentLocationLoading) {
      applyLocation(existingLocation);
      return;
    }
    const resolved = await loadCurrentLocation();
    if (resolved) applyLocation(resolved);
  }, [applyLocation, currentLocation, currentLocationLoading, loadCurrentLocation, locationPermissionStatus]);

  const fetchPredictions = useCallback(async (
    input: string,
    token: string,
    setSugg: React.Dispatch<React.SetStateAction<PlaceSuggestion[]>>,
    setLoad: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    if (!googlePlacesApiKey) { setSugg([]); return; }
    setLoad(true);
    try {
      const params = new URLSearchParams({ input, key: googlePlacesApiKey, sessiontoken: token, components: 'country:us' });
      const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
      const data = await response.json();
      if (data.status === 'OK') {
        const parsed: PlaceSuggestion[] = (data.predictions ?? []).map((p: any) => ({
          id: p.place_id, placeId: p.place_id,
          primaryText: p.structured_formatting?.main_text ?? p.description ?? 'Unknown location',
          secondaryText: p.structured_formatting?.secondary_text, description: p.description ?? '',
        }));
        setSugg(parsed);
      } else { setSugg([]); }
    } catch { setSugg([]); } finally { setLoad(false); }
  }, [googlePlacesApiKey]);

  const fetchPlaceDetails = useCallback(async (placeId: string, token: string): Promise<SelectedLocation | null> => {
    if (!googlePlacesApiKey) return null;
    try {
      const params = new URLSearchParams({ place_id: placeId, key: googlePlacesApiKey, sessiontoken: token, fields: 'formatted_address,geometry/location' });
      const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
      const data = await response.json();
      if (data.status === 'OK') {
        const loc = data.result.geometry?.location;
        if (loc) return { description: data.result.formatted_address ?? '', coordinate: { latitude: loc.lat, longitude: loc.lng } };
      }
      return null;
    } catch { return null; }
  }, [googlePlacesApiKey]);

  const handleLocationChange = useCallback((text: string) => {
    setLocationQuery(text);
    setLocation(null);
    resetPriceStateRef.current?.();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => { fetchPredictions(trimmed, sessionToken, setSuggestions, setLoading); }, 350);
  }, [fetchPredictions, sessionToken]);

  const handleLocationSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    if (!suggestion.placeId) return;
    setLoading(true);
    const details = await fetchPlaceDetails(suggestion.placeId, sessionToken);
    setLoading(false);
    if (details) applyLocation({ description: details.description || suggestion.description, coordinate: details.coordinate });
  }, [applyLocation, fetchPlaceDetails, sessionToken]);

  const handleLocationClear = useCallback(() => {
    setLocationQuery('');
    setSuggestions([]);
    setLocation(null);
    setSessionToken(createSessionToken());
    resetPriceStateRef.current?.();
  }, []);

  const handleSuggestionsVisibilityChange = useCallback((visible: boolean) => { setIsSuggestionsVisible(visible); }, []);

  const currentLocationSecondaryText = useMemo(() => {
    if (currentLocation) return currentLocation.description;
    if (locationPermissionStatus === PermissionStatus.DENIED) return 'Enable location access in Settings to use this option.';
    return "Fill with your device's current GPS position.";
  }, [currentLocation, locationPermissionStatus]);

  const currentLocationOption = useMemo<CurrentLocationOption>(() => ({
    id: 'current-location',
    primaryText: 'Current Location',
    secondaryText: currentLocationSecondaryText,
    onSelect: () => handleUseCurrentLocation(),
    loading: currentLocationLoading,
    disabled: currentLocationLoading,
  }), [currentLocationLoading, currentLocationSecondaryText, handleUseCurrentLocation]);

  const snapshotLocations = useCallback(() => { locationSnapshotRef.current = { locationQuery, location }; }, [location, locationQuery]);
  const restoreLocations = useCallback(() => {
    const snapshot = locationSnapshotRef.current;
    if (!snapshot) return;
    setLocationQuery(snapshot.locationQuery);
    setLocation(snapshot.location);
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!isMounted) return;
        setLocationPermissionStatus(status);
        if (status === PermissionStatus.GRANTED) await loadCurrentLocation({ silent: true });
      } catch (error) { if (isMounted) console.warn('Failed to check location permissions', error); }
    })();
    return () => { isMounted = false; };
  }, [loadCurrentLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;
    map.animateToRegion({ latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 300);
  }, [location, mapEdgePadding, mapRef]);

  return {
    locationQuery, location, suggestions, loading, isSuggestionsVisible,
    currentLocationOption, currentLocationLoading,
    defaultRegion, mapEdgePadding,
    setLocationQuery, setLocation,
    handleLocationChange, handleLocationSelect, handleLocationClear,
    handleSuggestionsVisibilityChange, handleUseCurrentLocation,
    applyLocation, geocodeAddress,
    snapshotLocations, restoreLocations,
    resetPriceStateRef,
  };
}

// =============================================================================
// usePriceEstimate — furniture assembly pricing
// =============================================================================
interface PriceEstimateProps {
  showModal: (config: { title: string; message: string }) => void;
}

export function usePriceEstimate({ showModal }: PriceEstimateProps) {
  const openAiApiKey = useMemo(resolveOpenAIApiKey, []);
  const [priceQuote, setPriceQuote] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  const resetPriceState = useCallback(() => {
    setPriceQuote(null);
    setPriceNote(null);
    setPriceError(null);
    setIsPriceLoading(false);
  }, []);

  const fetchPriceEstimate = useCallback(async (
    taskDescription: string,
    options: { start?: SelectedLocation | null; end?: SelectedLocation | null } = {},
  ) => {
    const { start, end } = options;
    setIsPriceLoading(true);
    setPriceQuote(null);
    setPriceNote(null);
    setPriceError(null);

    if (!openAiApiKey) { setIsPriceLoading(false); setPriceError('Price estimate unavailable (missing OpenAI key).'); return; }

    try {
      const startDetails = start ? `${start.description} (lat ${start.coordinate.latitude.toFixed(4)}, lng ${start.coordinate.longitude.toFixed(4)})` : 'not provided';
      const endDetails = end ? `${end.description} (lat ${end.coordinate.latitude.toFixed(4)}, lng ${end.coordinate.longitude.toFixed(4)})` : 'not provided';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are a pricing assistant for furniture assembly services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) complexity of assembly (simple/moderate/complex), number of furniture pieces, 2) types of furniture items to assemble, 3) number and size of furniture pieces. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (30-300 range). IMPORTANT: Scale prices based on item complexity and quantity - Small item (chair, small table): $30-60 (simple) / $60-100 (complex), Medium item (desk, bookshelf): $50-90 (simple) / $90-150 (complex), Large item (bed frame, wardrobe): $80-130 (simple) / $130-200 (complex), Multiple items or very large (entertainment center, sectional): $120-180 (simple) / $180-300 (complex). Always increase price proportionally with more items and complexity. Provide competitive, budget-friendly estimates.',
            },
            {
              role: 'user',
              content: [`Task description: ${taskDescription}`, `Start location: ${startDetails}`, `End location: ${endDetails}`].join('\n'),
            },
          ],
        }),
      });

      if (!response.ok) { const errorText = await response.text(); throw new Error(errorText || 'Failed to fetch price estimate'); }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Missing completion content');

      const parsed = JSON.parse(content);

      if (parsed.safety_concern === true && parsed.safety_message) {
        showModal({ title: 'Safety Concern', message: parsed.safety_message });
        setPriceError('This request may not be suitable for our platform.');
        return;
      }

      if (parsed.needs_clarification === true && parsed.clarification_prompt) {
        setPriceError('Please select an assembly complexity.');
        return { needsClarification: true };
      }

      const price = Number(parsed.price);
      if (!Number.isFinite(price)) throw new Error('Invalid price value');

      const discountedPrice = price * 0.85;
      const sanitizedPrice = Math.max(0, Math.round(discountedPrice));
      setPriceQuote(formatCurrency(sanitizedPrice));
    } catch (error) {
      console.warn('Failed to fetch price estimate', error);
      setPriceError('Unable to estimate price right now.');
    } finally {
      setIsPriceLoading(false);
    }
    return undefined;
  }, [openAiApiKey, showModal]);

  return { priceQuote, priceNote, priceError, isPriceLoading, resetPriceState, fetchPriceEstimate, setPriceQuote, setPriceNote, setPriceError };
}

// =============================================================================
// useVoiceInput — handles voice recording & transcription
// =============================================================================
interface VoiceInputProps {
  setDescription: React.Dispatch<React.SetStateAction<string>>;
  resetPriceState: () => void;
  showModal: (config: { title: string; message: string }) => void;
}

export function useVoiceInput({ setDescription, resetPriceState, showModal }: VoiceInputProps) {
  const openAiApiKey = useMemo(resolveOpenAIApiKey, []);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const transcribeAudio = useCallback(async (uri: string) => {
    if (!openAiApiKey) { showModal({ title: 'Missing API key', message: 'Add an OpenAI API key to enable voice mode.' }); return ''; }
    try {
      const formData = new FormData();
      formData.append('file', { uri, name: 'voice-input.m4a', type: Platform.select({ ios: 'audio/m4a', android: 'audio/mpeg', default: 'audio/m4a' }) } as any);
      formData.append('model', 'gpt-4o-mini-transcribe');
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${openAiApiKey}` }, body: formData });
      if (!response.ok) throw new Error('Transcription failed');
      const data = await response.json();
      return typeof data?.text === 'string' ? data.text.trim() : '';
    } catch { showModal({ title: 'Transcription failed', message: 'Unable to transcribe your recording.' }); return ''; }
    finally { FileSystem.deleteAsync(uri).catch(() => undefined); }
  }, [openAiApiKey, showModal]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) { setIsRecording(false); return; }
    try { await recording.stopAndUnloadAsync(); } catch {}
    setIsRecording(false);
    const uri = recording.getURI();
    recordingRef.current = null;
    if (!uri) return;
    setIsTranscribing(true);
    try {
      const transcript = await transcribeAudio(uri);
      if (transcript) {
        resetPriceState();
        setDescription(prev => { const trimmed = prev.trim(); return trimmed.length > 0 ? `${trimmed} ${transcript}` : transcript; });
      }
    } finally { setIsTranscribing(false); }
  }, [resetPriceState, setDescription, transcribeAudio]);

  const handleVoicePress = useCallback(async () => {
    if (isTranscribing) return;
    if (isRecording) { await stopRecordingAndTranscribe(); return; }
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') { showModal({ title: 'Microphone needed', message: 'Enable microphone access to record your request.' }); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch { showModal({ title: 'Recording failed', message: 'Unable to start voice mode.' }); }
  }, [isRecording, isTranscribing, showModal, stopRecordingAndTranscribe]);

  useEffect(() => { return () => { recordingRef.current?.stopAndUnloadAsync().catch(() => undefined); }; }, []);

  return { isRecording, isTranscribing, handleVoicePress, recordingRef };
}

// =============================================================================
// useServiceSubmission — handles schedule & edit logic
// =============================================================================
interface ServiceSubmissionProps {
  user: any;
  description: string;
  location: SelectedLocation | null;
  locationQuery: string;
  priceQuote: string | null;
  isAuto: boolean;
  isPersonal: boolean;
  isEditing: boolean;
  editServiceId: string | null;
  assemblyComplexity: '' | 'simple' | 'complex';
  apartmentSize: string;
  toolsNeeded: string;
  specialRequests: string;
  showModal: (config: { title: string; message: string; onDismiss?: () => void }) => void;
  setShowSignInModal: (v: boolean) => void;
  preserveFormForAuth: () => void;
  snapshotLocations: () => void;
  restoreLocations: () => void;
}

export function useServiceSubmission({
  user, description, location, locationQuery, priceQuote, isAuto, isPersonal,
  isEditing, editServiceId, assemblyComplexity, apartmentSize, toolsNeeded, specialRequests,
  showModal, setShowSignInModal, preserveFormForAuth, snapshotLocations, restoreLocations,
}: ServiceSubmissionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLookupError, setCustomerLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) { setCustomerId(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from('customer').select('customer_id').eq('email', user.email).maybeSingle();
        if (cancelled) return;
        if (error) { console.error('Failed to load customer profile:', error); setCustomerLookupError(error.message); setCustomerId(null); return; }
        setCustomerId(data?.customer_id ?? null);
        setCustomerLookupError(null);
      } catch (error) {
        if (!cancelled) { console.error('Unexpected error loading customer profile:', error); setCustomerLookupError('Unable to load customer profile.'); setCustomerId(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  const resolveCustomerId = useCallback(async () => {
    if (customerId) return customerId;
    if (!user?.email) return null;
    try {
      const { data, error } = await supabase.from('customer').select('customer_id').eq('email', user.email).maybeSingle();
      if (error) { console.error('Failed to resolve customer id:', error); setCustomerLookupError(error.message); return null; }
      if (data?.customer_id) { setCustomerId(data.customer_id); setCustomerLookupError(null); return data.customer_id; }
      return null;
    } catch (error) { console.error('Unexpected error resolving customer id:', error); setCustomerLookupError('Unable to resolve customer id'); return null; }
  }, [customerId, user?.email]);

  const handleScheduleHelpr = useCallback(async () => {
    if (isSubmitting) return;

    const trimmedDescription = description.trim();
    if (trimmedDescription.length === 0) {
      snapshotLocations();
      showModal({ title: 'Add a description', message: 'Please describe what you need help with before scheduling your furniture assembly service.', onDismiss: restoreLocations });
      return;
    }

    if (!location) { showModal({ title: 'Add location', message: 'Please provide a location before scheduling.' }); return; }
    if (!isWithinServiceArea(location.coordinate)) {
      showModal({ title: "We're not in your area yet.", message: "Helpr currently operates in NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick an address within this area to continue." });
      return;
    }

    const priceDigitsRaw = priceQuote?.replace(/[^0-9.]/g, '') ?? '';
    const priceValue = priceDigitsRaw.length > 0 ? Number(priceDigitsRaw) : null;
    const sanitizedPrice = Number.isFinite(priceValue ?? NaN) ? priceValue : null;
    if (sanitizedPrice === null) { showModal({ title: 'Estimate needed', message: 'Request a quick price estimate before scheduling your furniture assembly service.' }); return; }
    if (!containsStreetNumber(location.description)) { showModal({ title: 'Add street number', message: 'Update your location to include the street number before scheduling.' }); return; }
    if (!user) { preserveFormForAuth(); setShowSignInModal(true); return; }

    if (isEditing && !editServiceId) { showModal({ title: 'Unable to edit', message: 'We could not determine which service to update.' }); return; }
    if (!isEditing && customerLookupError) console.warn('Retrying customer lookup after previous error:', customerLookupError);

    let resolvedCustomerIdValue = customerId;
    if (!isEditing) {
      const resolved = await resolveCustomerId();
      if (!resolved) { showModal({ title: 'Account issue', message: 'We could not find your customer profile. Please try again.' }); return; }
      resolvedCustomerIdValue = resolved;
    }

    const assemblyComplexityText = assemblyComplexity === 'simple' ? 'Simple assembly' : assemblyComplexity === 'complex' ? 'Complex assembly' : '';
    const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
    const toolsInfo = toolsNeeded ? `. Tools to bring: ${toolsNeeded}` : '';
    const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';
    const normalizedDescription = `${trimmedDescription}${assemblyComplexityText ? `. Type: ${assemblyComplexityText}` : ''}${sizeInfo}${toolsInfo}${requestsInfo}`;

    const paymentMethodType = isPersonal ? 'Personal' : 'Business';
    const autofillType = isAuto ? 'AutoFill' : 'Custom';
    const targetServiceId = isEditing && editServiceId ? editServiceId : createUuid();

    try {
      setIsSubmitting(true);

      if (isEditing && editServiceId) {
        const updatePayload: Record<string, unknown> = { location: location.description, price: sanitizedPrice, payment_method_type: paymentMethodType, autofill_type: autofillType, description: normalizedDescription };
        const { error } = await supabase.from('service').update(updatePayload).eq('service_id', editServiceId);
        if (error) { console.error('Failed to update furniture assembly service:', error); showModal({ title: 'Update failed', message: 'Unable to save changes to your furniture assembly request. Please try again.' }); return; }
        router.push({ pathname: '/(booking-flow)/booked-services' as any, params: { serviceId: editServiceId } });
        return;
      }

      if (!resolvedCustomerIdValue) { showModal({ title: 'Account issue', message: 'We could not find your customer profile. Please try again.' }); return; }

      const payload = {
        service_id: targetServiceId, customer_id: resolvedCustomerIdValue,
        date_of_creation: new Date().toISOString(), service_type: 'furniture-assembly',
        status: 'finding_pros', scheduling_type: null, location: location.description,
        price: sanitizedPrice, start_datetime: null, end_datetime: null,
        payment_method_type: paymentMethodType, autofill_type: autofillType,
        service_provider_id: null, scheduled_date_time: null, description: normalizedDescription,
      };

      router.push({ pathname: '/(booking-flow)/booked-services' as any, params: { showOverlay: 'true', temporaryService: encodeURIComponent(JSON.stringify(payload)) } });
    } catch (error) {
      console.error('Unexpected scheduling error:', error);
      showModal({ title: 'Scheduling failed', message: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, description, location, priceQuote, user, isEditing, editServiceId,
    customerId, customerLookupError, assemblyComplexity, apartmentSize, toolsNeeded,
    specialRequests, isPersonal, isAuto, showModal, setShowSignInModal,
    preserveFormForAuth, snapshotLocations, restoreLocations, resolveCustomerId,
  ]);

  return { isSubmitting, handleScheduleHelpr, customerId, customerLookupError };
}

// =============================================================================
// useFurnitureAssemblyAnalysis — modal flow for assembly details
// =============================================================================
interface FurnitureAssemblyAnalysisProps {
  description: string;
  location: SelectedLocation | null;
  locationQuery: string;
  assemblyComplexity: '' | 'simple' | 'complex';
  apartmentSize: string;
  toolsNeeded: string;
  specialRequests: string;
  showModal: (config: { title: string; message: string }) => void;
  setAssemblyComplexity: (v: '' | 'simple' | 'complex') => void;
  setApartmentSize: (v: string) => void;
  setToolsNeeded: (v: string) => void;
  setSpecialRequests: (v: string) => void;
  setDescription: (v: string) => void;
  setShowAssemblyComplexityModal: (v: boolean) => void;
  setShowApartmentSizeModal: (v: boolean) => void;
  setShowToolsModal: (v: boolean) => void;
  setShowDetailsModal: (v: boolean) => void;
  fetchPriceEstimate: (desc: string, options: { start?: SelectedLocation | null; end?: SelectedLocation | null }) => void;
}

export function useFurnitureAssemblyAnalysis({
  description, location, locationQuery,
  assemblyComplexity, apartmentSize, toolsNeeded, specialRequests,
  showModal, setAssemblyComplexity, setApartmentSize, setToolsNeeded, setSpecialRequests,
  setDescription, setShowAssemblyComplexityModal, setShowApartmentSizeModal,
  setShowToolsModal, setShowDetailsModal, fetchPriceEstimate,
}: FurnitureAssemblyAnalysisProps) {
  const lastEnhancedDescriptionRef = useRef<string | null>(null);

  const checkIfDescriptionAlreadyEnhanced = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    const hasTypeInfo = /\.\s*type:\s*(simple|complex)\s*cleaning/i.test(lowerText);
    const hasSizeInfo = /\.\s*number and size of furniture pieces:/i.test(lowerText);
    const hasToolsInfo = /\.\s*tools to bring:/i.test(lowerText);
    return hasTypeInfo || hasSizeInfo || hasToolsInfo;
  }, []);

  const checkForPropertySize = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    const hasSqFt = /\b\d+\s*(sq\s*ft|square\s*feet|sqft|sf)\b/i.test(lowerText);
    const hasRoomCount = /\b\d+[\s-]*(bedroom|bed|br|bathroom|bath|ba|room)\b/i.test(lowerText);
    const hasPropertyDesc = /\b(studio|apartment|condo|house|office|townhouse|loft)\b/i.test(lowerText);
    const hasSizeDesc = /\b(small|medium|large|tiny|huge|spacious|compact)\s*(apartment|house|office|space|property|home|room)\b/i.test(lowerText);
    return hasSqFt || hasRoomCount || (hasPropertyDesc && (hasSizeDesc || hasRoomCount));
  }, []);

  const analyzeFurnitureAssemblyDescription = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    const spelledOutBedroomPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple)\s*(?:-|\s)?\s*(bedroom|bed|br|room|apt|apartment)s?\b/;
    const hasApartmentSize = /\b(\d+)\s*(bedroom|br|room|apt|apartment)\b/i.test(lowerText) || /\b(studio|1br|2br|3br|4br|5br)\b/i.test(lowerText) || spelledOutBedroomPattern.test(lowerText);
    const hasPackingStatus = /\b(pack|packed|packing|unpack|unpacked|unpacking)\b/i.test(lowerText);
    const hasTruckInfo = /\b(truck|cleaning truck|rental truck|vehicle|car|van)\b/i.test(lowerText);
    const hasBoxInfo = /\b(box|boxes|packing tools|tools)\b/i.test(lowerText);
    const hasFurnitureScope = /\b(everything|entire|whole|all|complete)\b/i.test(lowerText) || /\b(furniture|bedroom|living room|kitchen|dining room|office)\b/i.test(lowerText) || /\b(specific pieces|pieces|items|only)\b/i.test(lowerText) || /\b(cleaning scope|scope)\b/i.test(lowerText);
    const descriptionHasStreetNumber = containsStreetNumber(text);
    const addressCandidates = [locationQuery, location?.description];
    const hasStreetNumber = addressCandidates.some(c => containsStreetNumber(c));
    const hasInput = addressCandidates.some(c => typeof c === 'string' && c.trim().length > 0);
    const missingStreetNumber = hasInput && !hasStreetNumber;

    return {
      hasApartmentSize, hasPackingStatus, hasTruckInfo, hasBoxInfo, hasFurnitureScope,
      hasStreetNumber: hasStreetNumber || (!hasInput && descriptionHasStreetNumber), missingStreetNumber,
      isPacked: hasPackingStatus && /\b(packed|packing)\b/i.test(lowerText),
    };
  }, [location?.description, locationQuery]);

  const handleDescriptionSubmit = useCallback((isPriceLoading: boolean, isTranscribing: boolean) => {
    if (isPriceLoading || isTranscribing) return;
    const trimmed = description.trim();
    if (trimmed.length === 0) return;
    if (!location) { showModal({ title: 'Missing location', message: 'Please enter a location.' }); return; }
    Keyboard.dismiss();

    if (assemblyComplexity) {
      if (checkForPropertySize(description) || apartmentSize) {
        if (toolsNeeded) {
          const baseDesc = description.replace(/\.\s*Type:\s*(Basic|Deep)\s*cleaning/gi, '').replace(/\.\s*Property size:\s*[^.]+/gi, '').replace(/\.\s*Tools to bring:\s*[^.]+/gi, '').replace(/\.\s*Special requests:\s*[^.]+/gi, '').trim();
          const typeText = assemblyComplexity === 'simple' ? 'Simple assembly' : assemblyComplexity === 'complex' ? 'Complex assembly' : '';
          const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
          const toolsInfo = toolsNeeded ? `. Tools to bring: ${toolsNeeded}` : '';
          const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';
          const rebuiltDescription = `${baseDesc}${typeText ? `. Type: ${typeText}` : ''}${sizeInfo}${toolsInfo}${requestsInfo}`;
          if (rebuiltDescription !== description) setDescription(rebuiltDescription);
          fetchPriceEstimate(rebuiltDescription, { start: location, end: location });
        } else { setShowToolsModal(true); }
      } else { setShowApartmentSizeModal(true); }
    } else { setShowAssemblyComplexityModal(true); }
  }, [description, location, assemblyComplexity, apartmentSize, toolsNeeded, specialRequests, checkForPropertySize, setDescription, fetchPriceEstimate, showModal, setShowAssemblyComplexityModal, setShowApartmentSizeModal, setShowToolsModal]);

  const handleFurnitureAssemblyAnalysisSubmit = useCallback((isPriceLoading: boolean, isTranscribing: boolean) => {
    const analysis = analyzeFurnitureAssemblyDescription(description);
    if (!analysis.hasStreetNumber) { showModal({ title: 'Add street number', message: 'Update your location to include the street number so your helpr can find you.' }); return; }
    handleDescriptionSubmit(isPriceLoading, isTranscribing);
  }, [analyzeFurnitureAssemblyDescription, description, handleDescriptionSubmit, showModal]);

  const handleAssemblyComplexitySelect = useCallback((type: 'simple' | 'complex') => {
    setAssemblyComplexity(type);
    setShowAssemblyComplexityModal(false);
    if (checkForPropertySize(description)) { setShowToolsModal(true); }
    else { setShowApartmentSizeModal(true); }
  }, [description, checkForPropertySize, setAssemblyComplexity, setShowAssemblyComplexityModal, setShowToolsModal, setShowApartmentSizeModal]);

  const handleApartmentSizeBack = useCallback(() => { setShowApartmentSizeModal(false); setShowAssemblyComplexityModal(true); }, [setShowApartmentSizeModal, setShowAssemblyComplexityModal]);
  const handleApartmentSizeSubmit = useCallback(() => { if (!apartmentSize.trim()) return; setShowApartmentSizeModal(false); setShowToolsModal(true); }, [apartmentSize, setShowApartmentSizeModal, setShowToolsModal]);

  const handleToolsBack = useCallback(() => {
    setShowToolsModal(false);
    if (checkForPropertySize(description)) setShowAssemblyComplexityModal(true);
    else setShowApartmentSizeModal(true);
  }, [description, checkForPropertySize, setShowToolsModal, setShowAssemblyComplexityModal, setShowApartmentSizeModal]);
  const handleToolsSubmit = useCallback(() => { setShowToolsModal(false); setShowDetailsModal(true); }, [setShowToolsModal, setShowDetailsModal]);

  const handleDetailsBack = useCallback(() => { setShowDetailsModal(false); setShowToolsModal(true); }, [setShowDetailsModal, setShowToolsModal]);
  const handleDetailsSubmit = useCallback(() => {
    setShowDetailsModal(false);
    if (description.trim() && location) {
      if (checkIfDescriptionAlreadyEnhanced(description)) {
        fetchPriceEstimate(description, { start: location, end: location });
      } else {
        const typeText = assemblyComplexity === 'simple' ? 'Simple assembly' : assemblyComplexity === 'complex' ? 'Complex assembly' : '';
        const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
        const toolsInfo = toolsNeeded ? `. Tools to bring: ${toolsNeeded}` : '';
        const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';
        const enhancedDescription = `${description}${typeText ? `. Type: ${typeText}` : ''}${sizeInfo}${toolsInfo}${requestsInfo}`;
        setDescription(enhancedDescription);
        fetchPriceEstimate(enhancedDescription, { start: location, end: location });
      }
    }
  }, [description, location, assemblyComplexity, apartmentSize, toolsNeeded, specialRequests, checkIfDescriptionAlreadyEnhanced, fetchPriceEstimate, setDescription, setShowDetailsModal]);

  // Sync state when description changes
  useEffect(() => {
    const hasEnhancedFormat = checkIfDescriptionAlreadyEnhanced(description);
    if (!description) {
      if (lastEnhancedDescriptionRef.current && (assemblyComplexity || apartmentSize || toolsNeeded || specialRequests)) {
        setAssemblyComplexity('');
        setApartmentSize('');
        setToolsNeeded('');
        setSpecialRequests('');
        lastEnhancedDescriptionRef.current = null;
      }
      return;
    }
    if (hasEnhancedFormat) lastEnhancedDescriptionRef.current = description;
    if (!hasEnhancedFormat && lastEnhancedDescriptionRef.current && (assemblyComplexity || apartmentSize || toolsNeeded || specialRequests)) {
      setAssemblyComplexity('');
      setApartmentSize('');
      setToolsNeeded('');
      setSpecialRequests('');
      lastEnhancedDescriptionRef.current = null;
      return;
    }
    if (!hasEnhancedFormat) return;

    const typeMatch = description.match(/\.\s*Type:\s*(Basic|Deep)\s*cleaning/i);
    if (typeMatch) { const type = typeMatch[1].toLowerCase() as 'simple' | 'complex'; if (assemblyComplexity !== type) setAssemblyComplexity(type); }
    else if (assemblyComplexity) setAssemblyComplexity('');

    const sizeMatch = description.match(/\.\s*Property size:\s*([^.]+)/i);
    if (sizeMatch) { const size = sizeMatch[1].trim(); if (apartmentSize !== size) setApartmentSize(size); }
    else if (apartmentSize) setApartmentSize('');

    const toolsMatch = description.match(/\.\s*Tools to bring:\s*([^.]+)/i);
    if (toolsMatch) { const tools = toolsMatch[1].trim(); if (toolsNeeded !== tools) setToolsNeeded(tools); }
    else if (toolsNeeded) setToolsNeeded('');

    const requestsMatch = description.match(/\.\s*Special requests:\s*([^.]+)/i);
    if (requestsMatch) { const requests = requestsMatch[1].trim(); if (specialRequests !== requests) setSpecialRequests(requests); }
    else if (specialRequests) setSpecialRequests('');
  }, [description, assemblyComplexity, apartmentSize, toolsNeeded, specialRequests, checkIfDescriptionAlreadyEnhanced, setAssemblyComplexity, setApartmentSize, setToolsNeeded, setSpecialRequests]);

  return {
    handleDescriptionSubmit,
    handleFurnitureAssemblyAnalysisSubmit,
    handleAssemblyComplexitySelect,
    handleApartmentSizeBack, handleApartmentSizeSubmit,
    handleToolsBack, handleToolsSubmit,
    handleDetailsBack, handleDetailsSubmit,
    analyzeFurnitureAssemblyDescription,
    checkIfDescriptionAlreadyEnhanced,
    checkForPropertySize,
  };
}
