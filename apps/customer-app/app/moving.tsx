import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { PermissionStatus } from 'expo-modules-core';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { LatLng, Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { SvgXml } from 'react-native-svg';
import { useAuth } from '../src/contexts/AuthContext';
import { useModal } from '../src/contexts/ModalContext';
import { supabase } from '../src/lib/supabase';

type PlaceSuggestion = {
  id: string;
  placeId: string;
  primaryText: string;
  secondaryText?: string;
  description: string;
};

type SelectedLocation = {
  description: string;
  coordinate: LatLng;
};

type CurrentLocationOption = {
  id: string;
  primaryText: string;
  secondaryText?: string;
  onSelect: () => void;
  loading: boolean;
  disabled?: boolean;
};

type EditServicePayload = {
  service_id: string;
  service_type?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  price?: number | null;
  payment_method_type?: string | null;
  autofill_type?: string | null;
  scheduling_type?: string | null;
  scheduled_date_time?: string | null;
  description?: string | null;
};

type LocationAutocompleteInputProps = {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onClear: () => void;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  currentLocationOption?: CurrentLocationOption;
  onSuggestionsVisibilityChange?: (visible: boolean) => void;
};

type AttachmentAsset = { uri: string; type: 'photo' | 'video'; name: string };

type MovingFormState = {
  startQuery: string;
  endQuery: string;
  startLocation: SelectedLocation | null;
  endLocation: SelectedLocation | null;
  description: string;
  isAuto: boolean;
  isPersonal: boolean;
  priceQuote: string | null;
  priceNote: string | null;
  priceError: string | null;
  attachments: AttachmentAsset[];
  apartmentSize: string;
  packingStatus: '' | 'packed' | 'not-packed';
  needsTruck: '' | 'yes' | 'no';
  boxesNeeded: '' | 'yes' | 'no';
  furnitureScope: string;
};

type MovingReturnData = {
  formState: MovingFormState;
  action?: 'schedule-moving';
  timestamp?: number;
  params?: Record<string, string>;
};

const MOVING_RETURN_PATH = 'moving';

const createUuid = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    // ignore and fall back to manual generation
  }

  let timestamp = Date.now();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    timestamp += performance.now();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (timestamp + Math.random() * 16) % 16 | 0;
    timestamp = Math.floor(timestamp / 16);
    if (char === 'x') {
      return random.toString(16);
    }
    return ((random & 0x3) | 0x8).toString(16);
  });
};

const createSessionToken = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const resolveGooglePlacesKey = () => {
  const extras = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const keyFromExtras = typeof extras.googlePlacesApiKey === 'string' ? extras.googlePlacesApiKey : undefined;

  return (
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    keyFromExtras ||
    ''
  );
};

const resolveOpenAIApiKey = () => {
  const extras = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const keyFromExtras = typeof extras.openAiApiKey === 'string' ? extras.openAiApiKey : undefined;

  return (
    process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    keyFromExtras ||
    ''
  );
};

