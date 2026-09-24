import { Audio } from '../../lib/audio';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { PermissionStatus } from 'expo-modules-core';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { LatLng, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SvgXml } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { supabase } from '../../lib/supabase';

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
  location?: string | null;
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

type AssemblyComplexity = 'simple' | 'moderate' | 'complex';

type AssemblyItemDraft = {
  name: string;
  sku: string;
  pieceCount: string;
  complexity: AssemblyComplexity;
  brand: string;
  model: string;
};

type FurnitureAssemblyFormState = {
  locationQuery: string;
  location: SelectedLocation | null;
  description: string;
  isAuto: boolean;
  isPersonal: boolean;
  priceQuote: string | null;
  suggestedPrice: number | null;
  priceNote: string | null;
  priceError: string | null;
  attachments: AttachmentAsset[];
  apartmentSize: string;
  packingStatus: '' | 'packed' | 'not-packed';
  needsTruck: '' | 'yes' | 'no';
  boxesNeeded: '' | 'yes' | 'no';
  furnitureScope: string;
  assemblyComplexity: '' | AssemblyComplexity;
  assemblyItems: AssemblyItemDraft[];
  itemName: string;
  itemSku: string;
  pieceCountInput: string;
  itemBrand: string;
  itemModel: string;
  itemComplexity: '' | AssemblyComplexity;
  specialRequests: string;
  detailsPhotos: AttachmentAsset[];
  toolsNeeded: string;
};

type FurnitureAssemblyReturnData = {
  formState: FurnitureAssemblyFormState;
  action?: 'schedule-furniture-assembly';
  timestamp?: number;
  params?: Record<string, string>;
};

const FURNITURE_ASSEMBLY_RETURN_PATH = '/(services)/furniture-assembly';

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

const readPieceCount = (value: string): number | null => {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < 1 || rounded > 200) return null;
  return rounded;
};

const formatDurationLabel = (minutes: number) => {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 90) return `about ${rounded} min`;
  const hours = Math.round((rounded / 60) * 10) / 10;
  return `about ${hours} hr`;
};

const formatAssemblyClause = (item: AssemblyItemDraft) => {
  const name = item.name.trim();
  const sku = item.sku.trim();
  const parts = [name || sku || 'item'];
  if (sku) parts.push(`sku: ${sku}`);
  if (name) parts.push(`type: ${name}`);
  parts.push(`pieces: ${item.pieceCount}`);
  parts.push(`complexity: ${item.complexity}`);
  if (item.brand.trim()) parts.push(`brand: ${item.brand.trim()}`);
  if (item.model.trim()) parts.push(`model: ${item.model.trim()}`);
  return parts.join(' | ');
};

const stripAssemblyMeta = (text: string) => {
  return text
    .replace(/\bAssembly items:\s*[\s\S]*$/i, '')
    .replace(/\s*\.\s*Type:\s*(?:Simple|Moderate|Complex)\s*assembly\b[^.]*/gi, '')
    .replace(/\s*\.\s*Property size:\s*[^.]*/gi, '')
    .replace(/\s*\.\s*Tools to bring:\s*[^.]*/gi, '')
    .replace(/\s*\.\s*Tools needed:\s*[^.]*/gi, '')
    .replace(/\s*\.\s*Photos:\s*\d+\b/gi, '')
    .replace(/\s*\.\s*Special requests:\s*[^.]*/gi, '')
    .replace(/\s*[.]\s*$/g, '')
    .trim();
};

const buildAssemblyDescription = (
  baseText: string,
  items: AssemblyItemDraft[],
  tools: string,
  requests: string,
  photoCount: number,
) => {
  const base = stripAssemblyMeta(baseText);
  const clauses: string[] = [];
  if (items.length > 0) {
    clauses.push(`Assembly items: ${items.map(formatAssemblyClause).join('; ')}`);
  }
  if (tools.trim()) clauses.push(`Tools needed: ${tools.trim()}`);
  if (photoCount > 0) clauses.push(`Photos: ${photoCount}`);
  if (requests.trim()) clauses.push(`Special requests: ${requests.trim()}`);
  if (clauses.length === 0) return base;
  if (!base) return clauses.join('. ');
  return `${base}. ${clauses.join('. ')}`;
};

const countAssemblyPhotos = (details: AttachmentAsset[], uploads: AttachmentAsset[]) =>
  details.length + uploads.filter(item => item.type === 'photo').length;

const parseComplexity = (value: string): AssemblyComplexity | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'simple' || normalized === 'moderate' || normalized === 'complex') return normalized;
  return null;
};

const parseAssemblyItemsFromDescription = (text: string): AssemblyItemDraft[] => {
  const match = text.match(/\bassembly items:\s*([\s\S]+)/i);
  if (!match) return [];
  const body = match[1].split(/\.\s*(?:tools needed|tools to bring|photos|special requests)\b/i)[0];
  const items: AssemblyItemDraft[] = [];
  for (const clause of body.split(';')) {
    const parts = clause.split('|').map(part => part.trim()).filter(Boolean);
    const fields: Record<string, string> = {};
    let name = '';
    for (const part of parts) {
      const labeled = part.match(/^([a-z][a-z ]{0,24}):\s*(.+)$/i);
      if (labeled) fields[labeled[1].trim().toLowerCase()] = labeled[2].trim().replace(/\.+$/, '');
      else if (!name) name = part.replace(/\.+$/, '');
    }
    const complexity = parseComplexity(fields.complexity || '');
    const pieces = readPieceCount(fields.pieces || fields['piece count'] || '');
    const itemName = (fields.name || name).trim();
    const sku = (fields.sku || '').trim();
    if (!complexity || pieces == null || (!itemName && !sku)) continue;
    items.push({
      name: itemName,
      sku,
      pieceCount: String(pieces),
      complexity,
      brand: fields.brand || '',
      model: fields.model || '',
    });
  }
  return items;
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
    const [hasUserTyped, setHasUserTyped] = useState(false);
    const hasInput = value.trim().length > 0;
    const shouldShowSuggestions =
      isFocused && hasInput && hasUserTyped && (loading || suggestions.length > 0);

    useEffect(() => {
      if (onSuggestionsVisibilityChange) {
        onSuggestionsVisibilityChange(shouldShowSuggestions);
      }
    }, [onSuggestionsVisibilityChange, shouldShowSuggestions]);

    const handleChangeText = (text: string) => {
      setHasUserTyped(true);
      onChangeText(text);
    };

    return (
      <View style={styles.autocompleteWrapper}>
        <View style={styles.autocompleteInputRow}>
          <TextInput
            value={value}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor="#7C7160"
            style={styles.autocompleteInput}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={placeholder}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              setHasUserTyped(false);
            }}
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

