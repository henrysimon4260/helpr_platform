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

import { EditServicePayload, HomeImprovementFormState, HomeImprovementReturnData, SelectedLocation } from './home-improvement.types';
import {
  cloneAttachments,
  cloneSelectedLocation,
  containsStreetNumber,
  createSessionToken,
  createUuid,
  formatCurrency,
  HOME_IMPROVEMENT_RETURN_PATH,
  isWithinServiceArea,
  resolveGooglePlacesKey,
  resolveOpenAIApiKey,
} from './home-improvement.utils';

// =============================================================================
// useLocationManagement - Single location for home improvement
// =============================================================================
interface LocationManagementProps {
  showModal: (config: { title: string; message: string }) => void;
  mapRef: React.RefObject<MapView | null>;
  resetPriceState: () => void;
}

export function useLocationManagement({ showModal, mapRef, resetPriceState }: LocationManagementProps) {
  const googlePlacesApiKey = useMemo(resolveGooglePlacesKey, []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationSnapshotRef = useRef<{
    locationQuery: string;
    location: SelectedLocation | null;
  } | null>(null);

  const [sessionToken, setSessionToken] = useState(createSessionToken);
  const [locationQuery, setLocationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionStatus>(PermissionStatus.UNDETERMINED);
  const [currentLocation, setCurrentLocation] = useState<SelectedLocation | null>(null);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);

  const mapEdgePadding = useMemo(() => ({ top: 60, right: 36, bottom: 220, left: 36 }), []);

  const defaultRegion = useMemo(() => ({
    latitude: 40.7128,
    longitude: -74.006,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  }), []);

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
      const [address] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const description = formatLocationDescription(address) ?? `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      const resolved: SelectedLocation = {
        description,
        coordinate: { latitude: position.coords.latitude, longitude: position.coords.longitude },
      };
      setCurrentLocation(resolved);
      return resolved;
    } catch (error) {
      console.warn('Unable to retrieve current location', error);
      return null;
    } finally {
      if (!silent) setCurrentLocationLoading(false);
    }
  }, [formatLocationDescription, locationPermissionStatus]);

  const geocodeAddress = useCallback(async (address: string): Promise<SelectedLocation | null> => {
    const trimmed = address?.trim();
    if (!trimmed) return null;

    try {
      const results = await Location.geocodeAsync(trimmed);
      const first = results?.[0];
      if (first) {
        return {
          description: trimmed,
          coordinate: { latitude: first.latitude, longitude: first.longitude },
        };
      }
    } catch (error) {
      console.warn('Failed to geocode address for edit prefill:', error);
    }
    return null;
  }, []);

  const applyLocation = useCallback((loc: SelectedLocation, options: { showStreetNumberWarning?: boolean } = {}) => {
    if (!isWithinServiceArea(loc.coordinate)) {
      showModal({
        title: 'Outside of Service Area',
        message: "Helpr currently serves NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick an address in these areas if you wish to continue.",
      });
      return;
    }

    resetPriceState();
    const shouldWarn = options.showStreetNumberWarning ?? true;
    const hasStreetNumber = containsStreetNumber(loc.description);

    setLocationQuery(loc.description);
    setLocation(loc);
    setSuggestions([]);
    setSessionToken(createSessionToken());
    setLoading(false);

    if (shouldWarn && !hasStreetNumber) {
      showModal({
        title: 'Add street number to location',
        message: 'Update your location to include the street number.',
      });
    }
  }, [resetPriceState, showModal]);

  const fetchPredictions = useCallback(async (
    input: string,
    token: string,
    setSugg: React.Dispatch<React.SetStateAction<PlaceSuggestion[]>>,
    setLoad: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    if (!googlePlacesApiKey) {
      setSugg([]);
      return;
    }

    setLoad(true);
    try {
      const params = new URLSearchParams({ input, key: googlePlacesApiKey, sessiontoken: token, components: 'country:us' });
      const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
      const data = await response.json();

      if (data.status === 'OK') {
        const parsed: PlaceSuggestion[] = (data.predictions ?? []).map((p: any) => ({
          id: p.place_id,
          placeId: p.place_id,
          primaryText: p.structured_formatting?.main_text ?? p.description ?? 'Unknown location',
          secondaryText: p.structured_formatting?.secondary_text,
          description: p.description ?? '',
        }));
        setSugg(parsed);
      } else {
        setSugg([]);
      }
    } catch {
      setSugg([]);
    } finally {
      setLoad(false);
    }
  }, [googlePlacesApiKey]);

  const fetchPlaceDetails = useCallback(async (placeId: string, token: string): Promise<SelectedLocation | null> => {
    if (!googlePlacesApiKey) return null;

    try {
      const params = new URLSearchParams({ place_id: placeId, key: googlePlacesApiKey, sessiontoken: token, fields: 'formatted_address,geometry/location' });
      const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
      const data = await response.json();

      if (data.status === 'OK') {
        const loc = data.result.geometry?.location;
        if (loc) {
          return { description: data.result.formatted_address ?? '', coordinate: { latitude: loc.lat, longitude: loc.lng } };
        }
      }
      return null;
    } catch {
      return null;
    }
  }, [googlePlacesApiKey]);

  const handleLocationChange = useCallback((text: string) => {
    setLocationQuery(text);
    setLocation(null);
    resetPriceState();

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchPredictions(trimmed, sessionToken, setSuggestions, setLoading);
    }, 350);
  }, [fetchPredictions, resetPriceState, sessionToken]);

  const handleLocationSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    if (!suggestion.placeId) return;
    setLoading(true);
    const details = await fetchPlaceDetails(suggestion.placeId, sessionToken);
    setLoading(false);
    if (details) {
      applyLocation({ description: details.description || suggestion.description, coordinate: details.coordinate });
    }
  }, [applyLocation, fetchPlaceDetails, sessionToken]);

  const handleLocationClear = useCallback(() => {
    setLocationQuery('');
    setSuggestions([]);
    setLocation(null);
    setSessionToken(createSessionToken());
    resetPriceState();
  }, [resetPriceState]);

  const handleUseCurrentLocation = useCallback(async () => {
    const existingLocation = locationPermissionStatus === PermissionStatus.GRANTED && currentLocation ? currentLocation : null;
    if (existingLocation && !currentLocationLoading) {
      applyLocation(existingLocation);
      return;
    }
    const resolved = await loadCurrentLocation();
    if (resolved) applyLocation(resolved);
  }, [applyLocation, currentLocation, currentLocationLoading, loadCurrentLocation, locationPermissionStatus]);

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

  const handleSuggestionsVisibilityChange = useCallback((visible: boolean) => {
    setIsSuggestionsVisible(visible);
  }, []);

  const snapshotLocations = useCallback(() => {
    locationSnapshotRef.current = { locationQuery, location };
  }, [location, locationQuery]);

  const restoreLocations = useCallback(() => {
    const snapshot = locationSnapshotRef.current;
    if (!snapshot) return;
    setLocationQuery(snapshot.locationQuery);
    setLocation(snapshot.location);
  }, []);

  // Fit map to location
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;
    map.animateToRegion({
      latitude: location.coordinate.latitude,
      longitude: location.coordinate.longitude,
      latitudeDelta: 0.006,
      longitudeDelta: 0.006,
    }, 300);
  }, [location, mapEdgePadding, mapRef]);

  // Load current location on mount if permissions granted
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!isMounted) return;
        setLocationPermissionStatus(status);
        if (status === PermissionStatus.GRANTED) {
          await loadCurrentLocation({ silent: true });
        }
      } catch (error) {
        if (isMounted) console.warn('Failed to check location permissions', error);
      }
    })();
    return () => { isMounted = false; };
  }, [loadCurrentLocation]);

  return {
    locationQuery,
    location,
    suggestions,
    loading,
    isSuggestionsVisible,
    currentLocationLoading,
    currentLocationOption,
    defaultRegion,
    handleLocationChange,
    handleLocationSelect,
    handleLocationClear,
    handleSuggestionsVisibilityChange,
    applyLocation,
    geocodeAddress,
    snapshotLocations,
    restoreLocations,
    setLocationQuery,
    setLocation,
  };
}

// =============================================================================
// usePriceEstimate - Home improvement-specific pricing
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

  const fetchPrice = useCallback(async (
    taskDescription: string,
    options: { start?: SelectedLocation | null; end?: SelectedLocation | null } = {},
  ) => {
    const { start, end } = options;
    setIsPriceLoading(true);
    setPriceQuote(null);
    setPriceNote(null);
    setPriceError(null);

    if (!openAiApiKey) {
      setIsPriceLoading(false);
      setPriceError('Price estimate unavailable (missing OpenAI key).');
      return;
    }

    try {
      const startDetails = start
        ? `${start.description} (lat ${start.coordinate.latitude.toFixed(4)}, lng ${start.coordinate.longitude.toFixed(4)})`
        : 'not provided';
      const endDetails = end
        ? `${end.description} (lat ${end.coordinate.latitude.toFixed(4)}, lng ${end.coordinate.longitude.toFixed(4)})`
        : 'not provided';

      const requestBody = {
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a pricing assistant for home improvement services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) type of home improvement work (repair/installation/renovation), 2) specific areas or rooms requiring work, 3) scope and complexity of the project. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (20-250 range). IMPORTANT: Scale prices significantly based on scope and complexity of the project - Studio: $20-40 (repair) / $40-80 (renovation), 1-bed: $30-50 (repair) / $60-100 (renovation), 2-bed: $45-70 (repair) / $90-130 (renovation), 3-bed: $60-90 (repair) / $120-170 (renovation), 4+ bed or house: $80-130 (repair) / $150-250 (renovation). Always increase price proportionally with more bedrooms. Provide competitive, budget-friendly estimates.',
          },
          {
            role: 'user',
            content: [`Task description: ${taskDescription}`, `Start location: ${startDetails}`, `End location: ${endDetails}`].join('\n'),
          },
        ],
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch price estimate');
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('Missing completion content');
      }

      const parsed = JSON.parse(content);

      if (parsed.safety_concern === true && parsed.safety_message) {
        showModal({ title: 'Safety Concern', message: parsed.safety_message });
        setPriceError('This request may not be suitable for our platform.');
        return;
      }

      if (parsed.needs_clarification === true && parsed.clarification_prompt) {
        setPriceError('Please select a project type.');
        return { needsClarification: true };
      }

      const price = Number(parsed.price);
      if (!Number.isFinite(price)) throw new Error('Invalid price value');

      const discountedPrice = price * 0.85;
      const sanitizedPrice = Math.max(0, Math.round(discountedPrice));
      setPriceQuote(formatCurrency(sanitizedPrice));
      return { needsClarification: false };
    } catch (error) {
      console.warn('Failed to fetch price estimate', error);
      setPriceError('Unable to estimate price right now.');
      return undefined;
    } finally {
      setIsPriceLoading(false);
    }
  }, [openAiApiKey, showModal]);

  return { priceQuote, priceNote, priceError, isPriceLoading, resetPriceState, fetchPrice, setPriceQuote, setPriceNote, setPriceError };
}

// =============================================================================
// useVoiceInput - Voice recording and transcription
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
    if (!openAiApiKey) {
      showModal({ title: 'Missing API key', message: 'Add an OpenAI API key to enable voice mode.' });
      return '';
    }

    try {
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: 'voice-input.m4a',
        type: Platform.select({ ios: 'audio/m4a', android: 'audio/mpeg', default: 'audio/m4a' }),
      } as any);
      formData.append('model', 'gpt-4o-mini-transcribe');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openAiApiKey}` },
        body: formData,
      });

      if (!response.ok) throw new Error('Transcription failed');
      const data = await response.json();
      return typeof data?.text === 'string' ? data.text.trim() : '';
    } catch {
      showModal({ title: 'Transcription failed', message: 'Unable to transcribe your recording.' });
      return '';
    } finally {
      FileSystem.deleteAsync(uri).catch(() => undefined);
    }
  }, [openAiApiKey, showModal]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      setIsRecording(false);
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
    } catch {}
    setIsRecording(false);

    const uri = recording.getURI();
    recordingRef.current = null;
    if (!uri) return;

    setIsTranscribing(true);
    try {
      const transcript = await transcribeAudio(uri);
      if (transcript) {
        resetPriceState();
        setDescription(prev => {
          const trimmed = prev.trim();
          return trimmed.length > 0 ? `${trimmed} ${transcript}` : transcript;
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [resetPriceState, setDescription, transcribeAudio]);

  const handleVoicePress = useCallback(async () => {
    if (isTranscribing) return;
    if (isRecording) {
      await stopRecordingAndTranscribe();
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        showModal({ title: 'Microphone needed', message: 'Enable microphone access to record your request.' });
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      showModal({ title: 'Recording failed', message: 'Unable to start voice mode.' });
    }
  }, [isRecording, isTranscribing, showModal, stopRecordingAndTranscribe]);

  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
    };
  }, []);

  return { isRecording, isTranscribing, handleVoicePress, recordingRef };
}

