import Constants from 'expo-constants';
import { LatLng } from 'react-native-maps';
import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { MovingAnalysisResult, MovingModalQuestion, MovingQuestionsState, SelectedLocation, ServiceZoneBoundingBox } from './moving.types';

// ============================================================
// Constants
// ============================================================

export const MOVING_RETURN_PATH = 'moving';

export const ALLOWED_SERVICE_ZONES: ServiceZoneBoundingBox[] = [
  { name: 'Manhattan', minLat: 40.6808, maxLat: 40.8820, minLng: -74.0477, maxLng: -73.9070 },
  { name: 'Brooklyn', minLat: 40.5512, maxLat: 40.7395, minLng: -74.0530, maxLng: -73.8334 },
  { name: 'Queens', minLat: 40.5380, maxLat: 40.8007, minLng: -73.9620, maxLng: -73.7004 },
  { name: 'Bronx', minLat: 40.7850, maxLat: 40.9176, minLng: -73.9330, maxLng: -73.7650 },
  { name: 'Staten Island', minLat: 40.4810, maxLat: 40.6510, minLng: -74.2557, maxLng: -74.0520 },
  { name: 'Westchester County', minLat: 40.8940, maxLat: 41.3570, minLng: -74.0770, maxLng: -73.4810 },
  { name: 'Hudson County', minLat: 40.6500, maxLat: 40.8770, minLng: -74.1200, maxLng: -74.0100 },
  { name: 'Bergen County', minLat: 40.7900, maxLat: 41.1200, minLng: -74.2050, maxLng: -73.8640 },
];

export const SPELLED_OUT_NUMBERS = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety', 'hundred', 'thousand', 'first', 'second', 'third', 'fourth',
  'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth',
  'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth',
  'nineteenth', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth',
  'seventieth', 'eightieth', 'ninetieth',
]);

export const STREET_SUFFIX_KEYWORDS = new Set([
  'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln',
  'way', 'wy', 'place', 'pl', 'court', 'ct', 'boulevard', 'blvd', 'circle', 'cir',
  'parkway', 'pkwy', 'terrace', 'ter', 'trail', 'trl', 'highway', 'hwy',
  'expressway', 'expy', 'freeway', 'fwy', 'loop', 'row', 'plaza', 'square', 'sq',
  'causeway', 'cswy', 'crescent', 'cres', 'bridge', 'brg', 'pass', 'path',
  'passage', 'view', 'vista', 'walk', 'run', 'landing', 'ldg', 'ridge', 'rdg',
  'heights', 'hts', 'park', 'pk', 'manor', 'mnr', 'station', 'sta',
]);

export const NON_ADDRESS_FOLLOWING_WORDS = new Set([
  'bedroom', 'bedrooms', 'bathroom', 'bathrooms', 'box', 'boxes', 'item', 'items',
  'piece', 'pieces', 'room', 'rooms', 'floor', 'floors', 'apt', 'apartment',
  'apartments', 'unit', 'units', 'suite', 'ste', 'level', 'levels', 'story',
  'stories', 'garage', 'garages',
]);

// ============================================================
// UUID / Token Generation
// ============================================================

export const createUuid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall back to manual generation
  }

  let timestamp = Date.now();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    timestamp += performance.now();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (timestamp + Math.random() * 16) % 16 | 0;
    timestamp = Math.floor(timestamp / 16);
    if (char === 'x') {
      return random.toString(16);
    }
    return ((random & 0x3) | 0x8).toString(16);
  });
};

export const createSessionToken = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// ============================================================
// API Key Resolution
// ============================================================

export const resolveGooglePlacesKey = (): string => {
  const extras = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const keyFromExtras = typeof extras.googlePlacesApiKey === 'string' ? extras.googlePlacesApiKey : undefined;

  return (
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    keyFromExtras ||
    ''
  );
};

export const resolveOpenAIApiKey = (): string => {
  const extras = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const keyFromExtras = typeof extras.openAiApiKey === 'string' ? extras.openAiApiKey : undefined;

  return (
    process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    keyFromExtras ||
    ''
  );
};

// ============================================================
// Service Zone Validation
// ============================================================

export const isWithinServiceZone = (coordinate: LatLng, zone: ServiceZoneBoundingBox): boolean => {
  const { latitude, longitude } = coordinate;
  return latitude >= zone.minLat && latitude <= zone.maxLat && longitude >= zone.minLng && longitude <= zone.maxLng;
};

export const isWithinServiceArea = (coordinate: LatLng | undefined | null): boolean => {
  if (!coordinate) return false;
  return ALLOWED_SERVICE_ZONES.some((zone) => isWithinServiceZone(coordinate, zone));
};

// ============================================================
// Formatting
// ============================================================

export const formatCurrency = (value: number): string => {
  const safeValue = Math.max(0, Math.round(value));
  return `$${safeValue.toLocaleString('en-US')}`;
};