export default function furnitureAssembly() {
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
  const [description, setDescription] = useState('');
  const [priceQuote, setPriceQuote] = useState<string | null>(null);
  const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  const resetPriceState = useCallback(() => {
    setPriceQuote(null);
    setSuggestedPrice(null);
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
  const [pendingResumeAction, setPendingResumeAction] = useState<null | 'schedule-furniture-assembly'>(null);
  const [showFurnitureAssemblyAnalysisModal, setShowFurnitureAssemblyAnalysisModal] = useState(false);
  const [apartmentSize, setApartmentSize] = useState('');
  const [packingStatus, setPackingStatus] = useState<'packed' | 'not-packed' | ''>('');
  const [truckNeeded, setTruckNeeded] = useState<'yes' | 'no' | ''>('');
  const [boxesNeeded, setBoxesNeeded] = useState<'yes' | 'no' | ''>('');
  const [currentQuestionStep, setCurrentQuestionStep] = useState(0);
  const [furnitureScope, setFurnitureScope] = useState('');
  const [needsTruck, setNeedsTruck] = useState<'yes' | 'no' | ''>('');
  const [assemblyComplexity, setAssemblyComplexity] = useState<'' | AssemblyComplexity>('');
  const [assemblyItems, setAssemblyItems] = useState<AssemblyItemDraft[]>([]);
  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [pieceCountInput, setPieceCountInput] = useState('1');
  const [itemBrand, setItemBrand] = useState('');
  const [itemModel, setItemModel] = useState('');
  const [itemComplexity, setItemComplexity] = useState<'' | AssemblyComplexity>('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [detailsPhotos, setDetailsPhotos] = useState<AttachmentAsset[]>([]);
  const [showAssemblyComplexityModal, setShowAssemblyComplexityModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showApartmentSizeModal, setShowApartmentSizeModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [toolsNeeded, setToolsNeeded] = useState('');
  const lastEnhancedDescriptionRef = useRef<string | null>(null);
  const voicePulseValue = useRef(new Animated.Value(1)).current;
  const voicePulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const collectFormState = useCallback((): FurnitureAssemblyFormState => {
    return {
      locationQuery,
      location: cloneSelectedLocation(location),
      description,
      isAuto,
      isPersonal,
      priceQuote,
      suggestedPrice,
      priceNote,
      priceError,
      attachments: cloneAttachments(attachments),
      apartmentSize,
      packingStatus,
      needsTruck,
      boxesNeeded,
      furnitureScope,
      assemblyComplexity,
      assemblyItems,
      itemName,
      itemSku,
      pieceCountInput,
      itemBrand,
      itemModel,
      itemComplexity,
      specialRequests,
      detailsPhotos: cloneAttachments(detailsPhotos),
      toolsNeeded,
    };
  }, [
    apartmentSize,
    attachments,
    boxesNeeded,
    description,
    location,
    locationQuery,
    furnitureScope,
    isAuto,
    isPersonal,
    needsTruck,
    packingStatus,
    priceError,
    priceNote,
    priceQuote,
    suggestedPrice,
    assemblyComplexity,
    assemblyItems,
    itemName,
    itemSku,
    pieceCountInput,
    itemBrand,
    itemModel,
    itemComplexity,
    specialRequests,
    detailsPhotos,
    toolsNeeded,
  ]);

  const restoreFormState = useCallback(
    (formState: FurnitureAssemblyFormState) => {
      setLocationQuery(formState.locationQuery ?? '');
      setLocation(cloneSelectedLocation(formState.location ?? null));
      setDescription(formState.description ?? '');

      const nextIsAuto = Boolean(formState.isAuto);
      setIsAuto(nextIsAuto);
      slideAnimation.setValue(nextIsAuto ? 1 : 0);

      const nextIsPersonal = Boolean(formState.isPersonal);
      setIsPersonal(nextIsPersonal);
      slideAnimation2.setValue(nextIsPersonal ? 0 : 1);
      setPriceQuote(formState.priceQuote ?? null);
      setSuggestedPrice(typeof formState.suggestedPrice === 'number' ? formState.suggestedPrice : null);
      setPriceNote(formState.priceNote ?? null);
      setPriceError(formState.priceError ?? null);
      setAttachments(cloneAttachments(formState.attachments ?? []));
      setApartmentSize(formState.apartmentSize ?? '');
      setPackingStatus(formState.packingStatus ?? '');
      setNeedsTruck(formState.needsTruck ?? '');
      setBoxesNeeded(formState.boxesNeeded ?? '');
      setFurnitureScope(formState.furnitureScope ?? '');
      setAssemblyComplexity(formState.assemblyComplexity ?? '');
      setAssemblyItems(formState.assemblyItems ?? []);
      setItemName(formState.itemName ?? '');
      setItemSku(formState.itemSku ?? '');
      setPieceCountInput(formState.pieceCountInput ?? '1');
      setItemBrand(formState.itemBrand ?? '');
      setItemModel(formState.itemModel ?? '');
      setItemComplexity(formState.itemComplexity ?? '');
      setSpecialRequests(formState.specialRequests ?? '');
      setDetailsPhotos(cloneAttachments(formState.detailsPhotos ?? []));
      setToolsNeeded(formState.toolsNeeded ?? '');
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

    const payload: FurnitureAssemblyReturnData = {
      formState,
      action: 'schedule-furniture-assembly',
      timestamp: Date.now(),
    };

    if (sanitizedEntries.length > 0) {
      payload.params = Object.fromEntries(sanitizedEntries);
    }

    setReturnTo(FURNITURE_ASSEMBLY_RETURN_PATH, payload);
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
    async (options: { silent?: boolean } = {}): Promise<SelectedLocation | null> => {
      const { silent } = options;
      if (!silent) {
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
    if (!returnTo || returnTo.path !== FURNITURE_ASSEMBLY_RETURN_PATH || !returnTo.data) {
      return;
    }

    const payload = returnTo.data as FurnitureAssemblyReturnData;

    if (!payload?.formState) {
      clearReturnTo();
      return;
    }

    restoreFormState(payload.formState);
    clearReturnTo();

    if (payload.action === 'schedule-furniture-assembly') {
      setPendingResumeAction('schedule-furniture-assembly');
    }
  }, [user, getReturnTo, clearReturnTo, restoreFormState]);

  useEffect(() => {
    if (user) {
      setShowSignInModal(false);
    }
  }, [user]);


  const applyLocation = useCallback(
    (
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

      setLocationQuery(location.description);
      setLocation(location);
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

  const resetFurnitureAssemblyAnalysisFlow = useCallback(() => {
    setShowFurnitureAssemblyAnalysisModal(false);
    setCurrentQuestionStep(0);
    setApartmentSize('');
    setFurnitureScope('');
    setPackingStatus('');
    setNeedsTruck('');
    setBoxesNeeded('');
  }, []);

  const handleUseCurrentLocation = useCallback(
    async () => {
      const existingLocation =
        locationPermissionStatus === PermissionStatus.GRANTED && currentLocation
          ? currentLocation
          : null;

      if (existingLocation && !currentLocationLoading) {
        applyLocation(existingLocation);
        return;
      }

      const resolved = await loadCurrentLocation();
      if (resolved) {
        applyLocation(resolved);
      }
    },
    [applyLocation, currentLocation, currentLocationLoading, loadCurrentLocation, locationPermissionStatus],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) {
      return;
    }

    map.animateToRegion(
      {
        latitude: location.coordinate.latitude,
        longitude: location.coordinate.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      },
      300,
    );
  }, [location, mapEdgePadding]);

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

    setPriceQuote(null);
    setSuggestedPrice(null);

    if (typeof editingPayload.description === 'string') {
      const trimmed = editingPayload.description.trim();
      setDescription(trimmed);
      const parsedItems = parseAssemblyItemsFromDescription(trimmed);
      if (parsedItems.length > 0) {
        setAssemblyItems(parsedItems);
        setAssemblyComplexity(parsedItems[parsedItems.length - 1].complexity);
      }
      const toolsMatch = trimmed.match(/\btools needed:\s*([^.]*)/i);
      if (toolsMatch?.[1]) {
        setToolsNeeded(toolsMatch[1].trim());
      }
    } else {
      setDescription('');
    }

    setPriceNote(null);
    setPriceError(null);

    let cancelled = false;

    const hydrateLocations = async () => {
      const address = editingPayload.location?.trim();

      if (address) {
        const resolved = await geocodeAddress(address);
        if (cancelled) {
          return;
        }

        if (resolved) {
          applyLocation(resolved, { showStreetNumberWarning: false });
        } else {
          setLocationQuery(address);
          setLocation(null);
        }
      } else {
        setLocationQuery('');
        setLocation(null);
      }
    };

    hydrateLocations();

    return () => {
      cancelled = true;
    };
  }, [applyLocation, editServiceId, editingPayload, geocodeAddress, slideAnimation, slideAnimation2]);

  useEffect(() => {
    const hasItems = /\bassembly items:/i.test(description);
    if (!description) {
      if (lastEnhancedDescriptionRef.current) {
        setAssemblyComplexity('');
        setAssemblyItems([]);
        setToolsNeeded('');
        setSpecialRequests('');
        lastEnhancedDescriptionRef.current = null;
      }
      return;
    }
    if (hasItems) {
      lastEnhancedDescriptionRef.current = description;
      return;
    }
    if (lastEnhancedDescriptionRef.current) {
      setAssemblyComplexity('');
      setAssemblyItems([]);
      setToolsNeeded('');
      setSpecialRequests('');
      lastEnhancedDescriptionRef.current = null;
    }
  }, [description]);

  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    resetPriceState();
  }, [resetPriceState]);

  const fetchPriceEstimate = useCallback(
    async (
      taskDescription: string,
      items: AssemblyItemDraft[],
      tools: string,
      photoCount: number,
    ) => {
      setIsPriceLoading(true);
      setPriceQuote(null);
      setSuggestedPrice(null);
      setPriceNote(null);
      setPriceError(null);

      if (items.length === 0) {
        setIsPriceLoading(false);
        setPriceError('Add the item to assemble, including how many pieces.');
        return;
      }

      try {
        const body: Record<string, unknown> = {
          serviceType: 'furniture-assembly',
          description: taskDescription,
          photoCount,
          items: items.map(item => ({
            name: item.name || null,
            sku: item.sku || null,
            type: item.name || null,
            pieceCount: Number(item.pieceCount),
            complexity: item.complexity,
            brand: item.brand || null,
            model: item.model || null,
          })),
        };
        if (tools.trim()) body.toolsNeeded = tools.trim();

        const { data, error } = await supabase.functions.invoke('quote-service-price', { body });
        const estimate = data as {
          source?: string;
          serviceType?: string;
          priceMin?: number;
          priceMax?: number;
          suggestedPrice?: number;
          durationMinutes?: number;
          error?: string;
        } | null;
        if (
          error
          || !estimate
          || estimate.source !== 'server'
          || estimate.serviceType !== 'furniture-assembly'
          || typeof estimate.priceMin !== 'number'
          || typeof estimate.priceMax !== 'number'
          || typeof estimate.suggestedPrice !== 'number'
        ) {
          throw new Error(estimate?.error || error?.message || 'Failed to fetch price estimate');
        }

        setSuggestedPrice(estimate.suggestedPrice);
        setPriceQuote(`${formatCurrency(estimate.priceMin)}–${formatCurrency(estimate.priceMax)}`);
        if (typeof estimate.durationMinutes === 'number') {
          setPriceNote(formatDurationLabel(estimate.durationMinutes));
        }
      } catch (error) {
        console.warn('Failed to fetch price estimate', error);
        setPriceError('Unable to estimate price right now.');
      } finally {
        setIsPriceLoading(false);
      }
    },
    [],
  );

  const handleDescriptionSubmit = useCallback(() => {
    if (isPriceLoading || isTranscribing) {
      return;
    }

    const trimmed = description.trim();

    if (trimmed.length === 0) {
      setPriceQuote(null);
      setSuggestedPrice(null);
      setPriceNote(null);
      setPriceError('Add a brief task description to see a price.');
      return;
    }

    if (!location) {
      showModal({
        title: 'Missing location',
        message: 'Please enter a location.',
      });
      return;
    }

    Keyboard.dismiss();

    if (!assemblyComplexity) {
      setShowAssemblyComplexityModal(true);
      return;
    }

    if (assemblyItems.length === 0) {
      setItemComplexity(assemblyComplexity);
      setShowApartmentSizeModal(true);
      return;
    }

    const photoCount = countAssemblyPhotos(detailsPhotos, attachments);
    const enhanced = buildAssemblyDescription(trimmed, assemblyItems, toolsNeeded, specialRequests, photoCount);
    if (enhanced !== description) {
      setDescription(enhanced);
    }
    void fetchPriceEstimate(enhanced, assemblyItems, toolsNeeded, photoCount);
  }, [
    assemblyComplexity,
    assemblyItems,
    attachments,
    description,
    detailsPhotos,
    fetchPriceEstimate,
    isPriceLoading,
    isTranscribing,
    location,
    showModal,
    specialRequests,
    toolsNeeded,
  ]);

  const analyzeFurnitureAssemblyDescription = useCallback((text: string) => {
    const lowerText = text.toLowerCase();

    const spelledOutBedroomPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple)\s*(?:-|\s)?\s*(bedroom|bed|br|room|apt|apartment)s?\b/;

    const hasApartmentSize = /\b(\d+)\s*(bedroom|br|room|apt|apartment)\b/i.test(lowerText) ||
      /\b(studio|1br|2br|3br|4br|5br)\b/i.test(lowerText) ||
      spelledOutBedroomPattern.test(lowerText);

    const hasPackingStatus = /\b(pack|packed|packing|unpack|unpacked|unpacking)\b/i.test(lowerText);

    const hasTruckInfo = /\b(truck|cleaning truck|rental truck|vehicle|car|van)\b/i.test(lowerText);

    const hasBoxInfo = /\b(box|boxes|packing tools|tools)\b/i.test(lowerText);

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

  const furnitureAssemblyAnalysis = useMemo(() => {
    const analysis = analyzeFurnitureAssemblyDescription(description);

    const missingInfo: string[] = [];

    if (analysis.missingStreetNumber) missingInfo.push('street number');

    // Determine which questions to show - no moving-related questions for furniture assembly service
    const questionsToShow: Array<{ id: string; title: string; message: string; placeholder: string; multiline?: boolean; options?: string[] }> = [];
    
    return {
      ...analysis,
      missingInfo,
      questionsToShow,
    };
  }, [analyzeFurnitureAssemblyDescription, description]);

  const handleFurnitureAssemblyAnalysisSubmit = useCallback(() => {
    const analysis = analyzeFurnitureAssemblyDescription(description);

    if (!analysis.hasStreetNumber) {
      showModal({
        title: 'Add street number',
        message: 'Update your location to include the street number so your helpr can find you.',
      });
      return;
    }
    
    // For furniture assembly service, no additional questions needed - proceed directly
    handleDescriptionSubmit();
  }, [analyzeFurnitureAssemblyDescription, description, handleDescriptionSubmit, showModal]);

  const handleAnalysisModalSubmit = useCallback(() => {
    // For furniture assembly service, no modal questions - this should not be called
    resetFurnitureAssemblyAnalysisFlow();
    handleDescriptionSubmit();
  }, [handleDescriptionSubmit, resetFurnitureAssemblyAnalysisFlow]);

  const handleAnalysisModalBack = useCallback(() => {
    if (currentQuestionStep === 0) {
      resetFurnitureAssemblyAnalysisFlow();
      return;
    }

    setCurrentQuestionStep(prev => Math.max(0, prev - 1));
  }, [currentQuestionStep, resetFurnitureAssemblyAnalysisFlow]);

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

  const handleDetailsPhotoUpload = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showModal({
          title: 'Permission needed',
          message: 'Enable photo library access to attach images.',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (result.canceled || !(result.assets && result.assets.length > 0)) {
        return;
      }

      const asset = result.assets[0];
      const name = asset.fileName ?? 'details-photo.jpg';

      setDetailsPhotos(prev => [...prev, { uri: asset.uri, type: 'photo', name }]);
    } catch (error) {
      console.warn('Photo picker error', error);
      showModal({
        title: 'Upload failed',
        message: 'Unable to select photo right now.',
      });
    }
  }, [showModal]);

  const buildDraftItem = useCallback((): AssemblyItemDraft | null => {
    const complexity = itemComplexity || assemblyComplexity;
    const pieceCount = readPieceCount(pieceCountInput);
    const name = itemName.trim();
    const sku = itemSku.trim();
    if ((!name && !sku) || pieceCount == null || !complexity) return null;
    return {
      name,
      sku,
      pieceCount: String(pieceCount),
      complexity,
      brand: itemBrand.trim(),
      model: itemModel.trim(),
    };
  }, [assemblyComplexity, itemBrand, itemComplexity, itemModel, itemName, itemSku, pieceCountInput]);

  const clearItemDraft = useCallback(() => {
    setItemName('');
    setItemSku('');
    setPieceCountInput('1');
    setItemBrand('');
    setItemModel('');
    setItemComplexity(assemblyComplexity || '');
  }, [assemblyComplexity]);

  const handleAssemblyComplexitySelect = useCallback((type: AssemblyComplexity) => {
    setAssemblyComplexity(type);
    setItemComplexity(type);
    setShowAssemblyComplexityModal(false);
    setShowApartmentSizeModal(true);
    resetPriceState();
  }, [resetPriceState]);

  const handleApartmentSizeBack = useCallback(() => {
    setShowApartmentSizeModal(false);
    setShowAssemblyComplexityModal(true);
  }, []);

  const handleAddAssemblyItem = useCallback(() => {
    const draft = buildDraftItem();
    if (!draft) return;
    setAssemblyItems(prev => [...prev, draft]);
    clearItemDraft();
    resetPriceState();
  }, [buildDraftItem, clearItemDraft, resetPriceState]);

  const handleRemoveAssemblyItem = useCallback((index: number) => {
    setAssemblyItems(prev => prev.filter((_, itemIndex) => itemIndex !== index));
    resetPriceState();
  }, [resetPriceState]);

  const handleApartmentSizeSubmit = useCallback(() => {
    const draft = buildDraftItem();
    const draftStarted = Boolean(
      itemName.trim()
      || itemSku.trim()
      || itemBrand.trim()
      || itemModel.trim()
      || pieceCountInput.trim() !== '1',
    );
    if (!draft && draftStarted) return;
    const next = draft ? [...assemblyItems, draft] : assemblyItems;
    if (next.length === 0) return;
    if (draft) {
      setAssemblyItems(next);
      clearItemDraft();
    }
    resetPriceState();
    setShowApartmentSizeModal(false);
    setShowToolsModal(true);
  }, [assemblyItems, buildDraftItem, clearItemDraft, itemBrand, itemModel, itemName, itemSku, pieceCountInput, resetPriceState]);

  const handleToolsBack = useCallback(() => {
    setShowToolsModal(false);
    setShowApartmentSizeModal(true);
  }, []);

  const handleToolsSubmit = useCallback(() => {
    setShowToolsModal(false);
    setShowDetailsModal(true);
  }, []);

  const handleDetailsBack = useCallback(() => {
    setShowDetailsModal(false);
    setShowToolsModal(true);
  }, []);

  const handleDetailsSubmit = useCallback(() => {
    setShowDetailsModal(false);
    if (!description.trim() || !location) return;
    if (assemblyItems.length === 0) {
      setShowApartmentSizeModal(true);
      return;
    }
    const photoCount = countAssemblyPhotos(detailsPhotos, attachments);
    const enhanced = buildAssemblyDescription(description, assemblyItems, toolsNeeded, specialRequests, photoCount);
    setDescription(enhanced);
    void fetchPriceEstimate(enhanced, assemblyItems, toolsNeeded, photoCount);
  }, [assemblyItems, attachments, description, detailsPhotos, fetchPriceEstimate, location, specialRequests, toolsNeeded]);

  const snapshotLocations = useCallback(() => {
    locationSnapshotRef.current = {
      locationQuery,
      location,
    };
  }, [location, locationQuery]);

  const restoreLocations = useCallback(() => {
    const snapshot = locationSnapshotRef.current;
    if (!snapshot) {
      return;
    }

    setLocationQuery(snapshot.locationQuery);
    setLocation(snapshot.location);
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
        message: 'Please describe what you need help with before scheduling your furniture assembly service.',
        onDismiss: restoreLocations,
      });
      return;
    }

    if (!location) {
      showModal({
        title: 'Add location',
        message: 'Please provide a location before scheduling.',
      });
      return;
    }

    if (!isWithinServiceArea(location.coordinate)) {
      showModal({
        title: 'We\'re not in your area yet.',
        message: "Helpr currently operates in NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ. Please pick an address within this area to continue.",
      });
      return;
    }

    if (assemblyItems.length === 0) {
      showModal({
        title: 'Item needed',
        message: 'Add the item you need assembled, including a piece count, before scheduling.',
      });
      return;
    }

    if (!Number.isFinite(suggestedPrice ?? NaN)) {
      showModal({
        title: 'Estimate needed',
        message: 'Request a quick price estimate before scheduling your furniture assembly service.',
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

    const photoCount = countAssemblyPhotos(detailsPhotos, attachments);
    const normalizedDescription = buildAssemblyDescription(
      trimmedDescription,
      assemblyItems,
      toolsNeeded,
      specialRequests,
      photoCount,
    );
    const paymentMethodType = isPersonal ? 'Personal' : 'Business';
    const autofillType = isAuto ? 'AutoFill' : 'Custom';
    const targetServiceId = isEditing && editServiceId ? editServiceId : createUuid();

    try {
      setIsSubmitting(true);

      if (isEditing && editServiceId) {
        const updatePayload: Record<string, unknown> = {
          location: location.description,
          price: suggestedPrice,
          payment_method_type: paymentMethodType,
          autofill_type: autofillType,
          description: normalizedDescription,
        };

        const { error } = await supabase
          .from('service')
          .update(updatePayload)
          .eq('service_id', editServiceId);

        if (error) {
          console.error('Failed to update furniture assembly service:', error);
          showModal({
            title: 'Update failed',
            message: 'Unable to save changes to your furniture assembly request. Please try again.',
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
        service_type: 'furniture-assembly',
        status: 'finding_pros',
        scheduling_type: null,
        location: location.description,
        price: suggestedPrice,
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
        pathname: '/(booking-flow)/booked-services' as any,
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
    detailsPhotos,
    editServiceId,
    location,
    isAuto,
    isEditing,
    isPersonal,
    isSubmitting,
    suggestedPrice,
    preserveFormForAuth,
    resolveCustomerId,
    router,
    snapshotLocations,
    restoreLocations,
    user,
    assemblyItems,
    toolsNeeded,
    specialRequests,
  ]);

  useEffect(() => {
    if (!user || pendingResumeAction !== 'schedule-furniture-assembly' || isSubmitting) {
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

  const handleLocationChange = useCallback(
    (text: string) => {
      setLocationQuery(text);
      setLocation(null);
      resetPriceState();

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

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
      if (!suggestion.placeId) {
        return;
      }
      setLoading(true);
      const details = await fetchPlaceDetails(suggestion.placeId, sessionToken);
      setLoading(false);

      if (!details) {
        return;
      }

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
    if (currentLocation) {
      return currentLocation.description;
    }

    if (locationPermissionStatus === PermissionStatus.DENIED) {
      return 'Enable location access in Settings to use this option.';
    }

    return 'Fill with your device\'s current GPS position.';
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
            {location && (
              <Marker
                coordinate={location.coordinate}
                title="Location"
                description={location.description}
                anchor={{ x: 0.5, y: 1 }}
                centerOffset={{ x: 0, y: -12 }}
                tracksViewChanges={false}
              >
                <Image
                  source={require('../../assets/icons/ConfirmLocationIcon.png')}
                  style={styles.LocationIcon}
                />
              </Marker>
            )}
          </MapView>
        </View>
        <View style={styles.contentArea}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Image 
              source={require('../../assets/icons/backButton.png')} 
              style={styles.backButtonIcon} 
            />
          </Pressable>
          <View style={styles.panel}>
            <Text style={styles.title}>Furniture Assembly Details</Text>
            <View style={styles.DividerContainer1}>
                <View style={styles.DividerLine1} />
            </View>
            <View style={[
              styles.locationSection, 
              styles.locationSectionStart,
              isSuggestionsVisible ? styles.locationSectionEndDropdownVisible : null
            ]}>  
              <View style={styles.locationLabelRow}>
                <Image
                  source={require('../../assets/icons/ConfirmLocationIcon.png')}
                  style={[styles.confirmLocationIcon, { width: 24, height: 24, resizeMode: 'contain' }]}
                />
                <LocationAutocompleteInput
                value={locationQuery}
                placeholder="Assembly location"
                onChangeText={handleLocationChange}
                onSelectSuggestion={handleLocationSelect}
                onClear={handleLocationClear}
                suggestions={suggestions}
                loading={loading || currentLocationLoading}
                currentLocationOption={currentLocationOption}
                onSuggestionsVisibilityChange={handleSuggestionsVisibilityChange}
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
                        <View>
                          <View style={styles.PriceOfServiceQuoteRow}>
                            <Text
                              style={[styles.PriceOfServiceQuoteText, styles.PriceOfServiceQuotePrice]}
                              numberOfLines={1}
                            >
                              {priceQuote}
                            </Text>
                            <Text style={styles.PriceOfServiceQuoteEstimateText}>est.</Text>
                          </View>
                          {priceNote ? (
                            <Text style={styles.PriceOfServiceQuoteNoteText} numberOfLines={2}>
                              {priceNote}
                            </Text>
                          ) : null}
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
                placeholder="Describe the furniture... (e.g. 'Assemble an IKEA dining chair.')"
                multiline
                numberOfLines={4}
                placeholderTextColor="#333333ab"
                value={description}
                onChangeText={handleDescriptionChange}
                onSubmitEditing={handleFurnitureAssemblyAnalysisSubmit}
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
                    source={require('../../assets/icons/ChooseHelprIcon.png')} 
                    style={[styles.binarySliderIcon, { opacity: isAuto ? 0.5 : 1, marginLeft: 7 }]} 
                  />
                  <Image 
                    source={require('../../assets/icons/AutoFillIcon.png')} 
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
                      source={require('../../assets/icons/PersonalPMIcon.png')} 
                      style={styles.binarySliderIcon2} 
                    />
                    <Image 
                      source={require('../../assets/icons/BusinessPMIcon.png')} 
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
                  source={require('../../assets/icons/PMIcon.png')} 
                  style={styles.pmIcon} 
                />
                <Image 
                  source={require('../../assets/icons/ArrowIcon.png')} 
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
              Please sign in or sign up to schedule a furniture assembly service.
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
            <Pressable
              style={styles.cancelButton}
              onPress={() => setShowSignInModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Assembly Complexity Selection Modal */}
      <Modal
        visible={showAssemblyComplexityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAssemblyComplexityModal(false)}
      >
        <View style={styles.signInOverlayBackground}>
          <View style={styles.signInModal}>
            <Text style={styles.signInTitle}>Select Assembly Complexity</Text>
            <View style={styles.signInDivider} />
            <Text style={styles.signInMessage}>
              This is the default complexity for each item. A chair is simple. A wardrobe is complex.
            </Text>
            <View style={styles.assemblyComplexityOptionsContainer}>
              <Pressable 
                style={[styles.assemblyComplexityOption, assemblyComplexity === 'simple' && styles.assemblyComplexityOptionSelected]}
                onPress={() => handleAssemblyComplexitySelect('simple')}
              >
                <Text style={[styles.assemblyComplexityOptionText, assemblyComplexity === 'simple' && styles.assemblyComplexityOptionTextSelected]}>
                  Simple
                </Text>
                <Text style={styles.assemblyComplexityOptionDescription}>
                  One chair, stool, or small table
                </Text>
              </Pressable>
              <Pressable 
                style={[styles.assemblyComplexityOption, assemblyComplexity === 'moderate' && styles.assemblyComplexityOptionSelected]}
                onPress={() => handleAssemblyComplexitySelect('moderate')}
              >
                <Text style={[styles.assemblyComplexityOptionText, assemblyComplexity === 'moderate' && styles.assemblyComplexityOptionTextSelected]}>
                  Moderate
                </Text>
                <Text style={styles.assemblyComplexityOptionDescription}>
                  A desk, bookshelf, or TV stand
                </Text>
              </Pressable>
              <Pressable 
                style={[styles.assemblyComplexityOption, assemblyComplexity === 'complex' && styles.assemblyComplexityOptionSelected]}
                onPress={() => handleAssemblyComplexitySelect('complex')}
              >
                <Text style={[styles.assemblyComplexityOptionText, assemblyComplexity === 'complex' && styles.assemblyComplexityOptionTextSelected]}>
                  Complex
                </Text>
                <Text style={styles.assemblyComplexityOptionDescription}>
                  A wardrobe, bed frame, or entertainment center
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.assemblyComplexityModalCancelButton}
              onPress={() => setShowAssemblyComplexityModal(false)}
            >
              <Text style={styles.assemblyComplexityModalCancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Items to assemble */}
      <Modal
        visible={showApartmentSizeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowApartmentSizeModal(false)}
      >
        <View style={styles.signInOverlayBackground}>
          <View style={styles.apartmentSizeModal}>
            <ScrollView style={styles.assemblyItemScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.apartmentSizeTitle}>Items to assemble</Text>
            <View style={styles.apartmentSizeDivider} />
            <Text style={styles.apartmentSizeMessage}>
              Add each product. Name, SKU, or type is required, plus how many pieces.
            </Text>
            {assemblyItems.map((item, index) => (
              <View key={`${item.name}-${item.sku}-${index}`} style={styles.assemblyItemChip}>
                <Text style={styles.assemblyItemChipText}>
                  {`${item.name || item.sku} · ${item.pieceCount} pc · ${item.complexity}`}
                </Text>
                <Pressable onPress={() => handleRemoveAssemblyItem(index)}>
                  <Text style={styles.assemblyItemRemoveText}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <Text style={styles.assemblyFieldLabel}>Product name or type</Text>
            <TextInput
              style={styles.furnitureAssemblyAnalysisInput}
              placeholder="e.g. dining chair or PAX wardrobe"
              placeholderTextColor="#7C7160"
              value={itemName}
              onChangeText={setItemName}
            />
            <Text style={styles.assemblyFieldLabel}>SKU (optional)</Text>
            <TextInput
              style={styles.furnitureAssemblyAnalysisInput}
              placeholder="e.g. ADDE or PAX"
              placeholderTextColor="#7C7160"
              value={itemSku}
              onChangeText={setItemSku}
              autoCapitalize="characters"
            />
            <Text style={styles.assemblyFieldLabel}>Piece count</Text>
            <TextInput
              style={styles.furnitureAssemblyAnalysisInput}
              placeholder="1 for a chair, 8 for a wardrobe"
              placeholderTextColor="#7C7160"
              value={pieceCountInput}
              onChangeText={setPieceCountInput}
              keyboardType="number-pad"
            />
            <Text style={styles.assemblyFieldLabel}>Complexity</Text>
            <View style={styles.assemblyComplexityOptionsContainer}>
              {(['simple', 'moderate', 'complex'] as AssemblyComplexity[]).map(level => (
                <Pressable
                  key={level}
                  style={[styles.assemblyComplexityOption, (itemComplexity || assemblyComplexity) === level && styles.assemblyComplexityOptionSelected]}
                  onPress={() => setItemComplexity(level)}
                >
                  <Text style={[styles.assemblyComplexityOptionText, (itemComplexity || assemblyComplexity) === level && styles.assemblyComplexityOptionTextSelected]}>
                    {level}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.assemblyFieldLabel}>Brand (optional)</Text>
            <TextInput
              style={styles.furnitureAssemblyAnalysisInput}
              placeholder="e.g. IKEA"
              placeholderTextColor="#7C7160"
              value={itemBrand}
              onChangeText={setItemBrand}
            />
            <Text style={styles.assemblyFieldLabel}>Model (optional)</Text>
            <TextInput
              style={styles.furnitureAssemblyAnalysisInput}
              placeholder="e.g. ADDE"
              placeholderTextColor="#7C7160"
              value={itemModel}
              onChangeText={setItemModel}
            />
            <Pressable
              style={[styles.apartmentSizeContinueButton, !((itemName.trim() || itemSku.trim()) && readPieceCount(pieceCountInput) != null && (itemComplexity || assemblyComplexity)) && { opacity: 0.5 }]}
              onPress={handleAddAssemblyItem}
              disabled={!((itemName.trim() || itemSku.trim()) && readPieceCount(pieceCountInput) != null && (itemComplexity || assemblyComplexity))}
            >
              <Text style={styles.apartmentSizeContinueButtonText}>Add item</Text>
            </Pressable>
            <View style={styles.apartmentSizeButtonsRow}>
              <Pressable
                style={styles.apartmentSizeBackButton}
                onPress={handleApartmentSizeBack}
              >
                <Text style={styles.apartmentSizeBackButtonText}>Back</Text>
              </Pressable>
              <Pressable 
                style={[styles.apartmentSizeContinueButton, assemblyItems.length === 0 && !((itemName.trim() || itemSku.trim()) && readPieceCount(pieceCountInput) != null && (itemComplexity || assemblyComplexity)) && { opacity: 0.5 }]}
                onPress={handleApartmentSizeSubmit}
                disabled={assemblyItems.length === 0 && !((itemName.trim() || itemSku.trim()) && readPieceCount(pieceCountInput) != null && (itemComplexity || assemblyComplexity))}
              >
                <Text style={styles.apartmentSizeContinueButtonText}>Continue</Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Tools Needed Modal */}
      <Modal
        visible={showToolsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowToolsModal(false)}
      >
        <View style={styles.signInOverlayBackground}>
          <View style={styles.toolsModal}>
            <Text style={styles.toolsModalTitle}>Tools needed</Text>
            <View style={styles.toolsModalDivider} />
            <Text style={styles.toolsModalMessage}>
              Optional. What tools should your Helpr bring?
            </Text>
            
            <TextInput
              style={styles.furnitureAssemblyAnalysisInput}
              placeholder="e.g. Allen key, rubber mallet"
              placeholderTextColor="#7C7160"
              value={toolsNeeded}
              onChangeText={setToolsNeeded}
              multiline
              numberOfLines={3}
              autoFocus
            />

            <View style={styles.toolsModalButtonsRow}>
              <Pressable
                style={styles.toolsModalBackButton}
                onPress={handleToolsBack}
              >
                <Text style={styles.toolsModalBackButtonText}>Back</Text>
              </Pressable>
              <Pressable 
                style={styles.toolsModalContinueButton}
                onPress={handleToolsSubmit}
              >
                <Text style={styles.toolsModalContinueButtonText}>{toolsNeeded.trim() ? 'Continue' : 'Skip'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Details and Photos Modal */}
      <Modal
        visible={showDetailsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.signInOverlayBackground}>
          <View style={styles.detailsModal}>
            <Text style={styles.detailsModalTitle}>Any Special Requests?</Text>
            <View style={styles.detailsModalDivider} />
            <Text style={styles.detailsModalMessage}>
              Share product photos or other details (optional):
            </Text>
            
            <TextInput
              style={styles.specialRequestsInput}
              placeholder="e.g. Hardware is in the red bag, assemble in the bedroom..."
              multiline
              numberOfLines={4}
              placeholderTextColor="#7C7160"
              value={specialRequests}
              onChangeText={setSpecialRequests}
            />

            <Pressable
              style={styles.addPhotosButton}
              onPress={handleDetailsPhotoUpload}
            >
              <SvgXml xml={cameraIconSvg} width="20" height="20" />
              <Text style={styles.addPhotosButtonText}>Add Photos</Text>
            </Pressable>

            {detailsPhotos.length > 0 && (
              <View style={styles.detailsPhotosSummary}>
                <Text style={styles.detailsPhotosSummaryText}>
                  {detailsPhotos.length} photo{detailsPhotos.length > 1 ? 's' : ''} attached
                </Text>
              </View>
            )}

            <View style={styles.signInButtonsRow}>
              <Pressable
                style={styles.detailsModalSkipButton}
                onPress={handleDetailsBack}
              >
                <Text style={styles.detailsModalSkipButtonText}>Back</Text>
              </Pressable>
              <Pressable 
                style={styles.detailsModalContinueButton}
                onPress={handleDetailsSubmit}
              >
                <Text style={styles.detailsModalContinueButtonText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* cleaning Analysis Modal */}
      <Modal
        visible={showFurnitureAssemblyAnalysisModal}
        transparent={true}
        animationType="fade"
        onRequestClose={resetFurnitureAssemblyAnalysisFlow}
      >
        <View style={styles.furnitureAssemblyAnalysisOverlayBackground}>
          <View style={styles.furnitureAssemblyAnalysisModal}>
            {furnitureAssemblyAnalysis.questionsToShow.length > 0 && (
              <>
                <Text style={styles.furnitureAssemblyAnalysisTitle}>
                  {furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.title}
                </Text>
                <Text style={styles.furnitureAssemblyAnalysisMessage}>
                  {furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.message}
                </Text>

                {furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'needsTruck' && (
                  <View style={styles.furnitureAssemblyAnalysisOptionsContainer}>
                    <Pressable
                      style={[styles.furnitureAssemblyAnalysisOption, needsTruck === 'yes' && styles.furnitureAssemblyAnalysisOptionSelected]}
                      onPress={() => setNeedsTruck('yes')}
                    >
                      <Text style={[styles.furnitureAssemblyAnalysisOptionText, needsTruck === 'yes' && styles.furnitureAssemblyAnalysisOptionTextSelected]}>
                        Yes, I need a truck
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.furnitureAssemblyAnalysisOption, needsTruck === 'no' && styles.furnitureAssemblyAnalysisOptionSelected]}
                      onPress={() => setNeedsTruck('no')}
                    >
                      <Text style={[styles.furnitureAssemblyAnalysisOptionText, needsTruck === 'no' && styles.furnitureAssemblyAnalysisOptionTextSelected]}>
                        No, I don't need a truck
                      </Text>
                    </Pressable>
                  </View>
                )}

                {furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'packingStatus' && (
                  <View style={styles.furnitureAssemblyAnalysisOptionsContainer}>
                    <Pressable
                      style={[styles.furnitureAssemblyAnalysisOption, packingStatus === 'not-packed' && styles.furnitureAssemblyAnalysisOptionSelected]}
                      onPress={() => setPackingStatus('not-packed')}
                    >
                      <Text style={[styles.furnitureAssemblyAnalysisOptionText, packingStatus === 'not-packed' && styles.furnitureAssemblyAnalysisOptionTextSelected]}>
                        Yes, I need help packing
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.furnitureAssemblyAnalysisOption, packingStatus === 'packed' && styles.furnitureAssemblyAnalysisOptionSelected]}
                      onPress={() => setPackingStatus('packed')}
                    >
                      <Text style={[styles.furnitureAssemblyAnalysisOptionText, packingStatus === 'packed' && styles.furnitureAssemblyAnalysisOptionTextSelected]}>
                        No, everything is already packed
                      </Text>
                    </Pressable>
                  </View>
                )}

                {furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'boxesNeeded' && (
                  <View style={styles.furnitureAssemblyAnalysisOptionsContainer}>
                    <Pressable
                      style={[styles.furnitureAssemblyAnalysisOption, boxesNeeded === 'yes' && styles.furnitureAssemblyAnalysisOptionSelected]}
                      onPress={() => setBoxesNeeded('yes')}
                    >
                      <Text style={[styles.furnitureAssemblyAnalysisOptionText, boxesNeeded === 'yes' && styles.furnitureAssemblyAnalysisOptionTextSelected]}>
                        Yes, please bring boxes
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.furnitureAssemblyAnalysisOption, boxesNeeded === 'no' && styles.furnitureAssemblyAnalysisOptionSelected]}
                      onPress={() => setBoxesNeeded('no')}
                    >
                      <Text style={[styles.furnitureAssemblyAnalysisOptionText, boxesNeeded === 'no' && styles.furnitureAssemblyAnalysisOptionTextSelected]}>
                        No, I have boxes
                      </Text>
                    </Pressable>
                  </View>
                )}

                {furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'apartmentSize' && (
                  <TextInput
                    style={styles.furnitureAssemblyAnalysisInput}
                    placeholder={furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.placeholder}
                    value={apartmentSize}
                    onChangeText={setApartmentSize}
                    autoFocus
                  />
                )}

                {furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'furnitureScope' && (
                  <TextInput
                    style={styles.furnitureAssemblyAnalysisInput}
                    placeholder={furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.placeholder}
                    value={furnitureScope}
                    onChangeText={setFurnitureScope}
                    autoFocus
                    multiline
                    numberOfLines={3}
                  />
                )}

                <View style={styles.furnitureAssemblyAnalysisButtonsRow}>
                  <Pressable 
                    style={styles.furnitureAssemblyAnalysisCancelButton}
                    onPress={handleAnalysisModalBack}
                  >
                    <Text style={styles.furnitureAssemblyAnalysisCancelButtonText}>Back</Text>
                  </Pressable>
                  <Pressable 
                    style={styles.furnitureAssemblyAnalysisButton}
                    onPress={handleAnalysisModalSubmit}
                    disabled={
                      (furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'packingStatus' && !packingStatus) ||
                      (furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'needsTruck' && !needsTruck) ||
                      (furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'boxesNeeded' && !boxesNeeded) ||
                      (furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'apartmentSize' && !apartmentSize.trim()) ||
                      (furnitureAssemblyAnalysis.questionsToShow[currentQuestionStep]?.id === 'furnitureScope' && !furnitureScope.trim())
                    }
                  >
                    <Text style={styles.furnitureAssemblyAnalysisButtonText}>
                      {currentQuestionStep < furnitureAssemblyAnalysis.questionsToShow.length - 1 ? 'Next' : 'Continue'}
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
    height: '62%',
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
    paddingTop: 5,
    paddingLeft: 5,
    marginBottom: 5,
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
    marginTop: 0,
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
  LocationIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
    marginBottom: 10,
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
    borderRadius: 20,
    marginBottom: 10,
    position: 'relative',
    paddingTop: 2,
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
    width: '80%',
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
  // cleaning Analysis Modal Styles
  furnitureAssemblyAnalysisOverlayBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  furnitureAssemblyAnalysisModal: {
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
  furnitureAssemblyAnalysisTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 15,
  },
  furnitureAssemblyAnalysisMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  furnitureAssemblyAnalysisInput: {
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
  furnitureAssemblyAnalysisRadioGroup: {
    width: '100%',
    marginBottom: 20,
  },
  furnitureAssemblyAnalysisRadioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  furnitureAssemblyAnalysisRadioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#0c4309',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  furnitureAssemblyAnalysisRadioSelected: {
    backgroundColor: '#0c4309',
  },
  furnitureAssemblyAnalysisRadioText: {
    fontSize: 16,
    color: '#0c4309',
    fontWeight: '500',
  },
  furnitureAssemblyAnalysisButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  furnitureAssemblyAnalysisButton: {
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
  furnitureAssemblyAnalysisButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  furnitureAssemblyAnalysisCancelButton: {
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
  furnitureAssemblyAnalysisCancelButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  furnitureAssemblyAnalysisOptionsContainer: {
    width: '100%',
    marginBottom: 20,
  },
  furnitureAssemblyAnalysisOption: {
    backgroundColor: '#E5DCC9',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#E5DCC9',
  },
  furnitureAssemblyAnalysisOptionSelected: {
    backgroundColor: '#0c4309',
    borderColor: '#0c4309',
  },
  furnitureAssemblyAnalysisOptionText: {
    fontSize: 16,
    color: '#0c4309',
    fontWeight: '500',
    textAlign: 'center',
  },
  furnitureAssemblyAnalysisOptionTextSelected: {
    color: '#FFFFFF',
  },
  assemblyComplexityOptionsContainer: {
    width: '100%',
    marginVertical: 15,
  },
  assemblyComplexityOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5DCC9',
  },
  assemblyComplexityOptionSelected: {
    backgroundColor: '#0c4309',
    borderColor: '#0c4309',
  },
  assemblyComplexityOptionText: {
    fontSize: 18,
    color: '#0c4309',
    fontWeight: '600',
    marginBottom: 5,
  },
  assemblyComplexityOptionTextSelected: {
    color: '#FFFFFF',
  },
  assemblyComplexityOptionDescription: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 19,
    marginTop: 4,
  },
  detailsModal: {
    backgroundColor: '#E5DCC9',
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 25,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  detailsModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  detailsModalDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: '#CAC4D0',
    marginBottom: 10,
    marginHorizontal: -25,
  },
  detailsModalMessage: {
    fontSize: 12,
    color: '#49454F',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 15,
  },
  detailsModalSkipButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 30,
    flex: 1,
    marginRight: 8,
    borderWidth: 2,
    borderColor: '#0c4309',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsModalSkipButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  detailsModalContinueButton: {
    backgroundColor: '#0c4309',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 30,
    flex: 1,
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsModalContinueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  specialRequestsInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333333',
    borderWidth: 1,
    borderColor: '#0c4309',
    marginVertical: 15,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  addPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0c4309',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 15,
    gap: 10,
  },
  addPhotosButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  detailsPhotosSummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#0c4309',
  },
  detailsPhotosSummaryText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  apartmentSizeModal: {
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    padding: 25,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  apartmentSizeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 12,
    textAlign: 'center',
  },
  apartmentSizeDivider: {
    height: 1,
    backgroundColor: '#CAC4D0',
    marginBottom: 15,
  },
  apartmentSizeMessage: {
    fontSize: 12,
    color: '#49454F',
    marginBottom: 20,
    lineHeight: 20,
    textAlign: 'center',
  },
  apartmentSizeButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 10,
  },
  apartmentSizeBackButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    borderWidth: 2,
    borderColor: '#0c4309',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apartmentSizeBackButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  apartmentSizeContinueButton: {
    backgroundColor: '#0c4309',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apartmentSizeContinueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  toolsModal: {
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    padding: 25,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toolsModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 12,
    textAlign: 'center',
  },
  toolsModalDivider: {
    height: 1,
    backgroundColor: '#CAC4D0',
    marginBottom: 15,
  },
  toolsModalMessage: {
    fontSize: 12,
    color: '#49454F',
    marginBottom: 20,
    lineHeight: 20,
    textAlign: 'center',
  },
  toolsModalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 10,
  },
  toolsModalBackButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    borderWidth: 2,
    borderColor: '#0c4309',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolsModalBackButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  toolsModalContinueButton: {
    backgroundColor: '#0c4309',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolsModalContinueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  assemblyComplexityModalCancelButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 30,
    marginTop: 15,
    borderWidth: 2,
    borderColor: '#0c4309',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    width: '100%',
  },
  assemblyComplexityModalCancelButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  assemblyItemScroll: {
    maxHeight: 520,
    alignSelf: 'stretch',
  },
  assemblyFieldLabel: {
    alignSelf: 'flex-start',
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  assemblyItemChip: {
    alignSelf: 'stretch',
    backgroundColor: '#E5DCC9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assemblyItemChipText: {
    flex: 1,
    color: '#0c4309',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 8,
  },
  assemblyItemRemoveText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '700',
  },
});


