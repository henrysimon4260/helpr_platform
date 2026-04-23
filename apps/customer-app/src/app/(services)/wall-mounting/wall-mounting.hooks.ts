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
import { SelectedLocation, WallMountingFormState, WallMountingReturnData } from './wall-mounting.types';
import {
  cloneAttachments,
  cloneSelectedLocation,
  containsStreetNumber,
  createSessionToken,
  createUuid,
  formatCurrency,
  isWithinServiceArea,
  resolveGooglePlacesKey,
  resolveOpenAIApiKey,
  WALL_MOUNTING_RETURN_PATH,
} from './wall-mounting.utils';

// =============================================================================
// useLocationManagement - Handles single location logic
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
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionStatus>(
    PermissionStatus.UNDETERMINED,
  );
  const [currentLocation, setCurrentLocation] = useState<SelectedLocation | null>(null);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);

  const mapEdgePadding = useMemo(() => ({ top: 60, right: 36, bottom: 220, left: 36 }), []);
  const defaultRegion = useMemo(
    () => ({ latitude: 40.7128, longitude: -74.006, latitudeDelta: 0.08, longitudeDelta: 0.08 }),
    [],
  );

  const formatLocationDescription = useCallback((address?: Location.LocationGeocodedAddress) => {
    if (!address) return undefined;
    const streetLine =
      address.name ||
      [address.streetNumber, address.street].filter(Boolean).join(' ').trim() ||
      address.street ||
      undefined;
    const locality = address.city || address.subregion || undefined;
    const region = address.region || undefined;
    const parts = [streetLine, locality, region].filter(Boolean) as string[];
    if (address.postalCode && !parts.includes(address.postalCode)) parts.push(address.postalCode);
    if (address.country && !parts.includes(address.country)) parts.push(address.country);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }, []);

  const loadCurrentLocation = useCallback(
    async (options: { silent?: boolean } = {}): Promise<SelectedLocation | null> => {
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

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.LocationAccuracy.Balanced,
        });

        const [address] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        const description =
          formatLocationDescription(address) ??
          `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;

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
    },
    [formatLocationDescription, locationPermissionStatus],
  );

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

  const applyLocation = useCallback(
    (loc: SelectedLocation, options: { showStreetNumberWarning?: boolean } = {}) => {
      if (!isWithinServiceArea(loc.coordinate)) {
        showModal({
          title: 'Outside of Service Area',
          message:
            "Helpr currently serves NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick an address in these areas if you wish to continue.",
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
    },
    [resetPriceState, showModal],
  );

  const handleUseCurrentLocation = useCallback(async () => {
    const existingLocation =
      locationPermissionStatus === PermissionStatus.GRANTED && currentLocation
        ? currentLocation
        : null;

    if (existingLocation && !currentLocationLoading) {
      applyLocation(existingLocation);
      return;
    }

    const resolved = await loadCurrentLocation();
    if (resolved) applyLocation(resolved);
  }, [applyLocation, currentLocation, currentLocationLoading, loadCurrentLocation, locationPermissionStatus]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;
    map.animateToRegion(
      {
        latitude: location.coordinate.latitude,
        longitude: location.coordinate.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      },
      300,
    );
  }, [location, mapEdgePadding, mapRef]);

  const fetchPredictions = useCallback(
    async (
      input: string,
      token: string,
      setSugg: React.Dispatch<React.SetStateAction<PlaceSuggestion[]>>,
      setLoad: React.Dispatch<React.SetStateAction<boolean>>,
    ) => {
      if (!googlePlacesApiKey) {
        console.warn('Google Places API key is not configured.');
        setSugg([]);
        return;
      }

      setLoad(true);
      try {
        const params = new URLSearchParams({
          input,
          key: googlePlacesApiKey,
          sessiontoken: token,
          components: 'country:us',
        });

        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
        );
        const data = await response.json();

        if (data.status === 'OK') {
          const parsed: PlaceSuggestion[] = (data.predictions ?? []).map((prediction: any) => ({
            id: prediction.place_id,
            placeId: prediction.place_id,
            primaryText:
              prediction.structured_formatting?.main_text ?? prediction.description ?? 'Unknown location',
            secondaryText: prediction.structured_formatting?.secondary_text,
            description: prediction.description ?? '',
          }));
          setSugg(parsed);
        } else {
          console.warn('Google Places Autocomplete error:', data.status, data.error_message);
          setSugg([]);
        }
      } catch (error) {
        console.warn('Failed to fetch autocomplete suggestions', error);
        setSugg([]);
      } finally {
        setLoad(false);
      }
    },
    [googlePlacesApiKey],
  );

  const fetchPlaceDetails = useCallback(
    async (placeId: string, token: string): Promise<SelectedLocation | null> => {
      if (!googlePlacesApiKey) {
        console.warn('Google Places API key is not configured.');
        return null;
      }

      try {
        const params = new URLSearchParams({
          place_id: placeId,
          key: googlePlacesApiKey,
          sessiontoken: token,
          fields: 'formatted_address,geometry/location',
        });

        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
        );
        const data = await response.json();

        if (data.status === 'OK') {
          const loc = data.result.geometry?.location;
          if (!loc) return null;
          return {
            description: data.result.formatted_address ?? '',
            coordinate: { latitude: loc.lat, longitude: loc.lng },
          };
        }

        console.warn('Google Places Details error:', data.status, data.error_message);
        return null;
      } catch (error) {
        console.warn('Failed to fetch place details', error);
        return null;
      }
    },
    [googlePlacesApiKey],
  );

  const handleLocationChange = useCallback(
    (text: string) => {
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
    },
    [fetchPredictions, resetPriceState, sessionToken],
  );

  const handleLocationSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!suggestion.placeId) return;
      setLoading(true);
      const details = await fetchPlaceDetails(suggestion.placeId, sessionToken);
      setLoading(false);
      if (!details) return;
      applyLocation({
        description: details.description || suggestion.description,
        coordinate: details.coordinate,
      });
    },
    [applyLocation, fetchPlaceDetails, sessionToken],
  );

  const handleLocationClear = useCallback(() => {
    setLocationQuery('');
    setSuggestions([]);
    setLocation(null);
    setSessionToken(createSessionToken());
    resetPriceState();
  }, [resetPriceState]);

  const currentLocationSecondaryText = useMemo(() => {
    if (currentLocation) return currentLocation.description;
    if (locationPermissionStatus === PermissionStatus.DENIED) {
      return 'Enable location access in Settings to use this option.';
    }
    return "Fill with your device's current GPS position.";
  }, [currentLocation, locationPermissionStatus]);

  const currentLocationOption = useMemo<CurrentLocationOption>(
    () => ({
      id: 'current-location',
      primaryText: 'Current Location',
      secondaryText: currentLocationSecondaryText,
      onSelect: () => handleUseCurrentLocation(),
      loading: currentLocationLoading,
      disabled: currentLocationLoading,
    }),
    [currentLocationLoading, currentLocationSecondaryText, handleUseCurrentLocation],
  );

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

  return {
    locationQuery,
    setLocationQuery,
    suggestions,
    loading,
    isSuggestionsVisible,
    location,
    setLocation,
    currentLocationLoading,
    currentLocationOption,
    defaultRegion,
    mapEdgePadding,
    applyLocation,
    geocodeAddress,
    handleLocationChange,
    handleLocationSelect,
    handleLocationClear,
    handleSuggestionsVisibilityChange,
    snapshotLocations,
    restoreLocations,
  };
}

// =============================================================================
// usePriceEstimate - Handles price estimation
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

  const fetchPriceEstimate = useCallback(
    async (
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
                'You are a pricing assistant for cleaning services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) degree of cleaning needed (light/medium/deep), 2) which rooms or entire home, 3) property size. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (20-250 range). IMPORTANT: Scale prices significantly based on property size - Studio: $20-40 (basic) / $40-80 (deep), 1-bed: $30-50 (basic) / $60-100 (deep), 2-bed: $45-70 (basic) / $90-130 (deep), 3-bed: $60-90 (basic) / $120-170 (deep), 4+ bed or house: $80-130 (basic) / $150-250 (deep). Always increase price proportionally with more bedrooms. Provide competitive, budget-friendly estimates.',
            },
            {
              role: 'user',
              content: [
                `Task description: ${taskDescription}`,
                `Start location: ${startDetails}`,
                `End location: ${endDetails}`,
              ].join('\n'),
            },
          ],
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiApiKey}`,
          },
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

        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error('Unable to parse price estimate');
        }

        if (parsed.safety_concern === true && parsed.safety_message) {
          showModal({ title: 'Safety Concern', message: parsed.safety_message });
          setPriceError('This request may not be suitable for our platform.');
          return;
        }

        if (parsed.needs_clarification === true && parsed.clarification_prompt) {
          setPriceError('Please select a cleaning type.');
          return parsed;
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
    },
    [openAiApiKey, showModal],
  );

  const checkForPropertySize = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    const hasSqFt = /\b\d+\s*(sq\s*ft|square\s*feet|sqft|sf)\b/i.test(lowerText);
    const hasRoomCount = /\b\d+[\s-]*(bedroom|bed|br|bathroom|bath|ba|room)\b/i.test(lowerText);
    const hasPropertyDesc = /\b(studio|apartment|condo|house|office|townhouse|loft)\b/i.test(lowerText);
    const hasSizeDesc =
      /\b(small|medium|large|tiny|huge|spacious|compact)\s*(apartment|house|office|space|property|home|room)\b/i.test(
        lowerText,
      );
    return hasSqFt || hasRoomCount || (hasPropertyDesc && (hasSizeDesc || hasRoomCount));
  }, []);

  return {
    priceQuote,
    setPriceQuote,
    priceNote,
    setPriceNote,
    priceError,
    setPriceError,
    isPriceLoading,
    resetPriceState,
    fetchPriceEstimate,
    checkForPropertySize,
  };
}