type ServiceZoneBoundingBox = {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

const ALLOWED_SERVICE_ZONES: ServiceZoneBoundingBox[] = [
  { name: 'Manhattan', minLat: 40.6808, maxLat: 40.8820, minLng: -74.0477, maxLng: -73.9070 },
  { name: 'Brooklyn', minLat: 40.5512, maxLat: 40.7395, minLng: -74.0530, maxLng: -73.8334 },
  { name: 'Queens', minLat: 40.5380, maxLat: 40.8007, minLng: -73.9620, maxLng: -73.7004 },
  { name: 'Bronx', minLat: 40.7850, maxLat: 40.9176, minLng: -73.9330, maxLng: -73.7650 },
  { name: 'Staten Island', minLat: 40.4810, maxLat: 40.6510, minLng: -74.2557, maxLng: -74.0520 },
  { name: 'Westchester County', minLat: 40.8940, maxLat: 41.3570, minLng: -74.0770, maxLng: -73.4810 },
  { name: 'Hudson County', minLat: 40.6500, maxLat: 40.8770, minLng: -74.1200, maxLng: -74.0100 },
  { name: 'Bergen County', minLat: 40.7900, maxLat: 41.1200, minLng: -74.2050, maxLng: -73.8640 },
];

const isWithinServiceZone = (coordinate: LatLng, zone: ServiceZoneBoundingBox): boolean => {
  const { latitude, longitude } = coordinate;
  return latitude >= zone.minLat && latitude <= zone.maxLat && longitude >= zone.minLng && longitude <= zone.maxLng;
};

const isWithinServiceArea = (coordinate: LatLng | undefined | null): boolean => {
  if (!coordinate) {
    return false;
  }

  return ALLOWED_SERVICE_ZONES.some(zone => isWithinServiceZone(coordinate, zone));
};

const formatCurrency = (value: number) => {
  const safeValue = Math.max(0, Math.round(value));
  return `$${safeValue.toLocaleString('en-US')}`;
};

const STREET_SUFFIX_KEYWORDS = new Set([
  'street',
  'st',
  'avenue',
  'ave',
  'road',
  'rd',
  'drive',
  'dr',
  'lane',
  'ln',
  'way',
  'wy',
  'place',
  'pl',
  'court',
  'ct',
  'boulevard',
  'blvd',
  'circle',
  'cir',
  'parkway',
  'pkwy',
  'terrace',
  'ter',
  'trail',
  'trl',
  'highway',
  'hwy',
  'expressway',
  'expy',
  'freeway',
  'fwy',
  'loop',
  'row',
  'plaza',
  'square',
  'sq',
  'causeway',
  'cswy',
  'crescent',
  'cres',
  'bridge',
  'brg',
  'pass',
  'path',
  'passage',
  'view',
  'vista',
  'walk',
  'run',
  'landing',
  'ldg',
  'ridge',
  'rdg',
  'heights',
  'hts',
  'park',
  'pk',
  'manor',
  'mnr',
  'station',
  'sta',
]);

const NON_ADDRESS_FOLLOWING_WORDS = new Set([
  'bedroom',
  'bedrooms',
  'bathroom',
  'bathrooms',
  'box',
  'boxes',
  'item',
  'items',
  'piece',
  'pieces',
  'room',
  'rooms',
  'floor',
  'floors',
  'apt',
  'apartment',
  'apartments',
  'unit',
  'units',
  'suite',
  'ste',
  'level',
  'levels',
  'story',
  'stories',
  'garage',
  'garages',
]);

const containsStreetNumber = (value?: string | null): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return false;
  }

  const candidatePattern = /\b\d{1,6}[A-Za-z]?(?:[-\s]\d{1,6}[A-Za-z]?)?\s+(?:[A-Za-z0-9.'-]+\s*){1,4}/gi;
  let match: RegExpExecArray | null;

  while ((match = candidatePattern.exec(normalized)) !== null) {
    const snippet = match[0].toLowerCase();
    const words = snippet.split(/\s+/).filter(Boolean);

    if (words.length < 2) {
      continue;
    }

    const secondWord = words[1].replace(/[^a-z0-9]/g, '');
    if (NON_ADDRESS_FOLLOWING_WORDS.has(secondWord)) {
      continue;
    }

    const hasSuffix = words.some(word => STREET_SUFFIX_KEYWORDS.has(word.replace(/[^a-z]/g, '')));
    if (hasSuffix) {
      return true;
    }

    if (words.length >= 3) {
      return true;
    }
  }

  return false;
};

const decodePolyline = (encoded: string): LatLng[] => {
  const points: LatLng[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    latitude += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    longitude += deltaLng;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
};

const computeArcPath = (start: LatLng, end: LatLng): LatLng[] => {
  const toRadians = Math.PI / 180;
  const midLat = (start.latitude + end.latitude) / 2;
  const midLon = (start.longitude + end.longitude) / 2;
  const cosMid = Math.max(Math.cos(midLat * toRadians), 0.0001);

  const rawDeltaLon = end.longitude - start.longitude;
  const deltaLat = end.latitude - start.latitude;
  const adjustedDeltaLon = rawDeltaLon * cosMid;
  const planarDistance = Math.hypot(deltaLat, adjustedDeltaLon);

  if (planarDistance < 1e-6) {
    return [start, end];
  }

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const curvature = clamp(planarDistance * 0.75, 0.05, 0.28);
  const perpendicularLat = -adjustedDeltaLon;
  const perpendicularLonAdjusted = deltaLat;
  const perpendicularLength = Math.hypot(perpendicularLat, perpendicularLonAdjusted) || 1;

  const controlLat = midLat + (perpendicularLat / perpendicularLength) * curvature;
  const controlLon = midLon + (perpendicularLonAdjusted / perpendicularLength) * (curvature / cosMid);

  const segments = clamp(Math.round(planarDistance * 160), 24, 80);
  const points: LatLng[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const oneMinusT = 1 - t;
    const latitude =
      oneMinusT * oneMinusT * start.latitude +
      2 * oneMinusT * t * controlLat +
      t * t * end.latitude;
    const longitude =
      oneMinusT * oneMinusT * start.longitude +
      2 * oneMinusT * t * controlLon +
      t * t * end.longitude;

    points.push({ latitude, longitude });
  }

  return points;
};

const ensureRouteEndpoints = (path: LatLng[], start: LatLng, end: LatLng): LatLng[] => {
  const threshold = 0.00005;
  const adjusted = path.length > 0 ? [...path] : [];

  const alignPoint = (points: LatLng[], target: LatLng, position: 'start' | 'end') => {
    if (points.length === 0) {
      points.push(target);
      return;
    }

    const index = position === 'start' ? 0 : points.length - 1;
    const candidate = points[index];
    const distance = Math.hypot(candidate.latitude - target.latitude, candidate.longitude - target.longitude);

    if (distance > threshold) {
      if (position === 'start') {
        points.unshift(target);
      } else {
        points.push(target);
      }
    } else {
      points[index] = target;
    }
  };

  if (adjusted.length === 0) {
    return [start, end];
  }

  alignPoint(adjusted, start, 'start');
  alignPoint(adjusted, end, 'end');

  if (adjusted.length === 1) {
    adjusted.push(end);
  }

  return adjusted;
};

const cloneSelectedLocation = (location: SelectedLocation | null): SelectedLocation | null => {
  if (!location) {
    return null;
  }

  return {
    description: location.description,
    coordinate: {
      latitude: location.coordinate.latitude,
      longitude: location.coordinate.longitude,
    },
  };
};

const cloneAttachments = (items: AttachmentAsset[]): AttachmentAsset[] =>
  items.map(item => ({ ...item }));

const LocationAutocompleteInput = React.memo<LocationAutocompleteInputProps>(
  ({
    value,
    placeholder,
    onChangeText,
    onSelectSuggestion,
    onClear,
    suggestions,
    loading,
    currentLocationOption,
    onSuggestionsVisibilityChange,
  }) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasInput = value.trim().length > 0;
    const shouldShowSuggestions =
      isFocused && hasInput && (loading || Boolean(currentLocationOption) || suggestions.length > 0);

    useEffect(() => {
      if (onSuggestionsVisibilityChange) {
        onSuggestionsVisibilityChange(shouldShowSuggestions);
      }
    }, [onSuggestionsVisibilityChange, shouldShowSuggestions]);

    return (
      <View style={styles.autocompleteWrapper}>
        <View style={styles.autocompleteInputRow}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#7C7160"
            style={styles.autocompleteInput}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={placeholder}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
          {value.length > 0 && (
            <Pressable onPress={onClear} accessibilityLabel={`Clear ${placeholder}`} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          )}
        </View>
        {shouldShowSuggestions && (
          <View style={styles.autocompleteSuggestions}>
            {loading ? (
              <View
                style={[
                  styles.autocompleteSuggestion,
                  styles.autocompleteLoadingRow,
                  !(Boolean(currentLocationOption) || suggestions.length > 0) && styles.autocompleteSuggestionLast,
                ]}
              >
                <ActivityIndicator size="small" color="#0c4309" />
                <Text style={styles.autocompleteLoadingText}>Searching...</Text>
              </View>
            ) : null}
            {loading && (Boolean(currentLocationOption) || suggestions.length > 0) ? (
              <View style={styles.autocompleteSuggestionDivider} />
            ) : null}
            {currentLocationOption ? (
              <Pressable
                key={currentLocationOption.id}
                style={[
                  styles.autocompleteSuggestion,
                  styles.autocompleteSuggestionCurrent,
                  !(suggestions.length > 0) && styles.autocompleteSuggestionLast,
                  currentLocationOption.disabled && styles.autocompleteSuggestionDisabled,
                ]}
                accessibilityLabel={`${currentLocationOption.primaryText}${currentLocationOption.secondaryText ? `, ${currentLocationOption.secondaryText}` : ''}`}
                disabled={currentLocationOption.disabled}
                onPress={() => {
                  if (currentLocationOption.disabled) {
                    return;
                  }
                  setIsFocused(false);
                  Keyboard.dismiss();
                  currentLocationOption.onSelect();
                }}
              >
                <View style={styles.currentLocationTextWrapper}>
                  <Text style={styles.autocompleteSuggestionPrimary}>{currentLocationOption.primaryText}</Text>
                  {currentLocationOption.secondaryText ? (
                    <Text style={styles.autocompleteSuggestionSecondary} numberOfLines={2}>
                      {currentLocationOption.secondaryText}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            {currentLocationOption && suggestions.length > 0 ? (
              <View style={styles.autocompleteSuggestionDivider} />
            ) : null}
            {suggestions.map((suggestion, index) => (
              <Pressable
                key={suggestion.id}
                style={[
                  styles.autocompleteSuggestion,
                  index === suggestions.length - 1 && styles.autocompleteSuggestionLast,
                ]}
                onPress={() => {
                  setIsFocused(false);
                  Keyboard.dismiss();
                  onSelectSuggestion(suggestion);
                }}
              >
                <Text style={styles.autocompleteSuggestionPrimary}>{suggestion.primaryText}</Text>
                {suggestion.secondaryText ? (
                  <Text style={styles.autocompleteSuggestionSecondary}>{suggestion.secondaryText}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  },
);

LocationAutocompleteInput.displayName = 'LocationAutocompleteInput';

export default function Moving() {
  const { user, setReturnTo, getReturnTo, clearReturnTo } = useAuth();
  const { showModal } = useModal();
  const params = useLocalSearchParams<{ editServiceId?: string | string[]; editService?: string | string[] }>();
  const editServiceId = useMemo(() => {
    const raw = params.editServiceId;
    if (!raw) {
      return null;
    }

    if (Array.isArray(raw)) {
      return raw[0] ?? null;
    }

    return raw;
  }, [params.editServiceId]);

  const editingPayload = useMemo<EditServicePayload | null>(() => {
    const raw = params.editService;
    const value = Array.isArray(raw) ? raw[0] : raw;

    if (!value) {
      return null;
    }

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

  const googlePlacesApiKey = useMemo(resolveGooglePlacesKey, []);
  const openAiApiKey = useMemo(resolveOpenAIApiKey, []);
  const mapRef = useRef<MapView | null>(null);
  const startDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationSnapshotRef = useRef<{
    startQuery: string;
    endQuery: string;
    startLocation: SelectedLocation | null;
    endLocation: SelectedLocation | null;
  } | null>(null);
  const [startSessionToken, setStartSessionToken] = useState(createSessionToken);
  const [endSessionToken, setEndSessionToken] = useState(createSessionToken);
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startSuggestions, setStartSuggestions] = useState<PlaceSuggestion[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<PlaceSuggestion[]>([]);
  const [startLoading, setStartLoading] = useState(false);
  const [endLoading, setEndLoading] = useState(false);
  const [isEndSuggestionsVisible, setIsEndSuggestionsVisible] = useState(false);
  const [startLocation, setStartLocation] = useState<SelectedLocation | null>(null);
  const [endLocation, setEndLocation] = useState<SelectedLocation | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionStatus>(
    PermissionStatus.UNDETERMINED,
  );
  const [currentLocation, setCurrentLocation] = useState<SelectedLocation | null>(null);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);
  const [currentLocationLoadingTarget, setCurrentLocationLoadingTarget] = useState<'start' | 'end' | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [description, setDescription] = useState('');
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
  const [attachments, setAttachments] = useState<AttachmentAsset[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLookupError, setCustomerLookupError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [pendingResumeAction, setPendingResumeAction] = useState<null | 'schedule-moving'>(null);
  const [showMovingAnalysisModal, setShowMovingAnalysisModal] = useState(false);
  const [apartmentSize, setApartmentSize] = useState('');
  const [packingStatus, setPackingStatus] = useState<'packed' | 'not-packed' | ''>('');
  const [truckNeeded, setTruckNeeded] = useState<'yes' | 'no' | ''>('');
  const [boxesNeeded, setBoxesNeeded] = useState<'yes' | 'no' | ''>('');
  const [currentQuestionStep, setCurrentQuestionStep] = useState(0);
  const [furnitureScope, setFurnitureScope] = useState('');
  const [needsTruck, setNeedsTruck] = useState<'yes' | 'no' | ''>('');
  const voicePulseValue = useRef(new Animated.Value(1)).current;
  const voicePulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const collectFormState = useCallback((): MovingFormState => {
    return {
      startQuery,
      endQuery,
      startLocation: cloneSelectedLocation(startLocation),
      endLocation: cloneSelectedLocation(endLocation),
      description,
      isAuto,
      isPersonal,
      priceQuote,
      priceNote,
      priceError,
      attachments: cloneAttachments(attachments),
      apartmentSize,
      packingStatus,
      needsTruck,
      boxesNeeded,
      furnitureScope,
    };
  }, [
    apartmentSize,
    attachments,
    boxesNeeded,
    description,
    endLocation,
    endQuery,
    furnitureScope,
    isAuto,
    isPersonal,
    needsTruck,
    packingStatus,
    priceError,
    priceNote,
    priceQuote,
    startLocation,
    startQuery,
  ]);

  const restoreFormState = useCallback(
    (formState: MovingFormState) => {
      setStartQuery(formState.startQuery ?? '');
      setEndQuery(formState.endQuery ?? '');
      setStartLocation(cloneSelectedLocation(formState.startLocation ?? null));
      setEndLocation(cloneSelectedLocation(formState.endLocation ?? null));
  setDescription(formState.description ?? '');

  const nextIsAuto = Boolean(formState.isAuto);
  setIsAuto(nextIsAuto);
  slideAnimation.setValue(nextIsAuto ? 1 : 0);

  const nextIsPersonal = Boolean(formState.isPersonal);
  setIsPersonal(nextIsPersonal);
  slideAnimation2.setValue(nextIsPersonal ? 0 : 1);
      setPriceQuote(formState.priceQuote ?? null);
      setPriceNote(formState.priceNote ?? null);
      setPriceError(formState.priceError ?? null);
      setAttachments(cloneAttachments(formState.attachments ?? []));
      setApartmentSize(formState.apartmentSize ?? '');
      setPackingStatus(formState.packingStatus ?? '');
      setNeedsTruck(formState.needsTruck ?? '');
      setBoxesNeeded(formState.boxesNeeded ?? '');
      setFurnitureScope(formState.furnitureScope ?? '');
    },
    [slideAnimation, slideAnimation2],
  );

  const preserveFormForAuth = useCallback(() => {
    const formState = collectFormState();
    const sanitizedEntries: Array<[string, string]> = [];

    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          sanitizedEntries.push([key, trimmed]);
        }
        return;
      }

      if (Array.isArray(value)) {
        const candidate = value.find(item => typeof item === 'string' && item.trim().length > 0);
        if (typeof candidate === 'string') {
          sanitizedEntries.push([key, candidate.trim()]);
        }
      }
    });

    const payload: MovingReturnData = {
      formState,
      action: 'schedule-moving',
      timestamp: Date.now(),
    };

    if (sanitizedEntries.length > 0) {
      payload.params = Object.fromEntries(sanitizedEntries);
    }

    setReturnTo(MOVING_RETURN_PATH, payload);
  }, [collectFormState, params, setReturnTo]);

  const mapEdgePadding = useMemo(
    () => ({ top: 60, right: 36, bottom: 220, left: 36 }),
    [],
  );

  const defaultRegion = useMemo(
    () => ({
      latitude: 40.7128,
      longitude: -74.006,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    }),
    [],
  );

  const formatLocationDescription = useCallback((address?: Location.LocationGeocodedAddress) => {
    if (!address) {
      return undefined;
    }

    const streetLine =
      address.name ||
      [address.streetNumber, address.street].filter(Boolean).join(' ').trim() ||
      address.street ||
      undefined;

    const locality = address.city || address.subregion || undefined;
    const region = address.region || undefined;
    const parts = [streetLine, locality, region].filter(Boolean) as string[];

    if (address.postalCode && !parts.includes(address.postalCode)) {
      parts.push(address.postalCode);
    }

    if (address.country && !parts.includes(address.country)) {
      parts.push(address.country);
    }

    if (parts.length > 0) {
      return parts.join(', ');
    }

    return undefined;
  }, []);

  const loadCurrentLocation = useCallback(
    async (options: { target?: 'start' | 'end'; silent?: boolean } = {}): Promise<SelectedLocation | null> => {
      const { target, silent } = options;
      if (!silent) {
        if (target) {
          setCurrentLocationLoadingTarget(target);
        }
        setCurrentLocationLoading(true);
      }

      try {
        let status = locationPermissionStatus;
        const foregroundPermission = await Location.getForegroundPermissionsAsync();
        status = foregroundPermission.status;
        setLocationPermissionStatus(foregroundPermission.status);

        if (status !== PermissionStatus.GRANTED) {
          const permission = await Location.requestForegroundPermissionsAsync();
          status = permission.status;
          setLocationPermissionStatus(permission.status);

          if (permission.status !== PermissionStatus.GRANTED) {
            return null;
          }
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
          coordinate: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        };

        setCurrentLocation(resolved);
        return resolved;
      } catch (error) {
        console.warn('Unable to retrieve current location', error);
        return null;
      } finally {
        if (!silent) {
          setCurrentLocationLoading(false);
          if (target) {
            setCurrentLocationLoadingTarget(prev => (prev === target ? null : prev));
          }
        }
      }
    },
    [formatLocationDescription, locationPermissionStatus],
  );

  const geocodeAddress = useCallback(async (address: string): Promise<SelectedLocation | null> => {
    const trimmed = address?.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const results = await Location.geocodeAsync(trimmed);
      const first = results?.[0];

      if (first) {
        return {
          description: trimmed,
          coordinate: {
            latitude: first.latitude,
            longitude: first.longitude,
          },
        };
      }
    } catch (error) {
      console.warn('Failed to geocode address for edit prefill:', error);
    }

    return null;
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }

        setLocationPermissionStatus(status);

        if (status === PermissionStatus.GRANTED) {
          await loadCurrentLocation({ silent: true });
        }
      } catch (error) {
        if (isMounted) {
          console.warn('Failed to check location permissions', error);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loadCurrentLocation]);

  // Restore service details after sign-in
  useEffect(() => {
    if (!user) {
      return;
    }

    const returnTo = getReturnTo();
    if (!returnTo || returnTo.path !== MOVING_RETURN_PATH || !returnTo.data) {
      return;
    }

    const payload = returnTo.data as MovingReturnData;

    if (!payload?.formState) {
      clearReturnTo();
      return;
    }

    restoreFormState(payload.formState);
    clearReturnTo();

    if (payload.action === 'schedule-moving') {
      setPendingResumeAction('schedule-moving');
    }
  }, [user, getReturnTo, clearReturnTo, restoreFormState]);

  useEffect(() => {
    if (user) {
      setShowSignInModal(false);
    }
  }, [user]);


  const applyLocation = useCallback(
    (
      target: 'start' | 'end',
      location: SelectedLocation,
      options: { showStreetNumberWarning?: boolean } = {},
    ) => {
      if (!isWithinServiceArea(location.coordinate)) {
        showModal({
          title: 'Outside of Service Area',
          message: "Helpr currently serves NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick an address in these areas if you wish to continue.",
        });
        return;
      }

      resetPriceState();

      const shouldWarn = options.showStreetNumberWarning ?? true;
      const hasStreetNumber = containsStreetNumber(location.description);

      if (target === 'start') {
        setStartQuery(location.description);
        setStartLocation(location);
        setStartSuggestions([]);
        setStartSessionToken(createSessionToken());
        setStartLoading(false);
      } else {
        setEndQuery(location.description);
        setEndLocation(location);
        setEndSuggestions([]);
        setEndSessionToken(createSessionToken());
        setEndLoading(false);
      }

      if (shouldWarn && !hasStreetNumber) {
        const isStart = target === 'start';
        showModal({
          title: isStart ? 'Add street number to start location' : 'Add street number to end location',
          message: isStart
            ? 'Update your start location to include the street number.'
            : 'Update your end location to include the street number.',
        });
      }
    },
    [resetPriceState, showModal],
  );

  const resetMovingAnalysisFlow = useCallback(() => {
    setShowMovingAnalysisModal(false);
    setCurrentQuestionStep(0);
    setApartmentSize('');
    setFurnitureScope('');
    setPackingStatus('');
    setNeedsTruck('');
    setBoxesNeeded('');
  }, []);

  const handleUseCurrentLocation = useCallback(
    async (target: 'start' | 'end') => {
      const existingLocation =
        locationPermissionStatus === PermissionStatus.GRANTED && currentLocation
          ? currentLocation
          : null;

      if (existingLocation && !currentLocationLoading) {
        applyLocation(target, existingLocation);
        return;
      }

      const resolved = await loadCurrentLocation({ target });
      if (resolved) {
        applyLocation(target, resolved);
      }
    },
    [applyLocation, currentLocation, currentLocationLoading, loadCurrentLocation, locationPermissionStatus],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const coordinates = [startLocation, endLocation]
      .filter((location): location is SelectedLocation => Boolean(location))
      .map(location => location.coordinate);

    if (coordinates.length === 0) {
      return;
    }

    if (coordinates.length === 1) {
      map.animateToRegion(
        {
          latitude: coordinates[0].latitude,
          longitude: coordinates[0].longitude,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        },
        300,
      );
      return;
    }

    map.fitToCoordinates(coordinates, {
      edgePadding: mapEdgePadding,
      animated: true,
    });
  }, [endLocation, mapEdgePadding, startLocation]);

  useEffect(() => {
    if (isRecording) {
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

    return () => {
      voicePulseAnimationRef.current?.stop();
    };
  }, [isRecording, voicePulseValue]);

  useEffect(() => {
    return () => {
      // Stop all animations on unmount
      voicePulseAnimationRef.current?.stop();
      slideAnimationRef.current?.stop();
      slideAnimation2Ref.current?.stop();
      
      const currentRecording = recordingRef.current;
      if (currentRecording) {
        currentRecording.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, []);

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

        if (cancelled) {
          return;
        }

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

    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  useEffect(() => {
    if (!editingPayload || !editServiceId) {
      return;
    }

    const nextIsAuto = (editingPayload.autofill_type ?? 'AutoFill').toLowerCase() !== 'custom';
    const nextIsPersonal = (editingPayload.payment_method_type ?? 'Personal').toLowerCase() !== 'business';

  setIsAuto(nextIsAuto);
  slideAnimation.setValue(nextIsAuto ? 1 : 0);

    setIsPersonal(nextIsPersonal);
    slideAnimation2.setValue(nextIsPersonal ? 0 : 1);

    if (typeof editingPayload.price === 'number' && Number.isFinite(editingPayload.price)) {
      setPriceQuote(formatCurrency(editingPayload.price));
    } else {
      setPriceQuote(null);
    }

    if (typeof editingPayload.description === 'string') {
      const trimmed = editingPayload.description.trim();
      setDescription(trimmed);
    } else {
      setDescription('');
    }

    setPriceNote(null);
    setPriceError(null);

    let cancelled = false;

    const hydrateLocations = async () => {
      const startAddress = editingPayload.start_location?.trim();
      const endAddress = editingPayload.end_location?.trim();

      if (startAddress) {
        const startResolved = await geocodeAddress(startAddress);
        if (cancelled) {
          return;
        }

        if (startResolved) {
          applyLocation('start', startResolved, { showStreetNumberWarning: false });
        } else {
          setStartQuery(startAddress);
          setStartLocation(null);
        }
      } else {
        setStartQuery('');
        setStartLocation(null);
      }

      if (endAddress) {
        const endResolved = await geocodeAddress(endAddress);
        if (cancelled) {
          return;
        }

        if (endResolved) {
          applyLocation('end', endResolved, { showStreetNumberWarning: false });
        } else {
          setEndQuery(endAddress);
          setEndLocation(null);
        }
      } else {
        setEndQuery('');
        setEndLocation(null);
      }
    };

    hydrateLocations();

    return () => {
      cancelled = true;
    };
  }, [applyLocation, editServiceId, editingPayload, geocodeAddress, slideAnimation, slideAnimation2]);

  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    resetPriceState();
  }, [resetPriceState]);

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

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You are a pricing assistant for moving services. Respond with a JSON object containing a price field. Keep prices in USD, realistic, and constrain price between 200 and 1800 for jobs requiring transportation between locations. Ensure that any moving services going from one place to another are at least $200 without truck and at least $350 if truck is needed. Start around these two prices for studio/1BR jobs in close proximity to each other and increase accordingly for larger places. Make sure a 2BR for the same job should be significantly more than a 1BR. Provide optimistic, budget-friendly estimates and, when in doubt, lean toward the lower end of the acceptable price range. Take the distance between start and end locations into account when estimating prices. Make sure that there is a significant difference between jobs requiring a moving truck and those not requiring it. Take the size of the apartment and whether the customer requires help packing into consideration. Make extra sure all of these criteria are met.',
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
          }),
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
        } catch (error) {
          throw new Error('Unable to parse price estimate');
        }

        const price = Number(parsed.price);

        if (!Number.isFinite(price)) {
          throw new Error('Invalid price value');
        }

        const sanitizedPrice = Math.max(0, Math.round(price));

        setPriceQuote(formatCurrency(sanitizedPrice));
      } catch (error) {
        console.warn('Failed to fetch price estimate', error);
        setPriceError('Unable to estimate price right now.');
      } finally {
        setIsPriceLoading(false);
      }
    },
    [openAiApiKey],
  );

  const handleDescriptionSubmit = useCallback(() => {
    if (isPriceLoading || isTranscribing) {
      return;
    }

    const trimmed = description.trim();

    if (trimmed.length === 0) {
      setPriceQuote(null);
      setPriceNote(null);
      setPriceError('Add a brief task description to see a price.');
      return;
    }

    if (!startLocation || !endLocation) {
      showModal({
        title: 'Missing locations',
        message: 'Please enter start and end location.',
      });
      return;
    }

    Keyboard.dismiss();
    fetchPriceEstimate(trimmed, { start: startLocation, end: endLocation });
  }, [description, endLocation, fetchPriceEstimate, isPriceLoading, isTranscribing, showModal, startLocation]);

  const analyzeMovingDescription = useCallback((text: string) => {
    const lowerText = text.toLowerCase();

    const spelledOutBedroomPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple)\s*(?:-|\s)?\s*(bedroom|bed|br|room|apt|apartment)s?\b/;

    const hasApartmentSize = /\b(\d+)\s*(bedroom|br|room|apt|apartment)\b/i.test(lowerText) ||
      /\b(studio|1br|2br|3br|4br|5br)\b/i.test(lowerText) ||
      spelledOutBedroomPattern.test(lowerText);

    const hasPackingStatus = /\b(pack|packed|packing|unpack|unpacked|unpacking)\b/i.test(lowerText);

    const hasTruckInfo = /\b(truck|moving truck|rental truck|vehicle|car|van)\b/i.test(lowerText);

    const hasBoxInfo = /\b(box|boxes|packing supplies|supplies)\b/i.test(lowerText);

    const hasFurnitureScope = /\b(everything|entire|whole|all|complete)\b/i.test(lowerText) ||
      /\b(furniture|bedroom|living room|kitchen|dining room|office)\b/i.test(lowerText) ||
      /\b(specific pieces|pieces|items|only)\b/i.test(lowerText) ||
      /\b(moving scope|scope)\b/i.test(lowerText);

    const descriptionHasStreetNumber = containsStreetNumber(text);

    const startAddressCandidates = [startQuery, startLocation?.description];
    const endAddressCandidates = [endQuery, endLocation?.description];

    const hasStartStreetNumber = startAddressCandidates.some(candidate => containsStreetNumber(candidate));
    const hasEndStreetNumber = endAddressCandidates.some(candidate => containsStreetNumber(candidate));

    const hasStartInput = startAddressCandidates.some(candidate => typeof candidate === 'string' && candidate.trim().length > 0);
    const hasEndInput = endAddressCandidates.some(candidate => typeof candidate === 'string' && candidate.trim().length > 0);

    const missingStreetNumberTargets: Array<'start' | 'end'> = [];
    if (hasStartInput && !hasStartStreetNumber) {
      missingStreetNumberTargets.push('start');
    }
    if (hasEndInput && !hasEndStreetNumber) {
      missingStreetNumberTargets.push('end');
    }

    const hasStreetNumber = missingStreetNumberTargets.length === 0 && (!hasStartInput || hasStartStreetNumber) && (!hasEndInput || hasEndStreetNumber);

    return {
      hasApartmentSize,
      hasPackingStatus,
      hasTruckInfo,
      hasBoxInfo,
      hasFurnitureScope,
      hasStreetNumber: hasStreetNumber || (!hasStartInput && !hasEndInput && descriptionHasStreetNumber),
      hasStartStreetNumber,
      hasEndStreetNumber,
      missingStreetNumberTargets,
      isPacked: hasPackingStatus && /\b(packed|packing)\b/i.test(lowerText),
    };
  }, [endLocation?.description, endQuery, startLocation?.description, startQuery]);

  const movingAnalysis = useMemo(() => {
    const analysis = analyzeMovingDescription(description);

    const shouldAskPacking = !analysis.hasPackingStatus;
    const shouldAskBoxes = (analysis.hasPackingStatus && !analysis.isPacked && !analysis.hasBoxInfo) || (!analysis.hasPackingStatus && packingStatus === 'not-packed');

    const missingInfo: string[] = [];

    if (analysis.missingStreetNumberTargets.includes('start')) missingInfo.push('start street number');
    if (analysis.missingStreetNumberTargets.includes('end')) missingInfo.push('end street number');
    if (!analysis.hasApartmentSize) missingInfo.push('apartment size');
    if (shouldAskPacking) missingInfo.push('packing status');
    if (!analysis.hasTruckInfo) missingInfo.push('truck');
    if (shouldAskBoxes) missingInfo.push('boxes');

    // Determine which questions to show
    const questionsToShow: Array<{ id: string; title: string; message: string; placeholder: string; multiline?: boolean; options?: string[] }> = [];

    if (shouldAskPacking) {
      questionsToShow.push({
        id: 'packingStatus',
        title: 'Do you need help packing?',
        message: 'Let your helpr know if you need your things packed into boxes.',
        placeholder: 'Select yes or no',
        options: ['packed', 'not-packed'],
      });
    }

    if (!analysis.hasTruckInfo) {
      questionsToShow.push({
        id: 'needsTruck',
        title: 'Do you need a moving truck?',
        message: 'This helps us determine the right equipment and pricing.',
        placeholder: 'Select yes or no',
        options: ['yes', 'no']
      });
    }

    if (shouldAskBoxes) {
      questionsToShow.push({
        id: 'boxesNeeded',
        title: 'Do you need boxes?',
        message: 'Let your helpr know if they should bring moving boxes.',
        placeholder: 'Select yes or no',
        options: ['yes', 'no'],
      });
    }
    
    // Check both description and state for apartment size
    if (!analysis.hasApartmentSize && !apartmentSize.trim()) {
      questionsToShow.push({
        id: 'apartmentSize',
        title: 'How big is your apartment?',
        message: 'This will help us determine the best price for your service.',
        placeholder: 'e.g., 1BR, 2BR, 3BR, Studio'
      });
    }
    
    // Check both description and state for furniture scope
    if (!analysis.hasFurnitureScope && !furnitureScope.trim()) {
      questionsToShow.push({
        id: 'furnitureScope',
        title: 'How much furniture do you need moved?',
        message: 'Describe what furniture and items you need moved.',
        placeholder: 'e.g., everything, bedroom furniture only, living room and kitchen',
        multiline: true
      });
    }
    
    return {
      ...analysis,
      shouldAskPacking,
      shouldAskBoxes,
      missingInfo,
      questionsToShow,
    };
  }, [analyzeMovingDescription, description, packingStatus, apartmentSize, furnitureScope]);

  const handleMovingAnalysisSubmit = useCallback(() => {
    const analysis = analyzeMovingDescription(description);

    if (!analysis.hasStreetNumber) {
      const needsBoth = analysis.missingStreetNumberTargets.length === 2;
      const target = analysis.missingStreetNumberTargets[0] ?? 'start';

      showModal({
        title: needsBoth ? 'Add street numbers' : target === 'start' ? 'add an exact street number for your starting location' : 'add an exact street number for your ending location',
        message: needsBoth
          ? 'Update both pickup and drop-off locations to include street numbers so your helpr can find you.'
          : target === 'start'
            ? 'Update your pickup location to include the street number so your helpr can find you.'
            : 'Update your drop-off location to include the street number so your helpr can finish the move.',
      });
      return;
    }
    
    const needsBoxesQuestion = (analysis.hasPackingStatus && !analysis.isPacked && !analysis.hasBoxInfo) || (!analysis.hasPackingStatus && packingStatus === 'not-packed');
    
    // Check if we need to show the modal - also check state variables
    const needsModal = !analysis.hasPackingStatus || !analysis.hasTruckInfo || needsBoxesQuestion || (!analysis.hasApartmentSize && !apartmentSize.trim()) || (!analysis.hasFurnitureScope && !furnitureScope.trim());
    
    if (needsModal) {
      setCurrentQuestionStep(0); // Start with first question
      setShowMovingAnalysisModal(true);
      return;
    }
    
    // If everything is covered, proceed with price estimation
    handleDescriptionSubmit();
  }, [analyzeMovingDescription, description, handleDescriptionSubmit, packingStatus, showModal, apartmentSize, furnitureScope]);

  const handleAnalysisModalSubmit = useCallback(() => {
    const currentQuestion = movingAnalysis.questionsToShow[currentQuestionStep];
    
    if (currentQuestionStep < movingAnalysis.questionsToShow.length - 1) {
      // Move to next question
      setCurrentQuestionStep(currentQuestionStep + 1);
    } else {
      // All questions answered, update description and close modal
      let updatedDescription = description;
      
      if (needsTruck) {
        updatedDescription += `\n\nNeeds truck: ${needsTruck === 'yes' ? 'Yes' : 'No'}`;
      }

      if (packingStatus) {
        const packingSummary = packingStatus === 'packed' ? 'Everything is already packed' : 'Needs help packing';
        updatedDescription += `\n\nPacking status: ${packingSummary}`;
      }

      if (boxesNeeded) {
        const boxesSummary = boxesNeeded === 'yes' ? 'Please bring moving boxes' : 'Customer already has boxes';
        updatedDescription += `\n\nBoxes: ${boxesSummary}`;
      }
      
      if (apartmentSize.trim()) {
        updatedDescription += `\n\nApartment size: ${apartmentSize.trim()}`;
      }
      
      if (furnitureScope.trim()) {
        updatedDescription += `\n\nFurniture scope: ${furnitureScope.trim()}`;
      }
      
      setDescription(updatedDescription);
      resetMovingAnalysisFlow();
      
      // Now proceed with price estimation
      setTimeout(() => {
        handleDescriptionSubmit();
      }, 100);
    }
  }, [apartmentSize, boxesNeeded, currentQuestionStep, description, furnitureScope, handleDescriptionSubmit, movingAnalysis.questionsToShow, needsTruck, packingStatus, resetMovingAnalysisFlow]);

  const handleAnalysisModalBack = useCallback(() => {
    if (currentQuestionStep === 0) {
      resetMovingAnalysisFlow();
      return;
    }

    setCurrentQuestionStep(prev => Math.max(0, prev - 1));
  }, [currentQuestionStep, resetMovingAnalysisFlow]);

  const resolveCustomerId = useCallback(async () => {
    if (customerId) {
      return customerId;
    }

    if (!user?.email) {
      return null;
    }

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

  const handleMediaUpload = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showModal({
          title: 'Permission needed',
          message: 'Enable photo library access to attach images or videos.',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (result.canceled || !(result.assets && result.assets.length > 0)) {
        return;
      }

      const asset = result.assets[0];
      const type = asset.type === 'video' ? 'video' : 'photo';
      const name = asset.fileName ?? (type === 'video' ? 'video-upload.mp4' : 'photo-upload.jpg');

      setAttachments(prev => [...prev, { uri: asset.uri, type, name }]);
    } catch (error) {
      console.warn('Media picker error', error);
      showModal({
        title: 'Upload failed',
        message: 'Unable to select media right now.',
      });
    }
  }, [showModal]);

  const snapshotLocations = useCallback(() => {
    locationSnapshotRef.current = {
      startQuery,
      endQuery,
      startLocation,
      endLocation,
    };
  }, [endLocation, endQuery, startLocation, startQuery]);

  const restoreLocations = useCallback(() => {
    const snapshot = locationSnapshotRef.current;
    if (!snapshot) {
      return;
    }

    setStartQuery(snapshot.startQuery);
    setEndQuery(snapshot.endQuery);
    setStartLocation(snapshot.startLocation);
    setEndLocation(snapshot.endLocation);
  }, []);

  const handleScheduleHelpr = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedDescription = description.trim();

    if (trimmedDescription.length === 0) {
      snapshotLocations();
      showModal({
        title: 'Add a description',
        message: 'Please describe what you need help with before scheduling your moving service.',
        onDismiss: restoreLocations,
      });
      return;
    }

    if (!startLocation || !endLocation) {
      showModal({
        title: 'Add locations',
        message: 'Please provide both start and end locations before scheduling.',
      });
      return;
    }

    if (!isWithinServiceArea(startLocation.coordinate) || !isWithinServiceArea(endLocation.coordinate)) {
      showModal({
        title: 'We\'re not in your area yet.',
        message: "Helpr currently operates in NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick addresses within this area to continue.",
      });
      return;
    }

    const priceDigitsRaw = priceQuote?.replace(/[^0-9.]/g, '') ?? '';
    const priceValue = priceDigitsRaw.length > 0 ? Number(priceDigitsRaw) : null;
    const sanitizedPrice = Number.isFinite(priceValue ?? NaN) ? priceValue : null;

    if (sanitizedPrice === null) {
      showModal({
        title: 'Estimate needed',
        message: 'Request a quick price estimate before scheduling your moving service.',
      });
      return;
    }

    const missingStreetTargets: Array<'start' | 'end'> = [];
    if (!containsStreetNumber(startLocation.description)) {
      missingStreetTargets.push('start');
    }
    if (!containsStreetNumber(endLocation.description)) {
      missingStreetTargets.push('end');
    }

    if (missingStreetTargets.length > 0) {
      const needsBoth = missingStreetTargets.length === 2;
      const title = needsBoth ? 'Add street numbers' : missingStreetTargets[0] === 'start' ? 'Add pickup street number' : 'Add drop-off street number';
      const message = needsBoth
        ? 'Update both pickup and drop-off locations to include street numbers before scheduling.'
        : missingStreetTargets[0] === 'start'
          ? 'Update your pickup location to include the street number.'
          : 'Update your drop-off location to include the street number.';

      showModal({
        title,
        message,
      });
      return;
    }

    if (!user) {
      preserveFormForAuth();
      setShowSignInModal(true);
      return;
    }

    if (isEditing && !editServiceId) {
      showModal({
        title: 'Unable to edit',
        message: 'We could not determine which service to update.',
      });
      return;
    }

    if (!isEditing && customerLookupError) {
      console.warn('Retrying customer lookup after previous error:', customerLookupError);
    }

    let resolvedCustomerIdValue = customerId;

    if (!isEditing) {
      const resolvedCustomerId = await resolveCustomerId();

      if (!resolvedCustomerId) {
        showModal({
          title: 'Account issue',
          message: 'We could not find your customer profile. Please try again.',
        });
        return;
      }

      resolvedCustomerIdValue = resolvedCustomerId;
    }

  const normalizedDescription = trimmedDescription;
    const paymentMethodType = isPersonal ? 'Personal' : 'Business';
    const autofillType = isAuto ? 'AutoFill' : 'Custom';
    const targetServiceId = isEditing && editServiceId ? editServiceId : createUuid();

    try {
      setIsSubmitting(true);

      if (isEditing && editServiceId) {
        const updatePayload: Record<string, unknown> = {
          start_location: startLocation.description,
          end_location: endLocation.description,
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
          console.error('Failed to update moving service:', error);
          showModal({
            title: 'Update failed',
            message: 'Unable to save changes to your moving request. Please try again.',
          });
          return;
        }

        router.push({
          pathname: 'booked-services' as any,
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
        service_type: 'Moving',
        status: 'finding_pros',
        scheduling_type: null,
        location: null,
        start_location: startLocation.description,
        end_location: endLocation.description,
        price: sanitizedPrice,
        start_datetime: null,
        end_datetime: null,
        payment_method_type: paymentMethodType,
        autofill_type: autofillType,
        service_provider_id: null,
        scheduled_date_time: null,
        description: normalizedDescription,
      };

      // Don't insert yet - let booked-services.tsx handle the insert when scheduling is confirmed
      router.push({
        pathname: 'booked-services' as any,
        params: {
          showOverlay: 'true',
          temporaryService: encodeURIComponent(JSON.stringify(payload)),
        },
      });
    } catch (error) {
      console.error('Unexpected scheduling error:', error);
      showModal({
        title: 'Scheduling failed',
        message: 'An unexpected error occurred. Please try again.',
      });
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
    endLocation,
    isAuto,
    isEditing,
    isPersonal,
    isSubmitting,
    priceQuote,
    preserveFormForAuth,
    resolveCustomerId,
    router,
    snapshotLocations,
    restoreLocations,
    startLocation,
    user,
  ]);

  useEffect(() => {
    if (!user || pendingResumeAction !== 'schedule-moving' || isSubmitting) {
      return;
    }

    const timeout = setTimeout(() => {
      setPendingResumeAction(null);
      handleScheduleHelpr();
    }, 0);

    return () => {
      clearTimeout(timeout);
    };
  }, [handleScheduleHelpr, isSubmitting, pendingResumeAction, user]);

  const transcribeAudioAsync = useCallback(
    async (uri: string) => {
      if (!openAiApiKey) {
        showModal({
          title: 'Missing API key',
          message: 'Add an OpenAI API key to enable voice mode.',
        });
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
          headers: {
            Authorization: `Bearer ${openAiApiKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Transcription failed');
        }

        const data = await response.json();
        const text = typeof data?.text === 'string' ? data.text.trim() : '';

        return text;
      } catch (error) {
        console.warn('Transcription error', error);
        showModal({
          title: 'Transcription failed',
          message: 'Unable to transcribe your recording.',
        });
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

    if (!uri) {
      return;
    }

    setIsTranscribing(true);
    try {
      const transcript = await transcribeAudioAsync(uri);
      if (transcript) {
        resetPriceState();
        setDescription(prev => {
          const trimmedPrev = prev.trim();
          const combined = trimmedPrev.length > 0 ? `${trimmedPrev} ${transcript}` : transcript;
          return combined.trim();
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [resetPriceState, transcribeAudioAsync]);

  const handleVoiceModePress = useCallback(async () => {
    if (isTranscribing) {
      return;
    }

    if (isRecording) {
      await stopRecordingAndTranscribe();
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        showModal({
          title: 'Microphone needed',
          message: 'Enable microphone access to record your request.',
        });
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
      showModal({
        title: 'Recording failed',
        message: 'Unable to start voice mode.',
      });
    }
  }, [isRecording, isTranscribing, showModal, stopRecordingAndTranscribe]);

  const fetchPredictions = useCallback(
    async (
      input: string,
      sessionToken: string,
      setSuggestions: React.Dispatch<React.SetStateAction<PlaceSuggestion[]>>,
      setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    ) => {
      if (!googlePlacesApiKey) {
        console.warn('Google Places API key is not configured.');
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          input,
          key: googlePlacesApiKey,
          sessiontoken: sessionToken,
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
          setSuggestions(parsed);
        } else {
          console.warn('Google Places Autocomplete error:', data.status, data.error_message);
          setSuggestions([]);
        }
      } catch (error) {
        console.warn('Failed to fetch autocomplete suggestions', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [googlePlacesApiKey],
  );

  const fetchPlaceDetails = useCallback(
    async (placeId: string, sessionToken: string): Promise<SelectedLocation | null> => {
      if (!googlePlacesApiKey) {
        console.warn('Google Places API key is not configured.');
        return null;
      }

      try {
        const params = new URLSearchParams({
          place_id: placeId,
          key: googlePlacesApiKey,
          sessiontoken: sessionToken,
          fields: 'formatted_address,geometry/location',
        });

        const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
        const data = await response.json();

        if (data.status === 'OK') {
          const location = data.result.geometry?.location;
          if (!location) {
            return null;
          }

          return {
            description: data.result.formatted_address ?? '',
            coordinate: {
              latitude: location.lat,
              longitude: location.lng,
            },
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

  const handleStartChange = useCallback(
    (text: string) => {
      setStartQuery(text);
      setStartLocation(null);
      resetPriceState();

      if (startDebounceRef.current) {
        clearTimeout(startDebounceRef.current);
      }

      const trimmed = text.trim();
      if (trimmed.length < 3) {
        setStartSuggestions([]);
        return;
      }

      startDebounceRef.current = setTimeout(() => {
        fetchPredictions(trimmed, startSessionToken, setStartSuggestions, setStartLoading);
      }, 350);
    },
    [fetchPredictions, resetPriceState, startSessionToken],
  );

  const handleEndChange = useCallback(
    (text: string) => {
      setEndQuery(text);
      setEndLocation(null);
      resetPriceState();

      if (endDebounceRef.current) {
        clearTimeout(endDebounceRef.current);
      }

      const trimmed = text.trim();
      if (trimmed.length < 3) {
        setEndSuggestions([]);
        return;
      }

      endDebounceRef.current = setTimeout(() => {
        fetchPredictions(trimmed, endSessionToken, setEndSuggestions, setEndLoading);
      }, 350);
    },
    [endSessionToken, fetchPredictions, resetPriceState],
  );

  const handleStartSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!suggestion.placeId) {
        return;
      }
      setStartLoading(true);
      const details = await fetchPlaceDetails(suggestion.placeId, startSessionToken);
      setStartLoading(false);

      if (!details) {
        return;
      }

      applyLocation('start', {
        description: details.description || suggestion.description,
        coordinate: details.coordinate,
      });
    },
    [applyLocation, fetchPlaceDetails, startSessionToken],
  );

  const handleEndSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!suggestion.placeId) {
        return;
      }
      setEndLoading(true);
      const details = await fetchPlaceDetails(suggestion.placeId, endSessionToken);
      setEndLoading(false);

      if (!details) {
        return;
      }

      applyLocation('end', {
        description: details.description || suggestion.description,
        coordinate: details.coordinate,
      });
    },
    [applyLocation, fetchPlaceDetails, endSessionToken],
  );

  const handleStartClear = useCallback(() => {
    setStartQuery('');
    setStartSuggestions([]);
    setStartLocation(null);
    setStartSessionToken(createSessionToken());
    resetPriceState();
  }, [resetPriceState]);

  const handleEndClear = useCallback(() => {
    setEndQuery('');
    setEndSuggestions([]);
    setEndLocation(null);
    setEndSessionToken(createSessionToken());
    resetPriceState();
  }, [resetPriceState]);

  const currentLocationSecondaryText = useMemo(() => {
    if (currentLocation) {
      return currentLocation.description;
    }

    if (locationPermissionStatus === PermissionStatus.DENIED) {
      return 'Enable location access in Settings to use this option.';
    }

    return 'Fill with your device\'s current GPS position.';
  }, [currentLocation, locationPermissionStatus]);

  const startCurrentLocationOption = useMemo<CurrentLocationOption>(
    () => ({
      id: 'current-location-start',
      primaryText: 'Current Location',
      secondaryText: currentLocationSecondaryText,
      onSelect: () => handleUseCurrentLocation('start'),
      loading: currentLocationLoading && currentLocationLoadingTarget === 'start',
      disabled: currentLocationLoading,
    }),
    [currentLocationLoading, currentLocationLoadingTarget, currentLocationSecondaryText, handleUseCurrentLocation],
  );

  const endCurrentLocationOption = useMemo<CurrentLocationOption>(
    () => ({
      id: 'current-location-end',
      primaryText: 'Use Current Location',
      secondaryText: currentLocationSecondaryText,
      onSelect: () => handleUseCurrentLocation('end'),
      loading: currentLocationLoading && currentLocationLoadingTarget === 'end',
      disabled: currentLocationLoading,
    }),
    [currentLocationLoading, currentLocationLoadingTarget, currentLocationSecondaryText, handleUseCurrentLocation],
  );

  const handleEndSuggestionsVisibilityChange = useCallback((visible: boolean) => {
    setIsEndSuggestionsVisible(visible);
  }, []);

  useEffect(() => {
    if (!startLocation || !endLocation) {
      setRouteCoordinates([]);
      return;
    }

    if (!googlePlacesApiKey) {
      console.warn('Google Places API key is not configured. Falling back to straight line.');
      setRouteCoordinates(
        ensureRouteEndpoints(
          [startLocation.coordinate, endLocation.coordinate],
          startLocation.coordinate,
          endLocation.coordinate,
        ),
      );
      return;
    }

    let cancelled = false;

    const fetchDirections = async () => {
      try {
        const params = new URLSearchParams({
          origin: `${startLocation.coordinate.latitude},${startLocation.coordinate.longitude}`,
          destination: `${endLocation.coordinate.latitude},${endLocation.coordinate.longitude}`,
          key: googlePlacesApiKey,
          mode: 'driving',
        });

        const response = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
        );
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (data.status === 'OK') {
          const polyline = data.routes?.[0]?.overview_polyline?.points;
          if (typeof polyline === 'string' && polyline.length > 0) {
            const decoded = decodePolyline(polyline);
            const resolvedPath = ensureRouteEndpoints(
              decoded.length >= 2 ? decoded : [startLocation.coordinate, endLocation.coordinate],
              startLocation.coordinate,
              endLocation.coordinate,
            );
            setRouteCoordinates(resolvedPath);
            return;
          }
        }

        console.warn('Google Directions error:', data.status, data.error_message);
        setRouteCoordinates(
          ensureRouteEndpoints(
            [startLocation.coordinate, endLocation.coordinate],
            startLocation.coordinate,
            endLocation.coordinate,
          ),
        );
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to fetch directions', error);
          setRouteCoordinates(
            ensureRouteEndpoints(
              [startLocation.coordinate, endLocation.coordinate],
              startLocation.coordinate,
              endLocation.coordinate,
            ),
          );
        }
      }
    };

    fetchDirections();

    return () => {
      cancelled = true;
    };
  }, [endLocation, googlePlacesApiKey, startLocation]);

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={defaultRegion}
            showsUserLocation={false}
            showsMyLocationButton={false}
            loadingEnabled
          >
            {startLocation && (
              <Marker
                coordinate={startLocation.coordinate}
                title="Start"
                description={startLocation.description}
                anchor={{ x: 0.5, y: 1 }}
                centerOffset={{ x: 0, y: -12 }}
                tracksViewChanges={false}
              >
                <Image
                  source={require('../assets/icons/ConfirmLocationIcon.png')}
                  style={styles.mapMarkerStartIcon}
                />
              </Marker>
            )}
            {endLocation && (
              <Marker
                coordinate={endLocation.coordinate}
                title="End"
                description={endLocation.description}
                anchor={{ x: 0.3, y: 1 }}
                centerOffset={{ x: 0, y: -10 }}
                tracksViewChanges={false}
              >
                <Image
                  source={require('../assets/icons/finish-flag.png')}
                  style={styles.mapMarkerEndIcon}
                />
              </Marker>
            )}
            {routeCoordinates.length > 1 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#0c4309"
                strokeWidth={3}
              />
            )}
          </MapView>
        </View>
        <View style={styles.contentArea}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Image 
              source={require('../assets/icons/backButton.png')} 
              style={styles.backButtonIcon} 
            />
          </Pressable>
          <View style={styles.panel}>
            <Text style={styles.title}>Moving Details</Text>
            <View style={styles.DividerContainer1}>
                <View style={styles.DividerLine1} />
            </View>
            <View style={[styles.locationSection, styles.locationSectionStart]}>  
              <View style={styles.locationLabelRow}>
                <Image
                  source={require('../assets/icons/ConfirmLocationIcon.png')}
                  style={[styles.confirmLocationIcon, { width: 24, height: 24, resizeMode: 'contain' }]}
                />
                <LocationAutocompleteInput
                value={startQuery}
                placeholder="Start Location"
                onChangeText={handleStartChange}
                onSelectSuggestion={handleStartSelect}
                onClear={handleStartClear}
                suggestions={startSuggestions}
                loading={
                  startLoading ||
                  (currentLocationLoading && currentLocationLoadingTarget === 'start')
                }
                currentLocationOption={startCurrentLocationOption}
              />
              </View>
            </View>
            <View
              style={[
                styles.locationSection2,
                styles.locationSectionEnd,
                isEndSuggestionsVisible && styles.locationSectionEndDropdownVisible,
              ]}
            >
              <View style={styles.locationLabelRow}>
                <Image
                  source={require('../assets/icons/finish-flag.png')}
                  style={[styles.confirmLocationIcon2, { width: 18, height: 18, resizeMode: 'contain' }]}
                />
                <LocationAutocompleteInput
                value={endQuery}
                placeholder="End Location"
                onChangeText={handleEndChange}
                onSelectSuggestion={handleEndSelect}
                onClear={handleEndClear}
                suggestions={endSuggestions}
                loading={
                  endLoading ||
                  (currentLocationLoading && currentLocationLoadingTarget === 'end')
                }
                currentLocationOption={endCurrentLocationOption}
                onSuggestionsVisibilityChange={handleEndSuggestionsVisibilityChange}
              />
              </View>
              
            </View>
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
                  {isPriceLoading ? (
                    <ActivityIndicator size="small" color="#0c4309" />
                  ) : (
                    <>
                      {priceQuote ? (
                        <View style={styles.PriceOfServiceQuoteRow}>
                          <Text
                            style={[styles.PriceOfServiceQuoteText, styles.PriceOfServiceQuotePrice]}
                            numberOfLines={1}
                          >
                            {priceQuote}
                          </Text>
                          <Text style={styles.PriceOfServiceQuoteEstimateText}>est.</Text>
                        </View>
                      ) : (
                        <>
                          <Text
                            style={[
                              styles.PriceOfServiceQuoteText,
                              priceError ? styles.PriceOfServiceQuoteTextError : null,
                            ]}
                            numberOfLines={2}
                          >
                            {priceError ?? 'Enter description to see price'}
                          </Text>
                          {priceNote ? (
                            <Text style={styles.PriceOfServiceQuoteNoteText} numberOfLines={2}>
                              {priceNote}
                            </Text>
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
                placeholder="Describe your task...                                              'I need everything moved to my new apartment. I need someone with a truck and moving equipment.'"
                multiline
                numberOfLines={4}
                placeholderTextColor="#333333ab"
                value={description}
                onChangeText={handleDescriptionChange}
                onSubmitEditing={handleMovingAnalysisSubmit}
                blurOnSubmit
                returnKeyType="done"
                editable={!isTranscribing}
              />
              
                <View style={styles.inputButtonsContainer}>
                  <View style={styles.voiceContainer}>
                      <Pressable
                        style={[styles.voiceButton, (isRecording || isTranscribing) && styles.voiceButtonActive]}
                        onPress={handleVoiceModePress}
                        disabled={isTranscribing}
                      >
                        <Animated.View style={{ transform: [{ scale: voicePulseValue }] }}>
                          <SvgXml xml={voiceIconSvg} width="20" height="20" />
                        </Animated.View>
                      </Pressable>
                      <View style={styles.voiceStatusRow}>
                        <Text style={styles.inputButtonsText}>
                          {isRecording ? 'Listening…' : isTranscribing ? 'Processing…' : 'Voice Mode'}
                        </Text>
                        {isTranscribing ? (
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
            <View style={styles.DividerContainer2}>
                <View style={styles.DividerLine2} />
            </View>
            <View style={styles.binarySliderContainer}>
              <Animated.View style={styles.binarySlider}>
                <View style={styles.binarySliderIcons}>
                  <Image 
                    source={require('../assets/icons/ChooseHelprIcon.png')} 
                    style={[styles.binarySliderIcon, { opacity: isAuto ? 0.5 : 1, marginLeft: 7 }]} 
                  />
                  <Image 
                    source={require('../assets/icons/AutoFillIcon.png')} 
                    style={[styles.binarySliderIcon, { opacity: isAuto ? 1 : 0.5, marginLeft: 12 }]} 
                  />
                </View>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    setIsAuto(prev => {
                      const next = !prev;
                      // Cancel any in-progress animation
                      slideAnimationRef.current?.stop();
                      // Start new animation
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
                        transform: [{
                          translateX: slideAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 28],
                          }),
                        }],
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
            <View style={styles.sliderRowContainer}>
              <View style={styles.binarySliderContainer}>
                <Animated.View style={styles.binarySlider}>
                  <View style={styles.binarySliderIcons2}>
                    <Image 
                      source={require('../assets/icons/PersonalPMIcon.png')} 
                      style={styles.binarySliderIcon2} 
                    />
                    <Image 
                      source={require('../assets/icons/BusinessPMIcon.png')} 
                      style={styles.BusinessPMIcon} 
                    />
                  </View>
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => {
                      setIsPersonal(prev => {
                        const next = !prev;
                        // Cancel any in-progress animation
                        slideAnimation2Ref.current?.stop();
                        // Start new animation
                        slideAnimation2Ref.current = Animated.spring(slideAnimation2, {
                          toValue: next ? 0 : 1,
                          useNativeDriver: false,
                          friction: 8,
                          tension: 50
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
                          transform: [{
                            translateX: slideAnimation2.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 28]
                            })
                          }]
                        }
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
                <Image 
                  source={require('../assets/icons/PMIcon.png')} 
                  style={styles.pmIcon} 
                />
                <Image 
                  source={require('../assets/icons/ArrowIcon.png')} 
                  style={[styles.arrowIcon, { resizeMode: 'contain' }]} 
                />
              </View>
            </View>
            <View style={styles.bottomRowContainer}>
              <Pressable
                onPress={handleScheduleHelpr}
                style={styles.scheduleHelprContainer}
              >
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
              Please sign in or sign up to schedule a moving service.
            </Text>
            <View style={styles.signInButtonsRow}>
              <Pressable 
                style={styles.signInButton} 
                onPress={() => {
                  preserveFormForAuth();
                  setShowSignInModal(false);
                  router.push('/login');
                }}
              >
                <Text style={styles.signInButtonText}>Sign In</Text>
              </Pressable>
              <Pressable 
                style={styles.signUpButton} 
                onPress={() => {
                  preserveFormForAuth();
                  setShowSignInModal(false);
                  router.push('/signup');
                }}
              >
                <Text style={styles.signUpButtonText}>Sign Up</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.cancelButton}
              onPress={() => setShowSignInModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Moving Analysis Modal */}
      <Modal
        visible={showMovingAnalysisModal}
        transparent={true}
        animationType="fade"
        onRequestClose={resetMovingAnalysisFlow}
      >
        <View style={styles.movingAnalysisOverlayBackground}>
          <View style={styles.movingAnalysisModal}>
            {movingAnalysis.questionsToShow.length > 0 && (
              <>
                <Text style={styles.movingAnalysisTitle}>
                  {movingAnalysis.questionsToShow[currentQuestionStep]?.title}
                </Text>
                <Text style={styles.movingAnalysisMessage}>
                  {movingAnalysis.questionsToShow[currentQuestionStep]?.message}
                </Text>

                {movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'needsTruck' && (
                  <View style={styles.movingAnalysisOptionsContainer}>
                    <Pressable
                      style={[styles.movingAnalysisOption, needsTruck === 'yes' && styles.movingAnalysisOptionSelected]}
                      onPress={() => setNeedsTruck('yes')}
                    >
                      <Text style={[styles.movingAnalysisOptionText, needsTruck === 'yes' && styles.movingAnalysisOptionTextSelected]}>
                        Yes, I need a truck
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.movingAnalysisOption, needsTruck === 'no' && styles.movingAnalysisOptionSelected]}
                      onPress={() => setNeedsTruck('no')}
                    >
                      <Text style={[styles.movingAnalysisOptionText, needsTruck === 'no' && styles.movingAnalysisOptionTextSelected]}>
                        No, I don't need a truck
                      </Text>
                    </Pressable>
                  </View>
                )}

                {movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'packingStatus' && (
                  <View style={styles.movingAnalysisOptionsContainer}>
                    <Pressable
                      style={[styles.movingAnalysisOption, packingStatus === 'not-packed' && styles.movingAnalysisOptionSelected]}
                      onPress={() => setPackingStatus('not-packed')}
                    >
                      <Text style={[styles.movingAnalysisOptionText, packingStatus === 'not-packed' && styles.movingAnalysisOptionTextSelected]}>
                        Yes, I need help packing
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.movingAnalysisOption, packingStatus === 'packed' && styles.movingAnalysisOptionSelected]}
                      onPress={() => setPackingStatus('packed')}
                    >
                      <Text style={[styles.movingAnalysisOptionText, packingStatus === 'packed' && styles.movingAnalysisOptionTextSelected]}>
                        No, everything is already packed
                      </Text>
                    </Pressable>
                  </View>
                )}

                {movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'boxesNeeded' && (
                  <View style={styles.movingAnalysisOptionsContainer}>
                    <Pressable
                      style={[styles.movingAnalysisOption, boxesNeeded === 'yes' && styles.movingAnalysisOptionSelected]}
                      onPress={() => setBoxesNeeded('yes')}
                    >
                      <Text style={[styles.movingAnalysisOptionText, boxesNeeded === 'yes' && styles.movingAnalysisOptionTextSelected]}>
                        Yes, please bring boxes
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.movingAnalysisOption, boxesNeeded === 'no' && styles.movingAnalysisOptionSelected]}
                      onPress={() => setBoxesNeeded('no')}
                    >
                      <Text style={[styles.movingAnalysisOptionText, boxesNeeded === 'no' && styles.movingAnalysisOptionTextSelected]}>
                        No, I have boxes
                      </Text>
                    </Pressable>
                  </View>
                )}

                {movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'apartmentSize' && (
                  <TextInput
                    style={styles.movingAnalysisInput}
                    placeholder={movingAnalysis.questionsToShow[currentQuestionStep]?.placeholder}
                    value={apartmentSize}
                    onChangeText={setApartmentSize}
                    autoFocus
                  />
                )}

                {movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'furnitureScope' && (
                  <TextInput
                    style={styles.movingAnalysisInput}
                    placeholder={movingAnalysis.questionsToShow[currentQuestionStep]?.placeholder}
                    value={furnitureScope}
                    onChangeText={setFurnitureScope}
                    autoFocus
                    multiline
                    numberOfLines={3}
                  />
                )}

                <View style={styles.movingAnalysisButtonsRow}>
                  <Pressable 
                    style={styles.movingAnalysisCancelButton}
                    onPress={handleAnalysisModalBack}
                  >
                    <Text style={styles.movingAnalysisCancelButtonText}>Back</Text>
                  </Pressable>
                  <Pressable 
                    style={styles.movingAnalysisButton}
                    onPress={handleAnalysisModalSubmit}
                    disabled={
                      (movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'packingStatus' && !packingStatus) ||
                      (movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'needsTruck' && !needsTruck) ||
                      (movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'boxesNeeded' && !boxesNeeded) ||
                      (movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'apartmentSize' && !apartmentSize.trim()) ||
                      (movingAnalysis.questionsToShow[currentQuestionStep]?.id === 'furnitureScope' && !furnitureScope.trim())
                    }
                  >
                    <Text style={styles.movingAnalysisButtonText}>
                      {currentQuestionStep < movingAnalysis.questionsToShow.length - 1 ? 'Next' : 'Continue'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff0cfff',
  },
  container: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    height: '65%',
    backgroundColor: '#FFF8E8',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 12,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    // Android shadow
    elevation: 12,
  },
  title: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#0c4309',
    marginBottom: 3,
  },
  DividerContainer1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
    marginBottom: 15,
  },
  DividerLine1: {
    width: 375,
    height: 1,
    backgroundColor: '#cfbf9dff',
  },
  DividerContainer2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
    marginBottom: 5,
  },
  DividerLine2: {
    width: 375,
    height: 1,
    backgroundColor: '#cfbf9dff',
    marginBottom: 5,
  },
  DividerLine3: {
    width: 355,
    height: 1,
    backgroundColor: '#cfbf9dff',
    marginLeft: 10,
  },
  DividerContainer3: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E5DCC9',
  },
  confirmLocationTextBackgroundContainer:{
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E5DCC9',
    borderTopRightRadius: 20,
    borderTopLeftRadius: 20,
    height: 40,
    // borderColor: 'red',
    // borderWidth: 1,
  },
  confirmLocationTextContainer:{
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 10,
    height: 31,
    // borderColor: 'red',
    // borderWidth: 1,
  },
  confirmLocationImageContainer:{
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#E5DCC9',
    borderTopLeftRadius: 20,
    paddingTop: 8,
    paddingLeft: 5,
    marginBottom: 0,
    height: 31,
    // borderColor: 'red',
    // borderWidth: 1,
  },
  confirmLocationTextBackgroundContainer2:{
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E5DCC9',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    height: 40,
    marginBottom: 10,
    // borderColor: 'red',
    // borderWidth: 1,
  },
  confirmLocationText: {
    paddingLeft: 10,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '400',
    color: '#49454F',
  },
  confirmLocationIcon: {
    marginLeft: 10,
    marginRight: 0,
    marginTop: 2,
  },
  confirmLocationIcon2: {
    marginLeft: 7,
    marginRight: 2,
  },

  jobDescriptionContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginTop: 15,
    marginBottom: 10,
    height: 145,
    borderColor: "#00000019",
    borderWidth: 1,
  },
  PriceOfServiceContainer:{
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E5DCC9',
    borderRadius: 10,
    paddingTop: 0,
    marginTop: 5,
    height: 50,
  },
  PriceOfServiceTextContainer:{
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#E5DCC9',
    borderRadius: 10,
    marginTop: 0,
    height: 30,
    marginRight: 60,
  },
  PriceOfServiceTitleTextContainer:{
    flexDirection: 'row',
    backgroundColor: 'transparent',
    marginLeft: 8,
    paddingTop: 0,
    marginTop: 7,
    height: 22,
  },
  PriceOfServiceSubtitleTextContainer:{
    flexDirection: 'row',
    backgroundColor: 'transparent',
    marginLeft: 8,
    paddingTop: 0,
    marginTop: 0,
    height: 15,
  },
  PriceOfServiceTitleText:{
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 0,
  },
  PriceOfServiceSubtitleText:{
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '400',
    color: '#49454F',
  },
  PriceOfServiceQuoteContainer:{
    width: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10,
    marginTop: 5,
    minHeight: 48,
    paddingHorizontal: 8,
  },
  PriceOfServiceQuoteText:{
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '400',
    color: '#0c4309',
    marginRight: 4,
    marginBottom: 3,
  },
  PriceOfServiceQuotePrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
  },
  PriceOfServiceQuoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    
  },
  PriceOfServiceQuoteEstimateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0c4309',
    textTransform: 'lowercase',
    marginBottom: 5,
  },
  PriceOfServiceQuoteTextError: {
    color: '#b02a2a',
  },
  PriceOfServiceQuoteNoteText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '500',
    color: '#49454F',
    marginTop: 2,
  },
  jobDescriptionText: {
    color: '#333333',
    fontSize: 16,
    textAlign: 'left',
    textAlignVertical: 'top',
    paddingLeft: 15,
    paddingRight: 20,
    paddingBottom: 5,
    paddingTop: 10,
  },
  jobDescriptionExampleText: {
    color: '#999999',
    textAlign: 'left',
    textAlignVertical: 'top',
    fontSize: 16,
    paddingLeft: 15,
    paddingRight: 20,
  },
  inputButtonsContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',  // This will push items to opposite ends
    alignItems: 'center',
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapMarkerStartIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
  mapMarkerEndIcon: {
    width: 26,
    height: 26,
    resizeMode: 'contain',
  },
  voiceButton: {
    width: 60,
    height: 40,
    borderRadius:20,
    backgroundColor: '#E5DCC9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  voiceButtonActive: {
    backgroundColor: '#d6c5a5',
  },
  voiceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 3,
    marginLeft: 8,
  },
  voiceStatusSpinner: {
    marginLeft: 4,
  },
  inputButtonsText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
  },
  cameraButton: {
    width: 60,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0c4309',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginLeft: 8,
  },
  inputButtonIcon: {
    fontSize: 16,
    marginRight: 0,
  },
  attachmentsSummary: {
    marginTop: 8,
    marginLeft: 15,
  },
  attachmentsSummaryText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#0c4309',
  },
  binarySliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 6,
    marginLeft: 20,
  },
  sliderRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 7,
    paddingRight: 20,
  },
  binarySliderLabel: {
    fontWeight: '500',
    minWidth: 50,
    textAlign: 'left',
    lineHeight: 14,
  },
  isAutoSliderTitle: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: 'bold',
  },
  isAutoSliderSubtitle: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: 'normal',
  },
  isPersonalSliderTitle: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: 'bold',
  },
  isPersonalSliderSubtitle: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: 'normal',
  },
  binarySlider: {
    width: 60,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5DCC9',
    justifyContent: 'center',
    padding: 4,
    overflow: 'hidden',
  },
  binarySliderThumb: {
    width: 32,
    height: 32,
    borderRadius: 20,
    backgroundColor: '#8a7956ad',
    position: 'absolute',
  left: 0,
  },
  binarySliderIcons: {
    position: 'absolute',
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    pointerEvents: 'none',
    zIndex: 1001,
  },
  binarySliderIcons2: {
    position: 'absolute',
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingLeft: 5,
    pointerEvents: 'none',
    zIndex: 1001,
  },
  binarySliderIcon: {
    width: 18,
    height: 18
  },
  binarySliderIcon2: {
    width: 22,
    height: 22,
  },
  BusinessPMIcon: {
    width: 18,
    height: 18,
    marginLeft: 8,
    marginTop: 1,
  },
  pmIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pmIcon: {
    width: 20,
    height: 20,
  },
  arrowIcon: {
    width: 12,
    height: 12,
  },
  bottomRowContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  scheduleHelprContainer: {
    backgroundColor: '#0c4309',
    borderRadius: 20,
    width: '80%',
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    // Android shadow
    elevation: 5,
  },
  confirmHelprContainer:{
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 10,
    backgroundColor: '#0c4309',
    borderRadius: 20,
    marginLeft: 20,
    width: '80%',
  },
  scheduleHelprText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  scheduleServiceIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  asapText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#414441ff',
  },
  arrowDownIcon: {
    width: 12,
    height: 12,
    resizeMode: 'contain',
  },
  backButton: {
    position: 'absolute',
    top: 85,
    left: 30,
    zIndex: 10,
  },
  backButtonIcon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
  map: {
    flex: 1,
  },
  locationSection: {
    backgroundColor: '#E5DCC9',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: 0,
    position: 'relative',
    paddingTop: 2,
  },
  locationSection2: {
    backgroundColor: '#E5DCC9',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingLeft: 6,
    paddingRight: 0,
    marginBottom: 10,
    position: 'relative',
  },

  locationSectionEndDropdownVisible: {
    borderBottomRightRadius: 0,
  },

  locationSectionStart: {
    zIndex: 30,
  },
  locationSectionEnd: {
    zIndex: 20,
  },
  locationLabelRow: {
    marginTop: 3,
    marginBottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationLabelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0c4309',
  },
  autocompleteWrapper: {
    flex: 1,
    position: 'relative',
  },
  autocompleteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5DCC9',
    borderRadius: 20,
    minHeight: 36,
    paddingHorizontal: 14,
  },
  autocompleteInput: {
    flex: 1,
    fontSize: 15,
    color: '#333333',
    paddingVertical: 8,
  },
  clearButton: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  clearButtonText: {
    fontSize: 20,
    color: '#0c4309',
    lineHeight: 20,
  },
  autocompleteSuggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#E5DCC9',
    marginTop: -2,
    paddingTop: 6,
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    maxHeight: 220,
    overflow: 'hidden',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#00000019',
    zIndex: 40,
  },
  autocompleteSuggestion: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#E5DCC9',
    borderBottomWidth: 1,
    borderBottomColor: '#cfbf9dff',
  },
  autocompleteSuggestionCurrent: {
    backgroundColor: '#E5DCC9',
  },
  autocompleteSuggestionDisabled: {
    opacity: 0.55,
  },
  autocompleteSuggestionLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  autocompleteSuggestionDivider: {
    height: 1,
    backgroundColor: '#cfbf9dff',
    marginHorizontal: 6,
    opacity: 0.7,
  },
  autocompleteSuggestionPrimary: {
    fontSize: 15,
    color: '#0c4309',
    fontWeight: '600',
  },
  autocompleteSuggestionSecondary: {
    fontSize: 13,
    color: '#49454F',
    marginTop: 2,
  },
  currentLocationTextWrapper: {
    flex: 1,
    gap: 2,
  },
  autocompleteLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  autocompleteLoadingText: {
    fontSize: 14,
    color: '#0c4309',
    fontWeight: '500',
    marginLeft: 10,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E5DCC9',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 170,
  },
  confirmLocationIconLarge: {
    width: 96,
    height: 96,
    resizeMode: 'contain',
  },
  // Sign-In Modal Styles
  signInOverlayBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInModal: {
    width: '70%',
    backgroundColor: '#FFF8E8',
    borderRadius: 30,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  signInTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  signInDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: '#CAC4D0',
    marginBottom: 10,
    marginHorizontal: -30,
  },
  signInMessage: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
    paddingHorizontal: 0,
  },
  signInButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  signInButton: {
    flex: 1,
    backgroundColor: '#0c4309',
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  signUpButton: {
    flex: 1,
    backgroundColor: '#E5DCC9',
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: '#0c4309',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  signUpButtonText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 6,
  },
  cancelButtonText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Moving Analysis Modal Styles
  movingAnalysisOverlayBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  movingAnalysisModal: {
    width: '85%',
    backgroundColor: '#FFF8E8',
    borderRadius: 30,
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  movingAnalysisTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 15,
  },
  movingAnalysisMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  movingAnalysisInput: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333333',
    borderWidth: 1,
    borderColor: '#E5DCC9',
    marginBottom: 15,
    textAlignVertical: 'top',
  },
  movingAnalysisRadioGroup: {
    width: '100%',
    marginBottom: 20,
  },
  movingAnalysisRadioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  movingAnalysisRadioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#0c4309',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  movingAnalysisRadioSelected: {
    backgroundColor: '#0c4309',
  },
  movingAnalysisRadioText: {
    fontSize: 16,
    color: '#0c4309',
    fontWeight: '500',
  },
  movingAnalysisButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  movingAnalysisButton: {
    flex: 1,
    backgroundColor: '#0c4309',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  movingAnalysisButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  movingAnalysisCancelButton: {
    flex: 1,
    backgroundColor: '#E5DCC9',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#0c4309',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  movingAnalysisCancelButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  movingAnalysisOptionsContainer: {
    width: '100%',
    marginBottom: 20,
  },
  movingAnalysisOption: {
    backgroundColor: '#E5DCC9',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#E5DCC9',
  },
  movingAnalysisOptionSelected: {
    backgroundColor: '#0c4309',
    borderColor: '#0c4309',
  },
  movingAnalysisOptionText: {
    fontSize: 16,
    color: '#0c4309',
    fontWeight: '500',
    textAlign: 'center',
  },
  movingAnalysisOptionTextSelected: {
    color: '#FFFFFF',
  },
});