// ============================================================
// Address Validation
// ============================================================

export const containsStreetNumber = (value?: string | null): boolean => {
  if (!value) return false;

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return false;

  const candidatePattern = /\b\d{1,6}[A-Za-z]?(?:[-\s]\d{1,6}[A-Za-z]?)?\s+(?:[A-Za-z0-9.'-]+\s*){1,4}/gi;
  let match: RegExpExecArray | null;

  while ((match = candidatePattern.exec(normalized)) !== null) {
    const snippet = match[0].toLowerCase();
    const words = snippet.split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;

    const secondWord = words[1].replace(/[^a-z0-9]/g, '');
    if (NON_ADDRESS_FOLLOWING_WORDS.has(secondWord)) continue;

    const hasSuffix = words.some((word) => STREET_SUFFIX_KEYWORDS.has(word.replace(/[^a-z]/g, '')));
    if (hasSuffix) return true;
    if (words.length >= 3) return true;
  }

  const words = normalized.toLowerCase().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const currentWord = words[i].replace(/[^a-z]/g, '');
    if (SPELLED_OUT_NUMBERS.has(currentWord)) {
      for (let j = i + 1; j < Math.min(words.length, i + 4); j++) {
        const followingWord = words[j].replace(/[^a-z]/g, '');
        if (NON_ADDRESS_FOLLOWING_WORDS.has(followingWord)) break;
        if (STREET_SUFFIX_KEYWORDS.has(followingWord)) return true;
      }
      if (i + 2 < words.length) {
        const secondWord = words[i + 1].replace(/[^a-z0-9]/g, '');
        const thirdWord = words[i + 2].replace(/[^a-z]/g, '');
        if (!NON_ADDRESS_FOLLOWING_WORDS.has(secondWord) && STREET_SUFFIX_KEYWORDS.has(thirdWord)) {
          return true;
        }
      }
    }
  }

  return false;
};

// ============================================================
// Polyline / Route Helpers
// ============================================================

export const decodePolyline = (encoded: string): LatLng[] => {
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

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    latitude += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    longitude += deltaLng;

    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }

  return points;
};

export const computeArcPath = (start: LatLng, end: LatLng): LatLng[] => {
  const toRadians = Math.PI / 180;
  const midLat = (start.latitude + end.latitude) / 2;
  const midLon = (start.longitude + end.longitude) / 2;
  const cosMid = Math.max(Math.cos(midLat * toRadians), 0.0001);

  const rawDeltaLon = end.longitude - start.longitude;
  const deltaLat = end.latitude - start.latitude;
  const adjustedDeltaLon = rawDeltaLon * cosMid;
  const planarDistance = Math.hypot(deltaLat, adjustedDeltaLon);

  if (planarDistance < 1e-6) return [start, end];

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
    const lat = oneMinusT * oneMinusT * start.latitude + 2 * oneMinusT * t * controlLat + t * t * end.latitude;
    const lng = oneMinusT * oneMinusT * start.longitude + 2 * oneMinusT * t * controlLon + t * t * end.longitude;
    points.push({ latitude: lat, longitude: lng });
  }

  return points;
};

export const ensureRouteEndpoints = (path: LatLng[], start: LatLng, end: LatLng): LatLng[] => {
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
      if (position === 'start') points.unshift(target);
      else points.push(target);
    } else {
      points[index] = target;
    }
  };

  if (adjusted.length === 0) return [start, end];

  alignPoint(adjusted, start, 'start');
  alignPoint(adjusted, end, 'end');

  if (adjusted.length === 1) adjusted.push(end);

  return adjusted;
};

// ============================================================
// Clone Helpers
// ============================================================

export const cloneSelectedLocation = (location: SelectedLocation | null): SelectedLocation | null => {
  if (!location) return null;
  return {
    description: location.description,
    coordinate: {
      latitude: location.coordinate.latitude,
      longitude: location.coordinate.longitude,
    },
  };
};

export const cloneAttachments = (items: AttachmentAsset[]): AttachmentAsset[] =>
  items.map((item) => ({ ...item }));

// ============================================================
// Question List Builder
// ============================================================

export const buildQuestionList = (
  analysis: MovingAnalysisResult,
  state: MovingQuestionsState
): MovingModalQuestion[] => {
  const questions: MovingModalQuestion[] = [];

  if (!analysis.hasApartmentSize && !state.apartmentSize) {
    questions.push('apartmentSize');
  }
  if (!analysis.hasPackingStatus && !state.packingStatus) {
    questions.push('packingStatus');
  }
  if (!analysis.hasTruckInfo && !state.needsTruck) {
    questions.push('needsTruck');
  }
  if (!analysis.hasBoxInfo && !state.boxesNeeded) {
    questions.push('boxesNeeded');
  }

  questions.push('uploadPhotos');
  questions.push('details');

  return questions;
};