// =============================================================================
// useVoiceInput - Handles voice recording and transcription
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

  const transcribeAudioAsync = useCallback(
    async (uri: string) => {
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

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Transcription failed');
        }

        const data = await response.json();
        return typeof data?.text === 'string' ? data.text.trim() : '';
      } catch (error) {
        console.warn('Transcription error', error);
        showModal({ title: 'Transcription failed', message: 'Unable to transcribe your recording.' });
        return '';
      } finally {
        FileSystem.deleteAsync(uri).catch(() => undefined);
      }
    },
    [openAiApiKey, showModal],
  );

  const stopRecordingAndTranscribe = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      setIsRecording(false);
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
    } catch (error) {
      console.warn('Failed to stop recording', error);
    }

    setIsRecording(false);
    const uri = recording.getURI();
    recordingRef.current = null;
    if (!uri) return;

    setIsTranscribing(true);
    try {
      const transcript = await transcribeAudioAsync(uri);
      if (transcript) {
        resetPriceState();
        setDescription((prev) => {
          const trimmedPrev = prev.trim();
          const combined = trimmedPrev.length > 0 ? `${trimmedPrev} ${transcript}` : transcript;
          return combined.trim();
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [resetPriceState, setDescription, transcribeAudioAsync]);

  const handleVoiceModePress = useCallback(async () => {
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
    } catch (error) {
      console.warn('Failed to start recording', error);
      showModal({ title: 'Recording failed', message: 'Unable to start voice mode.' });
    }
  }, [isRecording, isTranscribing, showModal, stopRecordingAndTranscribe]);

  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
    };
  }, []);

  return { isRecording, isTranscribing, handleVoiceModePress, recordingRef };
}