// =============================================================================
// useServiceSubmission - Handles form submission for home improvement
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
  showModal: (config: { title: string; message: string; onDismiss?: () => void }) => void;
  collectFormState: () => HomeImprovementFormState;
  setReturnTo: (path: string, data: any) => void;
  params: any;
  snapshotLocations: () => void;
  restoreLocations: () => void;
  projectType: string;
  apartmentSize: string;
  materialsNeeded: string;
  specialRequests: string;
}

export function useServiceSubmission({
  user,
  description,
  location,
  locationQuery,
  priceQuote,
  isAuto,
  isPersonal,
  isEditing,
  editServiceId,
  showModal,
  collectFormState,
  setReturnTo,
  params,
  snapshotLocations,
  restoreLocations,
  projectType,
  apartmentSize,
  materialsNeeded,
  specialRequests,
}: ServiceSubmissionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLookupError, setCustomerLookupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadCustomer = async () => {
      if (!user?.email) {
        setCustomerId(null);
        return;
      }
      try {
        const { data, error } = await supabase.from('customer').select('customer_id').eq('email', user.email).maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error('Failed to load customer profile:', error);
          setCustomerLookupError(error.message);
          setCustomerId(null);
          return;
        }
        setCustomerId(data?.customer_id ?? null);
        setCustomerLookupError(null);
      } catch (error) {
        if (!cancelled) {
          console.error('Unexpected error loading customer profile:', error);
          setCustomerLookupError('Unable to load customer profile.');
          setCustomerId(null);
        }
      }
    };
    loadCustomer();
    return () => { cancelled = true; };
  }, [user?.email]);

  const resolveCustomerId = useCallback(async () => {
    if (customerId) return customerId;
    if (!user?.email) return null;
    try {
      const { data, error } = await supabase.from('customer').select('customer_id').eq('email', user.email).maybeSingle();
      if (error) {
        console.error('Failed to resolve customer id:', error);
        setCustomerLookupError(error.message);
        return null;
      }
      if (data?.customer_id) {
        setCustomerId(data.customer_id);
        setCustomerLookupError(null);
        return data.customer_id;
      }
      return null;
    } catch (error) {
      console.error('Unexpected error resolving customer id:', error);
      setCustomerLookupError('Unable to resolve customer id');
      return null;
    }
  }, [customerId, user?.email]);

  const preserveFormForAuth = useCallback(() => {
    const formState = collectFormState();
    const sanitizedEntries: Array<[string, string]> = [];
    Object.entries(params).forEach(([key, value]: [string, any]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) sanitizedEntries.push([key, trimmed]);
        return;
      }
      if (Array.isArray(value)) {
        const candidate = value.find((item: any) => typeof item === 'string' && item.trim().length > 0);
        if (typeof candidate === 'string') sanitizedEntries.push([key, candidate.trim()]);
      }
    });

    const payload: HomeImprovementReturnData = {
      formState,
      action: 'schedule-home-improvement',
      timestamp: Date.now(),
    };
    if (sanitizedEntries.length > 0) payload.params = Object.fromEntries(sanitizedEntries);
    setReturnTo(HOME_IMPROVEMENT_RETURN_PATH, payload);
  }, [collectFormState, params, setReturnTo]);

  const handleSchedule = useCallback(async (setShowSignInModal: (v: boolean) => void) => {
    if (isSubmitting) return;

    const trimmedDescription = description.trim();
    if (trimmedDescription.length === 0) {
      snapshotLocations();
      showModal({
        title: 'Add a description',
        message: 'Please describe what you need help with before scheduling your home improvement service.',
        onDismiss: restoreLocations,
      });
      return;
    }

    if (!location) {
      showModal({ title: 'Add location', message: 'Please provide a location before scheduling.' });
      return;
    }

    if (!isWithinServiceArea(location.coordinate)) {
      showModal({
        title: "We're not in your area yet.",
        message: "Helpr currently operates in NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick an address within this area to continue.",
      });
      return;
    }

    const priceDigitsRaw = priceQuote?.replace(/[^0-9.]/g, '') ?? '';
    const priceValue = priceDigitsRaw.length > 0 ? Number(priceDigitsRaw) : null;
    const sanitizedPrice = Number.isFinite(priceValue ?? NaN) ? priceValue : null;

    if (sanitizedPrice === null) {
      showModal({ title: 'Estimate needed', message: 'Request a quick price estimate before scheduling your home improvement service.' });
      return;
    }

    if (!containsStreetNumber(location.description)) {
      showModal({ title: 'Add street number', message: 'Update your location to include the street number before scheduling.' });
      return;
    }

    if (!user) {
      preserveFormForAuth();
      setShowSignInModal(true);
      return;
    }

    if (isEditing && !editServiceId) {
      showModal({ title: 'Unable to edit', message: 'We could not determine which service to update.' });
      return;
    }

    if (!isEditing && customerLookupError) {
      console.warn('Retrying customer lookup after previous error:', customerLookupError);
    }

    let resolvedCustomerIdValue = customerId;
    if (!isEditing) {
      const resolved = await resolveCustomerId();
      if (!resolved) {
        showModal({ title: 'Account issue', message: 'We could not find your customer profile. Please try again.' });
        return;
      }
      resolvedCustomerIdValue = resolved;
    }

    const projectTypeText = projectType === 'repair' ? 'Basic repair' : projectType === 'renovation' ? 'Major renovation' : '';
    const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
    const materialsInfo = materialsNeeded ? `. Materials to bring: ${materialsNeeded}` : '';
    const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';
    const normalizedDescription = `${trimmedDescription}${projectTypeText ? `. Type: ${projectTypeText}` : ''}${sizeInfo}${materialsInfo}${requestsInfo}`;

    const paymentMethodType = isPersonal ? 'Personal' : 'Business';
    const autofillType = isAuto ? 'AutoFill' : 'Custom';
    const targetServiceId = isEditing && editServiceId ? editServiceId : createUuid();

    try {
      setIsSubmitting(true);

      if (isEditing && editServiceId) {
        const updatePayload: Record<string, unknown> = {
          location: location.description,
          price: sanitizedPrice,
          payment_method_type: paymentMethodType,
          autofill_type: autofillType,
          description: normalizedDescription,
        };

        const { error } = await supabase.from('service').update(updatePayload).eq('service_id', editServiceId);
        if (error) {
          console.error('Failed to update home improvement service:', error);
          showModal({ title: 'Update failed', message: 'Unable to save changes to your home improvement request. Please try again.' });
          return;
        }

        router.push({
          pathname: '/(booking-flow)/booked-services' as any,
          params: { serviceId: editServiceId },
        });
        return;
      }

      if (!resolvedCustomerIdValue) {
        showModal({ title: 'Account issue', message: 'We could not find your customer profile. Please try again.' });
        return;
      }

      const payload = {
        service_id: targetServiceId,
        customer_id: resolvedCustomerIdValue,
        date_of_creation: new Date().toISOString(),
        service_type: 'home-improvement',
        status: 'finding_pros',
        scheduling_type: null,
        location: location.description,
        price: sanitizedPrice,
        start_datetime: null,
        end_datetime: null,
        payment_method_type: paymentMethodType,
        autofill_type: autofillType,
        service_provider_id: null,
        scheduled_date_time: null,
        description: normalizedDescription,
      };

      router.push({
        pathname: '/(booking-flow)/booked-services' as any,
        params: {
          showOverlay: 'true',
          temporaryService: encodeURIComponent(JSON.stringify(payload)),
        },
      });
    } catch (error) {
      console.error('Unexpected scheduling error:', error);
      showModal({ title: 'Scheduling failed', message: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, description, location, priceQuote, user, isEditing, editServiceId,
    customerLookupError, customerId, isPersonal, isAuto, showModal, preserveFormForAuth,
    resolveCustomerId, snapshotLocations, restoreLocations, projectType, apartmentSize,
    materialsNeeded, specialRequests,
  ]);

  return { isSubmitting, customerId, customerLookupError, handleSchedule, preserveFormForAuth };
}

// =============================================================================
// useHomeImprovementAnalysis - Project type, apartment size, materials
// =============================================================================
interface HomeImprovementAnalysisProps {
  description: string;
  locationQuery: string;
  location: SelectedLocation | null;
  showModal: (config: { title: string; message: string }) => void;
}

export function useHomeImprovementAnalysis({
  description,
  locationQuery,
  location,
  showModal,
}: HomeImprovementAnalysisProps) {
  const checkIfDescriptionAlreadyEnhanced = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    const hasTypeInfo = /\.\s*type:\s*(repair|renovation)\s*cleaning/i.test(lowerText);
    const hasSizeInfo = /\.\s*scope and complexity of the project:/i.test(lowerText);
    const hasMaterialsInfo = /\.\s*materials to bring:/i.test(lowerText);
    return hasTypeInfo || hasSizeInfo || hasMaterialsInfo;
  }, []);

  const checkForPropertySize = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    const hasSqFt = /\b\d+\s*(sq\s*ft|square\s*feet|sqft|sf)\b/i.test(lowerText);
    const hasRoomCount = /\b\d+[\s-]*(bedroom|bed|br|bathroom|bath|ba|room)\b/i.test(lowerText);
    const hasPropertyDesc = /\b(studio|apartment|condo|house|office|townhouse|loft)\b/i.test(lowerText);
    const hasSizeDesc = /\b(small|medium|large|tiny|huge|spacious|compact)\s*(apartment|house|office|space|property|home|room)\b/i.test(lowerText);
    return hasSqFt || hasRoomCount || (hasPropertyDesc && (hasSizeDesc || hasRoomCount));
  }, []);

  const analyzeDescription = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    const spelledOutBedroomPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple)\s*(?:-|\s)?\s*(bedroom|bed|br|room|apt|apartment)s?\b/;
    const hasApartmentSize = /\b(\d+)\s*(bedroom|br|room|apt|apartment)\b/i.test(lowerText) ||
      /\b(studio|1br|2br|3br|4br|5br)\b/i.test(lowerText) ||
      spelledOutBedroomPattern.test(lowerText);
    const hasPackingStatus = /\b(pack|packed|packing|unpack|unpacked|unpacking)\b/i.test(lowerText);
    const hasTruckInfo = /\b(truck|cleaning truck|rental truck|vehicle|car|van)\b/i.test(lowerText);
    const hasBoxInfo = /\b(box|boxes|packing materials|materials)\b/i.test(lowerText);
    const hasFurnitureScope = /\b(everything|entire|whole|all|complete)\b/i.test(lowerText) ||
      /\b(furniture|bedroom|living room|kitchen|dining room|office)\b/i.test(lowerText) ||
      /\b(specific pieces|pieces|items|only)\b/i.test(lowerText) ||
      /\b(cleaning scope|scope)\b/i.test(lowerText);

    const descriptionHasStreetNumber = containsStreetNumber(text);
    const addressCandidates = [locationQuery, location?.description];
    const hasStreetNumber = addressCandidates.some(candidate => containsStreetNumber(candidate));
    const hasInput = addressCandidates.some(candidate => typeof candidate === 'string' && candidate.trim().length > 0);
    const missingStreetNumber = hasInput && !hasStreetNumber;

    return {
      hasApartmentSize,
      hasPackingStatus,
      hasTruckInfo,
      hasBoxInfo,
      hasFurnitureScope,
      hasStreetNumber: hasStreetNumber || (!hasInput && descriptionHasStreetNumber),
      missingStreetNumber,
      isPacked: hasPackingStatus && /\b(packed|packing)\b/i.test(lowerText),
    };
  }, [location?.description, locationQuery]);

  return {
    checkIfDescriptionAlreadyEnhanced,
    checkForPropertySize,
    analyzeDescription,
  };
}