// =============================================================================
// useServiceSubmission - Handles scheduling / editing logic
// =============================================================================
interface ServiceSubmissionProps {
  user: any;
  description: string;
  location: SelectedLocation | null;
  priceQuote: string | null;
  isAuto: boolean;
  isPersonal: boolean;
  isEditing: boolean;
  editServiceId: string | null;
  cleaningType: '' | 'basic' | 'deep';
  apartmentSize: string;
  suppliesNeeded: string;
  specialRequests: string;
  attachments: AttachmentAsset[];
  showModal: (config: { title: string; message: string; onDismiss?: () => void }) => void;
  setShowSignInModal: (v: boolean) => void;
  preserveFormForAuth: () => void;
  snapshotLocations: () => void;
  restoreLocations: () => void;
}

export function useServiceSubmission({
  user,
  description,
  location,
  priceQuote,
  isAuto,
  isPersonal,
  isEditing,
  editServiceId,
  cleaningType,
  apartmentSize,
  suppliesNeeded,
  specialRequests,
  attachments,
  showModal,
  setShowSignInModal,
  preserveFormForAuth,
  snapshotLocations,
  restoreLocations,
}: ServiceSubmissionProps) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLookupError, setCustomerLookupError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadCustomer = async () => {
      if (!user?.email) {
        setCustomerId(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('customer')
          .select('customer_id')
          .eq('email', user.email)
          .maybeSingle();
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
      const { data, error } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('email', user.email)
        .maybeSingle();
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

  const handleScheduleHelpr = useCallback(async () => {
    if (isSubmitting) return;

    const trimmedDescription = description.trim();

    if (trimmedDescription.length === 0) {
      snapshotLocations();
      showModal({
        title: 'Add a description',
        message: 'Please describe what you need help with before scheduling your wall mounting service.',
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
        message:
          "Helpr currently operates in NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick an address within this area to continue.",
      });
      return;
    }

    const priceDigitsRaw = priceQuote?.replace(/[^0-9.]/g, '') ?? '';
    const priceValue = priceDigitsRaw.length > 0 ? Number(priceDigitsRaw) : null;
    const sanitizedPrice = Number.isFinite(priceValue ?? NaN) ? priceValue : null;

    if (sanitizedPrice === null) {
      showModal({
        title: 'Estimate needed',
        message: 'Request a quick price estimate before scheduling your wall mounting service.',
      });
      return;
    }

    if (!containsStreetNumber(location.description)) {
      showModal({
        title: 'Add street number',
        message: 'Update your location to include the street number before scheduling.',
      });
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
        showModal({
          title: 'Account issue',
          message: 'We could not find your customer profile. Please try again.',
        });
        return;
      }
      resolvedCustomerIdValue = resolved;
    }

    const cleaningTypeText =
      cleaningType === 'basic'
        ? 'Basic cleaning'
        : cleaningType === 'deep'
          ? 'Deep cleaning'
          : '';
    const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
    const suppliesInfo = suppliesNeeded ? `. Supplies to bring: ${suppliesNeeded}` : '';
    const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';

    const normalizedDescription = `${trimmedDescription}${cleaningTypeText ? `. Type: ${cleaningTypeText}` : ''}${sizeInfo}${suppliesInfo}${requestsInfo}`;
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

        const { error } = await supabase
          .from('service')
          .update(updatePayload)
          .eq('service_id', editServiceId);

        if (error) {
          console.error('Failed to update wall mounting service:', error);
          showModal({
            title: 'Update failed',
            message: 'Unable to save changes to your wall mounting request. Please try again.',
          });
          return;
        }

        router.push({
          pathname: '/(booking-flow)/booked-services' as any,
          params: { serviceId: editServiceId },
        });
        return;
      }

      if (!resolvedCustomerIdValue) {
        showModal({
          title: 'Account issue',
          message: 'We could not find your customer profile. Please try again.',
        });
        return;
      }

      const payload = {
        service_id: targetServiceId,
        customer_id: resolvedCustomerIdValue,
        date_of_creation: new Date().toISOString(),
        service_type: 'cleaning',
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
    attachments,
    showModal,
    customerId,
    customerLookupError,
    description,
    editServiceId,
    location,
    isAuto,
    isEditing,
    isPersonal,
    isSubmitting,
    priceQuote,
    preserveFormForAuth,
    resolveCustomerId,
    snapshotLocations,
    restoreLocations,
    user,
    cleaningType,
    apartmentSize,
    suppliesNeeded,
    specialRequests,
    setShowSignInModal,
  ]);

  return { isSubmitting, customerId, customerLookupError, handleScheduleHelpr };
}

// =============================================================================
// useWallMountingAnalysis - Handles the service-specific analysis modals
// =============================================================================
interface WallMountingAnalysisProps {
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
  locationQuery: string;
  location: SelectedLocation | null;
  fetchPriceEstimate: (
    taskDescription: string,
    options?: { start?: SelectedLocation | null; end?: SelectedLocation | null },
  ) => Promise<any>;
  checkForPropertySize: (text: string) => boolean;
  isPriceLoading: boolean;
  isTranscribing: boolean;
  showModal: (config: { title: string; message: string }) => void;
}

export function useWallMountingAnalysis({
  description,
  setDescription,
  locationQuery,
  location,
  fetchPriceEstimate,
  checkForPropertySize,
  isPriceLoading,
  isTranscribing,
  showModal,
}: WallMountingAnalysisProps) {
  const [showWallMountingAnalysisModal, setShowWallMountingAnalysisModal] = useState(false);
  const [showCleaningTypeModal, setShowCleaningTypeModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showApartmentSizeModal, setShowApartmentSizeModal] = useState(false);
  const [showSuppliesModal, setShowSuppliesModal] = useState(false);
  const [cleaningType, setCleaningType] = useState<'basic' | 'deep' | ''>('');
  const [apartmentSize, setApartmentSize] = useState('');
  const [suppliesNeeded, setSuppliesNeeded] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [detailsPhotos, setDetailsPhotos] = useState<AttachmentAsset[]>([]);
  const [currentQuestionStep, setCurrentQuestionStep] = useState(0);
  const [furnitureScope, setFurnitureScope] = useState('');
  const [packingStatus, setPackingStatus] = useState<'packed' | 'not-packed' | ''>('');
  const [needsTruck, setNeedsTruck] = useState<'yes' | 'no' | ''>('');
  const [boxesNeeded, setBoxesNeeded] = useState<'yes' | 'no' | ''>('');
  const lastEnhancedDescriptionRef = useRef<string | null>(null);

  const checkIfDescriptionAlreadyEnhanced = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    const hasTypeInfo = /\.\s*type:\s*(basic|deep)\s*cleaning/i.test(lowerText);
    const hasSizeInfo = /\.\s*property size:/i.test(lowerText);
    const hasSuppliesInfo = /\.\s*supplies to bring:/i.test(lowerText);
    return hasTypeInfo || hasSizeInfo || hasSuppliesInfo;
  }, []);

  useEffect(() => {
    const hasEnhancedFormat = checkIfDescriptionAlreadyEnhanced(description);

    if (!description) {
      if (
        lastEnhancedDescriptionRef.current &&
        (cleaningType || apartmentSize || suppliesNeeded || specialRequests)
      ) {
        setCleaningType('');
        setApartmentSize('');
        setSuppliesNeeded('');
        setSpecialRequests('');
        lastEnhancedDescriptionRef.current = null;
      }
      return;
    }

    if (hasEnhancedFormat) {
      lastEnhancedDescriptionRef.current = description;
    }

    if (
      !hasEnhancedFormat &&
      lastEnhancedDescriptionRef.current &&
      (cleaningType || apartmentSize || suppliesNeeded || specialRequests)
    ) {
      setCleaningType('');
      setApartmentSize('');
      setSuppliesNeeded('');
      setSpecialRequests('');
      lastEnhancedDescriptionRef.current = null;
      return;
    }

    if (!hasEnhancedFormat) return;

    const typeMatch = description.match(/\.\s*Type:\s*(Basic|Deep)\s*cleaning/i);
    if (typeMatch) {
      const type = typeMatch[1].toLowerCase() as 'basic' | 'deep';
      if (cleaningType !== type) setCleaningType(type);
    } else if (cleaningType) {
      setCleaningType('');
    }

    const sizeMatch = description.match(/\.\s*Property size:\s*([^.]+)/i);
    if (sizeMatch) {
      const size = sizeMatch[1].trim();
      if (apartmentSize !== size) setApartmentSize(size);
    } else if (apartmentSize) {
      setApartmentSize('');
    }

    const suppliesMatch = description.match(/\.\s*Supplies to bring:\s*([^.]+)/i);
    if (suppliesMatch) {
      const supplies = suppliesMatch[1].trim();
      if (suppliesNeeded !== supplies) setSuppliesNeeded(supplies);
    } else if (suppliesNeeded) {
      setSuppliesNeeded('');
    }

    const requestsMatch = description.match(/\.\s*Special requests:\s*([^.]+)/i);
    if (requestsMatch) {
      const requests = requestsMatch[1].trim();
      if (specialRequests !== requests) setSpecialRequests(requests);
    } else if (specialRequests) {
      setSpecialRequests('');
    }
  }, [description, cleaningType, apartmentSize, suppliesNeeded, specialRequests, checkIfDescriptionAlreadyEnhanced]);

  const resetWallMountingAnalysisFlow = useCallback(() => {
    setShowWallMountingAnalysisModal(false);
    setCurrentQuestionStep(0);
    setApartmentSize('');
    setFurnitureScope('');
    setPackingStatus('');
    setNeedsTruck('');
    setBoxesNeeded('');
  }, []);

  const analyzeWallMountingDescription = useCallback(
    (text: string) => {
      const lowerText = text.toLowerCase();
      const spelledOutBedroomPattern =
        /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple)\s*(?:-|\s)?\s*(bedroom|bed|br|room|apt|apartment)s?\b/;

      const hasApartmentSize =
        /\b(\d+)\s*(bedroom|br|room|apt|apartment)\b/i.test(lowerText) ||
        /\b(studio|1br|2br|3br|4br|5br)\b/i.test(lowerText) ||
        spelledOutBedroomPattern.test(lowerText);

      const hasPackingStatus = /\b(pack|packed|packing|unpack|unpacked|unpacking)\b/i.test(lowerText);
      const hasTruckInfo = /\b(truck|cleaning truck|rental truck|vehicle|car|van)\b/i.test(lowerText);
      const hasBoxInfo = /\b(box|boxes|packing supplies|supplies)\b/i.test(lowerText);
      const hasFurnitureScope =
        /\b(everything|entire|whole|all|complete)\b/i.test(lowerText) ||
        /\b(furniture|bedroom|living room|kitchen|dining room|office)\b/i.test(lowerText) ||
        /\b(specific pieces|pieces|items|only)\b/i.test(lowerText) ||
        /\b(cleaning scope|scope)\b/i.test(lowerText);

      const descriptionHasStreetNumber = containsStreetNumber(text);
      const addressCandidates = [locationQuery, location?.description];
      const hasStreetNumber = addressCandidates.some((candidate) => containsStreetNumber(candidate));
      const hasInput = addressCandidates.some(
        (candidate) => typeof candidate === 'string' && candidate.trim().length > 0,
      );
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
    },
    [location?.description, locationQuery],
  );

  const wallMountingAnalysis = useMemo(() => {
    const analysis = analyzeWallMountingDescription(description);
    const missingInfo: string[] = [];
    if (analysis.missingStreetNumber) missingInfo.push('street number');
    const questionsToShow: Array<{
      id: string;
      title: string;
      message: string;
      placeholder: string;
      multiline?: boolean;
      options?: string[];
    }> = [];
    return { ...analysis, missingInfo, questionsToShow };
  }, [analyzeWallMountingDescription, description]);

  const handleDescriptionSubmit = useCallback(() => {
    if (isPriceLoading || isTranscribing) return;
    const trimmed = description.trim();
    if (trimmed.length === 0) {
      return;
    }

    if (!location) {
      showModal({ title: 'Missing location', message: 'Please enter a location.' });
      return;
    }

    Keyboard.dismiss();

    if (cleaningType) {
      if (checkForPropertySize(description) || apartmentSize) {
        if (suppliesNeeded) {
          const baseDesc = description
            .replace(/\.\s*Type:\s*(Basic|Deep)\s*cleaning/gi, '')
            .replace(/\.\s*Property size:\s*[^.]+/gi, '')
            .replace(/\.\s*Supplies to bring:\s*[^.]+/gi, '')
            .replace(/\.\s*Special requests:\s*[^.]+/gi, '')
            .trim();

          const cleaningTypeText =
            cleaningType === 'basic' ? 'Basic cleaning' : cleaningType === 'deep' ? 'Deep cleaning' : '';
          const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
          const suppliesInfo = suppliesNeeded ? `. Supplies to bring: ${suppliesNeeded}` : '';
          const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';

          const rebuiltDescription = `${baseDesc}${cleaningTypeText ? `. Type: ${cleaningTypeText}` : ''}${sizeInfo}${suppliesInfo}${requestsInfo}`;
          if (rebuiltDescription !== description) setDescription(rebuiltDescription);
          fetchPriceEstimate(rebuiltDescription, { start: location, end: location });
        } else {
          setShowSuppliesModal(true);
        }
      } else {
        setShowApartmentSizeModal(true);
      }
    } else {
      setShowCleaningTypeModal(true);
    }
  }, [
    description,
    location,
    isPriceLoading,
    isTranscribing,
    showModal,
    cleaningType,
    apartmentSize,
    suppliesNeeded,
    specialRequests,
    checkForPropertySize,
    fetchPriceEstimate,
    setDescription,
  ]);

  const handleWallMountingAnalysisSubmit = useCallback(() => {
    const analysis = analyzeWallMountingDescription(description);
    if (!analysis.hasStreetNumber) {
      showModal({
        title: 'Add street number',
        message: 'Update your location to include the street number so your helpr can find you.',
      });
      return;
    }
    handleDescriptionSubmit();
  }, [analyzeWallMountingDescription, description, handleDescriptionSubmit, showModal]);

  const handleAnalysisModalSubmit = useCallback(() => {
    resetWallMountingAnalysisFlow();
    handleDescriptionSubmit();
  }, [handleDescriptionSubmit, resetWallMountingAnalysisFlow]);

  const handleAnalysisModalBack = useCallback(() => {
    if (currentQuestionStep === 0) {
      resetWallMountingAnalysisFlow();
      return;
    }
    setCurrentQuestionStep((prev) => Math.max(0, prev - 1));
  }, [currentQuestionStep, resetWallMountingAnalysisFlow]);

  const handleCleaningTypeSelect = useCallback(
    (type: 'basic' | 'deep') => {
      setCleaningType(type);
      setShowCleaningTypeModal(false);
      if (checkForPropertySize(description)) {
        setShowSuppliesModal(true);
      } else {
        setShowApartmentSizeModal(true);
      }
    },
    [description, checkForPropertySize],
  );

  const handleApartmentSizeBack = useCallback(() => {
    setShowApartmentSizeModal(false);
    setShowCleaningTypeModal(true);
  }, []);

  const handleApartmentSizeSubmit = useCallback(() => {
    if (!apartmentSize.trim()) return;
    setShowApartmentSizeModal(false);
    setShowSuppliesModal(true);
  }, [apartmentSize]);

  const handleSuppliesBack = useCallback(() => {
    setShowSuppliesModal(false);
    if (checkForPropertySize(description)) {
      setShowCleaningTypeModal(true);
    } else {
      setShowApartmentSizeModal(true);
    }
  }, [description, checkForPropertySize]);

  const handleSuppliesSubmit = useCallback(() => {
    setShowSuppliesModal(false);
    setShowDetailsModal(true);
  }, []);

  const handleDetailsBack = useCallback(() => {
    setShowDetailsModal(false);
    setShowSuppliesModal(true);
  }, []);

  const handleDetailsSubmit = useCallback(() => {
    setShowDetailsModal(false);
    if (description.trim() && location) {
      if (checkIfDescriptionAlreadyEnhanced(description)) {
        fetchPriceEstimate(description, { start: location, end: location });
      } else {
        const cleaningTypeText =
          cleaningType === 'basic' ? 'Basic cleaning' : cleaningType === 'deep' ? 'Deep cleaning' : '';
        const sizeInfo = apartmentSize ? `. Property size: ${apartmentSize}` : '';
        const suppliesInfo = suppliesNeeded ? `. Supplies to bring: ${suppliesNeeded}` : '';
        const requestsInfo = specialRequests ? `. Special requests: ${specialRequests}` : '';
        const enhancedDescription = `${description}${cleaningTypeText ? `. Type: ${cleaningTypeText}` : ''}${sizeInfo}${suppliesInfo}${requestsInfo}`;
        setDescription(enhancedDescription);
        fetchPriceEstimate(enhancedDescription, { start: location, end: location });
      }
    }
  }, [
    description,
    location,
    cleaningType,
    apartmentSize,
    suppliesNeeded,
    specialRequests,
    checkIfDescriptionAlreadyEnhanced,
    fetchPriceEstimate,
    setDescription,
  ]);

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
      const name = asset.fileName ?? 'details-photo.jpg';
      setDetailsPhotos((prev) => [...prev, { uri: asset.uri, type: 'photo', name }]);
    } catch (error) {
      console.warn('Photo picker error', error);
      showModal({ title: 'Upload failed', message: 'Unable to select photo right now.' });
    }
  }, [showModal]);

  return {
    showWallMountingAnalysisModal,
    showCleaningTypeModal,
    setShowCleaningTypeModal,
    showDetailsModal,
    showApartmentSizeModal,
    setShowApartmentSizeModal,
    showSuppliesModal,
    setShowSuppliesModal,
    cleaningType,
    setCleaningType,
    apartmentSize,
    setApartmentSize,
    suppliesNeeded,
    setSuppliesNeeded,
    specialRequests,
    setSpecialRequests,
    detailsPhotos,
    currentQuestionStep,
    furnitureScope,
    setFurnitureScope,
    packingStatus,
    setPackingStatus,
    needsTruck,
    setNeedsTruck,
    boxesNeeded,
    setBoxesNeeded,
    wallMountingAnalysis,
    resetWallMountingAnalysisFlow,
    handleDescriptionSubmit,
    handleWallMountingAnalysisSubmit,
    handleAnalysisModalSubmit,
    handleAnalysisModalBack,
    handleCleaningTypeSelect,
    handleApartmentSizeBack,
    handleApartmentSizeSubmit,
    handleSuppliesBack,
    handleSuppliesSubmit,
    handleDetailsBack,
    handleDetailsSubmit,
    handleDetailsPhotoUpload,
    checkIfDescriptionAlreadyEnhanced,
  };
}
