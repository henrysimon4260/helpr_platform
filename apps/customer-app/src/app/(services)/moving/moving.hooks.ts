import { useStripe } from '@stripe/stripe-react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { PermissionStatus } from 'expo-modules-core';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, TextInput } from 'react-native';
import MapView, { LatLng } from 'react-native-maps';

import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';
import { loadPaymentMethods, SavedPaymentMethodSummary, savePaymentMethod, setDefaultPaymentMethod } from '../../../lib/paymentMethods';
import { supabase } from '../../../lib/supabase';

import { CurrentLocationOption, PlaceSuggestion } from '../../../components/services/LocationAutocompleteInput';
import { MovingAnalysisResult, MovingModalQuestion, SelectedLocation } from './moving.types';
import {
  containsStreetNumber,
  createSessionToken,
  createUuid,
  decodePolyline,
  ensureRouteEndpoints,
  formatCurrency,
  isWithinServiceArea,
  resolveGooglePlacesKey,
  resolveOpenAIApiKey
} from './moving.utils';

// =============================================================================
// useLocationManagement - Handles all location-related logic
// =============================================================================
interface LocationManagementProps {
  showModal: (config: { title: string; message: string }) => void;
  mapRef: React.RefObject<MapView | null>;
}

export function useLocationManagement({ showModal, mapRef }: LocationManagementProps) {
  const googlePlacesApiKey = useMemo(resolveGooglePlacesKey, []);
  const startInputRef = useRef<TextInput>(null);
  const endInputRef = useRef<TextInput>(null);
  const startDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [startSessionToken, setStartSessionToken] = useState(createSessionToken);
  const [endSessionToken, setEndSessionToken] = useState(createSessionToken);
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startSuggestions, setStartSuggestions] = useState<PlaceSuggestion[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<PlaceSuggestion[]>([]);
  const [startLoading, setStartLoading] = useState(false);
  const [endLoading, setEndLoading] = useState(false);
  const [startLocation, setStartLocation] = useState<SelectedLocation | null>(null);
  const [endLocation, setEndLocation] = useState<SelectedLocation | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionStatus>(PermissionStatus.UNDETERMINED);
  const [currentLocation, setCurrentLocation] = useState<SelectedLocation | null>(null);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);
  const [currentLocationLoadingTarget, setCurrentLocationLoadingTarget] = useState<'start' | 'end' | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);

  const mapEdgePadding = useMemo(() => ({ top: 60, right: 36, bottom: 220, left: 36 }), []);

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

  const loadCurrentLocation = useCallback(async (options: { target?: 'start' | 'end'; silent?: boolean } = {}): Promise<SelectedLocation | null> => {
    const { target, silent } = options;
    if (!silent) {
      if (target) setCurrentLocationLoadingTarget(target);
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
      if (!silent) {
        setCurrentLocationLoading(false);
        if (target) setCurrentLocationLoadingTarget(prev => (prev === target ? null : prev));
      }
    }
  }, [formatLocationDescription, locationPermissionStatus]);

  const applyLocation = useCallback((target: 'start' | 'end', location: SelectedLocation, options: { showStreetNumberWarning?: boolean } = {}) => {
    if (!isWithinServiceArea(location.coordinate)) {
      showModal({
        title: 'Outside of Service Area',
        message: "Helpr currently serves NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ.",
      });
      return;
    }

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
      showModal({
        title: target === 'start' ? 'Add street number to start location' : 'Add street number to end location',
        message: target === 'start' ? 'Update your start location to include the street number.' : 'Update your end location to include the street number.',
      });
    }
  }, [showModal]);

  const fetchPredictions = useCallback(async (
    input: string,
    sessionToken: string,
    setSuggestions: React.Dispatch<React.SetStateAction<PlaceSuggestion[]>>,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    if (!googlePlacesApiKey) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ input, key: googlePlacesApiKey, sessiontoken: sessionToken, components: 'country:us' });
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
        setSuggestions(parsed);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [googlePlacesApiKey]);

  const fetchPlaceDetails = useCallback(async (placeId: string, sessionToken: string): Promise<SelectedLocation | null> => {
    if (!googlePlacesApiKey) return null;

    try {
      const params = new URLSearchParams({ place_id: placeId, key: googlePlacesApiKey, sessiontoken: sessionToken, fields: 'formatted_address,geometry/location' });
      const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
      const data = await response.json();

      if (data.status === 'OK') {
        const location = data.result.geometry?.location;
        if (location) {
          return { description: data.result.formatted_address ?? '', coordinate: { latitude: location.lat, longitude: location.lng } };
        }
      }
      return null;
    } catch {
      return null;
    }
  }, [googlePlacesApiKey]);

  const handleStartChange = useCallback((text: string) => {
    setStartQuery(text);
    setStartLocation(null);
    if (startDebounceRef.current) clearTimeout(startDebounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setStartSuggestions([]);
      return;
    }
    startDebounceRef.current = setTimeout(() => {
      fetchPredictions(trimmed, startSessionToken, setStartSuggestions, setStartLoading);
    }, 350);
  }, [fetchPredictions, startSessionToken]);

  const handleEndChange = useCallback((text: string) => {
    setEndQuery(text);
    setEndLocation(null);
    if (endDebounceRef.current) clearTimeout(endDebounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setEndSuggestions([]);
      return;
    }
    endDebounceRef.current = setTimeout(() => {
      fetchPredictions(trimmed, endSessionToken, setEndSuggestions, setEndLoading);
    }, 350);
  }, [endSessionToken, fetchPredictions]);

  const handleStartSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    if (!suggestion.placeId) return;
    setStartLoading(true);
    const details = await fetchPlaceDetails(suggestion.placeId, startSessionToken);
    setStartLoading(false);
    if (details) applyLocation('start', { description: details.description || suggestion.description, coordinate: details.coordinate });
  }, [applyLocation, fetchPlaceDetails, startSessionToken]);

  const handleEndSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    if (!suggestion.placeId) return;
    setEndLoading(true);
    const details = await fetchPlaceDetails(suggestion.placeId, endSessionToken);
    setEndLoading(false);
    if (details) applyLocation('end', { description: details.description || suggestion.description, coordinate: details.coordinate });
  }, [applyLocation, endSessionToken, fetchPlaceDetails]);

  const handleStartClear = useCallback(() => {
    setStartQuery('');
    setStartSuggestions([]);
    setStartLocation(null);
    setStartSessionToken(createSessionToken());
  }, []);

  const handleEndClear = useCallback(() => {
    setEndQuery('');
    setEndSuggestions([]);
    setEndLocation(null);
    setEndSessionToken(createSessionToken());
  }, []);

  const dismissSuggestions = useCallback(() => {
    setStartSuggestions([]);
    setEndSuggestions([]);
  }, []);

  const handleUseCurrentLocation = useCallback(async (target: 'start' | 'end') => {
    const existingLocation = locationPermissionStatus === PermissionStatus.GRANTED && currentLocation ? currentLocation : null;
    if (existingLocation && !currentLocationLoading) {
      applyLocation(target, existingLocation);
      return;
    }
    const resolved = await loadCurrentLocation({ target });
    if (resolved) applyLocation(target, resolved);
  }, [applyLocation, currentLocation, currentLocationLoading, loadCurrentLocation, locationPermissionStatus]);

  const currentLocationSecondaryText = useMemo(() => {
    if (currentLocation) return currentLocation.description;
    if (locationPermissionStatus === PermissionStatus.DENIED) return 'Enable location access in Settings to use this option.';
    return "Fill with your device's current GPS position.";
  }, [currentLocation, locationPermissionStatus]);

  const startCurrentLocationOption = useMemo<CurrentLocationOption>(() => ({
    id: 'current-location-start',
    primaryText: 'Current Location',
    secondaryText: currentLocationSecondaryText,
    onSelect: () => handleUseCurrentLocation('start'),
    loading: currentLocationLoading && currentLocationLoadingTarget === 'start',
    disabled: currentLocationLoading,
  }), [currentLocationLoading, currentLocationLoadingTarget, currentLocationSecondaryText, handleUseCurrentLocation]);

  const endCurrentLocationOption = useMemo<CurrentLocationOption>(() => ({
    id: 'current-location-end',
    primaryText: 'Use Current Location',
    secondaryText: currentLocationSecondaryText,
    onSelect: () => handleUseCurrentLocation('end'),
    loading: currentLocationLoading && currentLocationLoadingTarget === 'end',
    disabled: currentLocationLoading,
  }), [currentLocationLoading, currentLocationLoadingTarget, currentLocationSecondaryText, handleUseCurrentLocation]);

  // Fit map to locations
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coordinates = [startLocation, endLocation].filter((l): l is SelectedLocation => Boolean(l)).map(l => l.coordinate);
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      map.animateToRegion({ latitude: coordinates[0].latitude, longitude: coordinates[0].longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 300);
      return;
    }
    const coordinatesToFit = routeCoordinates.length > 1 ? routeCoordinates : coordinates;
    map.fitToCoordinates(coordinatesToFit, { edgePadding: mapEdgePadding, animated: true });
  }, [endLocation, mapEdgePadding, mapRef, routeCoordinates, startLocation]);

  // Fetch directions
  useEffect(() => {
    if (!startLocation || !endLocation) {
      setRouteCoordinates([]);
      return;
    }
    if (!googlePlacesApiKey) {
      setRouteCoordinates(ensureRouteEndpoints([startLocation.coordinate, endLocation.coordinate], startLocation.coordinate, endLocation.coordinate));
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
        const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
        const data = await response.json();
        if (cancelled) return;
        if (data.status === 'OK') {
          const polyline = data.routes?.[0]?.overview_polyline?.points;
          if (typeof polyline === 'string' && polyline.length > 0) {
            const decoded = decodePolyline(polyline);
            const resolvedPath = ensureRouteEndpoints(decoded.length >= 2 ? decoded : [startLocation.coordinate, endLocation.coordinate], startLocation.coordinate, endLocation.coordinate);
            setRouteCoordinates(resolvedPath);
            return;
          }
        }
        setRouteCoordinates(ensureRouteEndpoints([startLocation.coordinate, endLocation.coordinate], startLocation.coordinate, endLocation.coordinate));
      } catch {
        if (!cancelled) setRouteCoordinates(ensureRouteEndpoints([startLocation.coordinate, endLocation.coordinate], startLocation.coordinate, endLocation.coordinate));
      }
    };
    fetchDirections();
    return () => { cancelled = true; };
  }, [endLocation, googlePlacesApiKey, startLocation]);

  return {
    startQuery,
    endQuery,
    startLocation,
    endLocation,
    startSuggestions,
    endSuggestions,
    startLoading,
    endLoading,
    routeCoordinates,
    handleStartChange,
    handleEndChange,
    handleStartSelect,
    handleEndSelect,
    handleStartClear,
    handleEndClear,
    dismissSuggestions,
    startCurrentLocationOption,
    endCurrentLocationOption,
  };
}

// =============================================================================
// usePriceEstimate - Handles price estimation
// =============================================================================
interface PriceEstimateProps {
  showModal: (config: { title: string; message: string }) => void;
}

interface DrivingInfo {
  distanceMeters: number;
  durationSeconds: number;
  distanceMiles: number;
  durationMinutes: number;
}

export function usePriceEstimate({ showModal }: PriceEstimateProps) {
  const openAiApiKey = useMemo(resolveOpenAIApiKey, []);
  const googlePlacesApiKey = useMemo(resolveGooglePlacesKey, []);
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

  // Fetch driving distance and duration from Google Maps Directions API
  const fetchDrivingInfo = useCallback(async (start: SelectedLocation, end: SelectedLocation): Promise<DrivingInfo | null> => {
    if (!googlePlacesApiKey) return null;

    try {
      const params = new URLSearchParams({
        origin: `${start.coordinate.latitude},${start.coordinate.longitude}`,
        destination: `${end.coordinate.latitude},${end.coordinate.longitude}`,
        key: googlePlacesApiKey,
        mode: 'driving',
      });
      const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
      const data = await response.json();

      if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
        const leg = data.routes[0].legs[0];
        const distanceMeters = leg.distance?.value ?? 0;
        const durationSeconds = leg.duration?.value ?? 0;
        return {
          distanceMeters,
          durationSeconds,
          distanceMiles: distanceMeters / 1609.344,
          durationMinutes: durationSeconds / 60,
        };
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch driving info:', error);
      return null;
    }
  }, [googlePlacesApiKey]);

  const fetchPrice = useCallback(async (taskDescription: string, options: { start?: SelectedLocation | null; end?: SelectedLocation | null; needsTruck?: boolean } = {}) => {
    const { start, end, needsTruck } = options;
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
      // Fetch driving info from Google Maps if both locations are provided
      let drivingInfo: DrivingInfo | null = null;
      if (start && end) {
        drivingInfo = await fetchDrivingInfo(start, end);
      }

      const startDetails = start ? `${start.description} (lat ${start.coordinate.latitude.toFixed(4)}, lng ${start.coordinate.longitude.toFixed(4)})` : 'not provided';
      const endDetails = end ? `${end.description} (lat ${end.coordinate.latitude.toFixed(4)}, lng ${end.coordinate.longitude.toFixed(4)})` : 'not provided';
      
      // Include driving info in the prompt if available
      const drivingDetails = drivingInfo 
        ? `Driving distance: ${drivingInfo.distanceMiles.toFixed(2)} miles, Estimated driving time: ${Math.round(drivingInfo.durationMinutes)} minutes`
        : 'Driving distance: not available';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are a pricing assistant for moving services. Respond with a JSON object containing a price field. Keep prices in USD, realistic, and constrain price between 200 and 1800 for jobs requiring transportation between locations. Ensure that any moving services going from one place to another are at least $200 without truck and at least $350 if truck is needed. Start around these two prices for studio/1BR jobs in close proximity to each other and increase accordingly for larger places. use the following constraints to determine the cost of something. 1 bedroom is 15% more expensive than studio, 2 bedroom is 15% expensive than 1 bed, and so on for all bedroom sizes. Make sure this holds true for every single transaction, such that it is guaranteed that the prices are subject to apartment size. Provide optimistic, budget-friendly estimates and, when in doubt, lean toward the lower end of the acceptable price range. Take the driving distance and time into account when estimating prices - longer distances should cost more. Make sure that there is a significant difference between jobs requiring a moving truck and those not requiring it. Take the size of the apartment and whether the customer requires help packing into consideration. Make extra sure all of these criteria are met.',
            },
            {
              role: 'user',
              content: [`Task description: ${taskDescription}`, `Start location: ${startDetails}`, `End location: ${endDetails}`, drivingDetails].join('\n'),
            },
          ],
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch price estimate');
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Missing completion content');
      const parsed = JSON.parse(content);
      let price = Number(parsed.price);
      if (!Number.isFinite(price)) throw new Error('Invalid price value');

      // For short drives (<0.5 mile), apply special pricing: base rate + $1 per minute of driving time
      if (drivingInfo && drivingInfo.distanceMiles < 0.5) {
        const baseRate = needsTruck ? 350 : 200;
        const drivingTimeSurcharge = Math.round(drivingInfo.durationMinutes) * 1; // $1 per minute
        price = baseRate + drivingTimeSurcharge;
        setPriceNote(`Short distance rate: base + $${drivingTimeSurcharge} (${Math.round(drivingInfo.durationMinutes)} min drive)`);
      }

      const adjusted = needsTruck ? price * 1.6 : price;
      setPriceQuote(formatCurrency(Math.max(0, Math.round(adjusted))));
    } catch (error) {
      console.warn('Failed to fetch price estimate', error);
      setPriceError('Unable to estimate price right now.');
    } finally {
      setIsPriceLoading(false);
    }
  }, [openAiApiKey, fetchDrivingInfo]);

  return { priceQuote, priceNote, priceError, isPriceLoading, resetPriceState, fetchPrice };
}

// =============================================================================
// usePaymentManagement - Handles payment methods
// =============================================================================
interface PaymentManagementProps {
  user: any;
  showModal: (config: { title: string; message: string }) => void;
}

export function usePaymentManagement({ user, showModal }: PaymentManagementProps) {
  const { createPaymentMethod } = useStripe();
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethodSummary[]>([]);
  const [activePaymentMethodId, setActivePaymentMethodId] = useState<string | null>(null);
  const [showAddPaymentForm, setShowAddPaymentForm] = useState(false);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardDetailsSnapshot, setCardDetailsSnapshot] = useState<{
    brand?: string | null;
    last4?: string | null;
    expiryMonth?: number | null;
    expiryYear?: number | null;
  } | null>(null);

  const activePaymentMethod = useMemo(() => {
    if (activePaymentMethodId) {
      return savedPaymentMethods.find(m => m.id === activePaymentMethodId) ?? null;
    }
    const defaultMethod = savedPaymentMethods.find(m => m.isDefault);
    return defaultMethod ?? savedPaymentMethods[0] ?? null;
  }, [activePaymentMethodId, savedPaymentMethods]);

  const loadSavedPaymentMethods = useCallback(async (): Promise<SavedPaymentMethodSummary[]> => {
    if (paymentMethodsLoaded) return savedPaymentMethods;
    if (!user?.id) return [];

    setLoadingPaymentMethods(true);
    try {
      const methods = await loadPaymentMethods(user.id);
      setSavedPaymentMethods(methods);
      setPaymentMethodsLoaded(true);

      const defaultMethod = methods.find(m => m.isDefault);
      if (defaultMethod && !activePaymentMethodId) {
        setActivePaymentMethodId(defaultMethod.id);
      }

      return methods;
    } catch {
      return [];
    } finally {
      setLoadingPaymentMethods(false);
    }
  }, [paymentMethodsLoaded, savedPaymentMethods, user, activePaymentMethodId]);

  const openPaymentModal = useCallback(async () => {
    const methods = await loadSavedPaymentMethods();
    setShowAddPaymentForm(methods.length === 0);
    setPaymentModalVisible(true);
  }, [loadSavedPaymentMethods]);

  const closePaymentModal = useCallback(() => {
    setPaymentModalVisible(false);
    setShowAddPaymentForm(false);
    setCardComplete(false);
    setCardDetailsSnapshot(null);
  }, []);

  const handleSelectPaymentMethod = useCallback(async (methodId: string) => {
    setActivePaymentMethodId(methodId);
    if (user) {
      const success = await setDefaultPaymentMethod(user.id, methodId);
      if (success) {
        setSavedPaymentMethods(prev => prev.map(m => ({ ...m, isDefault: m.id === methodId })));
      }
    }
    closePaymentModal();
  }, [closePaymentModal, user]);

  const normalizeCardBrand = (brand: string): string => {
    const brandMap: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      jcb: 'JCB',
    };
    return brandMap[brand.toLowerCase().trim()] || brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const handleSavePaymentMethod = useCallback(async (isDefault: boolean = false) => {
    if (!cardComplete || !user?.id) {
      showModal({ title: 'Cannot Save', message: 'Please complete the card details.' });
      return;
    }

    if (savingPaymentMethod) return;
    setSavingPaymentMethod(true);

    try {
      console.log('Creating payment method with Stripe...');
      const result = await createPaymentMethod({ paymentMethodType: 'Card' });
      console.log('Stripe result:', result);
      
      if (result.error || !result.paymentMethod) {
        console.error('Stripe error:', result.error);
        showModal({ title: 'Payment Method Error', message: result.error?.message || 'Failed to create payment method with Stripe.' });
        return;
      }

      console.log('Saving to database...');
      const brandSource = result.paymentMethod.Card?.brand ?? 'Card';
      const savedMethod = await savePaymentMethod(
        user.id,
        result.paymentMethod.id,
        normalizeCardBrand(brandSource),
        result.paymentMethod.Card?.last4 ?? '0000',
        result.paymentMethod.Card?.expMonth ?? 12,
        result.paymentMethod.Card?.expYear ?? new Date().getFullYear() + 3,
        isDefault
      );
      console.log('Saved method:', savedMethod);

      if (savedMethod) {
        if (isDefault) {
          // If this is the default, mark all others as not default
          setSavedPaymentMethods(prev => [...prev.map(m => ({ ...m, isDefault: false })), { ...savedMethod, isDefault: true }]);
        } else {
          // If not default, just add it
          setSavedPaymentMethods(prev => [...prev, savedMethod]);
        }
        setActivePaymentMethodId(savedMethod.id);
        setShowAddPaymentForm(false);
        setCardComplete(false);
        setCardDetailsSnapshot(null);
        closePaymentModal();
        showModal({ title: 'Payment Method Saved', message: 'Your payment method has been securely saved.' });
      } else {
        showModal({ title: 'Save Failed', message: 'Failed to save payment method to database.' });
      }
    } catch (error) {
      console.error('Save payment method error:', error);
      showModal({ title: 'Error', message: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setSavingPaymentMethod(false);
    }
  }, [cardComplete, user, createPaymentMethod, showModal, closePaymentModal, savingPaymentMethod]);

  // Auto-load payment methods when user is available
  useEffect(() => {
    if (!user) {
      setPaymentMethodsLoaded(false);
      setSavedPaymentMethods([]);
      setActivePaymentMethodId(null);
      return;
    }
    if (paymentMethodsLoaded) return;
    loadSavedPaymentMethods();
  }, [user, paymentMethodsLoaded, loadSavedPaymentMethods]);

  return {
    paymentModalVisible,
    savedPaymentMethods,
    activePaymentMethodId,
    activePaymentMethod,
    showAddPaymentForm,
    setShowAddPaymentForm,
    loadingPaymentMethods,
    savingPaymentMethod,
    cardComplete,
    setCardComplete,
    cardDetailsSnapshot,
    setCardDetailsSnapshot,
    openPaymentModal,
    closePaymentModal,
    handleSelectPaymentMethod,
    handleSavePaymentMethod,
  };
}

// =============================================================================
// useMovingAnalysis - Handles the moving questions modal flow
// =============================================================================
interface MovingAnalysisProps {
  description: string;
  startQuery: string;
  endQuery: string;
  startLocation: SelectedLocation | null;
  endLocation: SelectedLocation | null;
  apartmentSize: string;
  packingStatus: string;
  needsTruck: string;
  boxesNeeded: string;
  promptingCompleted: boolean;
  setPromptingCompleted: (v: boolean) => void;
  setShowMovingAnalysisModal: (v: boolean) => void;
  setCurrentModalQuestion: (q: MovingModalQuestion | null) => void;
  showModal: (config: { title: string; message: string }) => void;
}

export function useMovingAnalysis({
  description,
  startQuery,
  endQuery,
  startLocation,
  endLocation,
  apartmentSize,
  packingStatus,
  needsTruck,
  boxesNeeded,
  promptingCompleted,
  setPromptingCompleted,
  setShowMovingAnalysisModal,
  setCurrentModalQuestion,
  showModal,
}: MovingAnalysisProps) {
  const [questionHistory, setQuestionHistory] = useState<MovingModalQuestion[]>([]);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<MovingAnalysisResult | null>(null);

  const buildQuestionList = useCallback((analysis: MovingAnalysisResult | null, answers: { packingStatus: string; needsTruck: string; boxesNeeded: string; apartmentSize: string }): MovingModalQuestion[] => {
    const result: MovingModalQuestion[] = [];
    const hasPackingInfo = Boolean(answers.packingStatus) || Boolean(analysis?.hasPackingStatus) || Boolean(analysis?.areItemsPacked);
    if (!hasPackingInfo) result.push('packingStatus');
    const hasTruckInfo = Boolean(answers.needsTruck) || Boolean(analysis?.hasTruckInfo);
    if (!hasTruckInfo) result.push('needsTruck');
    const itemsPacked = answers.packingStatus === 'packed' || Boolean(analysis?.areItemsPacked);
    const hasBoxesInfo = itemsPacked || Boolean(answers.boxesNeeded) || Boolean(analysis?.hasBoxInfo);
    if (!hasBoxesInfo) result.push('boxesNeeded');
    const hasApartmentInfo = answers.apartmentSize.trim().length > 0 || Boolean(analysis?.hasApartmentSize);
    if (!hasApartmentInfo) result.push('apartmentSize');
    result.push('uploadPhotos');
    result.push('details');
    return result;
  }, []);

  const analyzeDescription = useCallback(async (text: string): Promise<MovingAnalysisResult> => {
    const lowerText = text.toLowerCase();
    const spelledOutBedroomPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple)\s*(?:-|\s)?\s*(bedroom|bed|br|room|apt|apartment)s?\b/;
    const hasApartmentSize = /\b(\d+)\s*(bedroom|br|room|apt|apartment)\b/i.test(lowerText) || /\b(studio|1br|2br|3br|4br|5br)\b/i.test(lowerText) || spelledOutBedroomPattern.test(lowerText);
    const hasPackingStatus = /\b(pack|packed|packing|unpack|unpacked|unpacking)\b/i.test(lowerText);
    const hasTruckInfo = /\b(truck|moving truck|rental truck|vehicle|car|van)\b/i.test(lowerText);
    const hasBoxInfo = /\b(box|boxes|packing supplies|supplies)\b/i.test(lowerText);
    const hasFurnitureScope = /\b(everything|entire|whole|all|complete)\b/i.test(lowerText) || /\b(furniture|bedroom|living room|kitchen|dining room|office)\b/i.test(lowerText);

    const negativeIndicators = [/\bnot\s+(?:yet\s+)?packed\b/, /\bneed(?:s|ed)?\s+(?:help\s+)?pack(?:ing|ed)?\b/, /\bunpacked\b/];
    const positiveIndicators = [/\beverything\s+(?:is\s+)?already\s+packed\b/, /\balready\s+packed\b/, /\bfully\s+packed\b/, /\bitems\s+are\s+packed\b/];
    let areItemsPacked = false;
    if (negativeIndicators.some(p => p.test(lowerText))) areItemsPacked = false;
    else if (positiveIndicators.some(p => p.test(lowerText))) areItemsPacked = true;

    const hasStartStreetNumber = containsStreetNumber(startQuery) || containsStreetNumber(startLocation?.description ?? '');
    const hasEndStreetNumber = containsStreetNumber(endQuery) || containsStreetNumber(endLocation?.description ?? '');
    const missingStreetNumberTargets: Array<'start' | 'end'> = [];
    if (startQuery && !hasStartStreetNumber) missingStreetNumberTargets.push('start');
    if (endQuery && !hasEndStreetNumber) missingStreetNumberTargets.push('end');

    return {
      hasApartmentSize,
      hasPackingStatus,
      hasTruckInfo,
      hasBoxInfo,
      hasFurnitureScope,
      areItemsPacked,
      hasStreetNumber: missingStreetNumberTargets.length === 0,
      hasStartStreetNumber,
      hasEndStreetNumber,
      missingStreetNumberTargets,
    };
  }, [startQuery, endQuery, startLocation, endLocation]);

  const startPromptingFlow = useCallback(async () => {
    const analysis = await analyzeDescription(description);

    if (!analysis.hasStreetNumber) {
      const needsBoth = analysis.missingStreetNumberTargets.length === 2;
      const target = analysis.missingStreetNumberTargets[0] ?? 'start';
      showModal({
        title: needsBoth ? 'Add street numbers' : target === 'start' ? 'Add an exact street number for your starting location' : 'Add an exact street number for your ending location',
        message: needsBoth ? 'Update both start and end locations to include street numbers.' : target === 'start' ? 'Update your start location to include the street number.' : 'Update your end location to include the street number.',
      });
      return;
    }

    setAnalysisSnapshot(analysis);
    setQuestionHistory(['packingStatus']); // Start with first question in history
    setCurrentModalQuestion('packingStatus'); // Show first question
    setPromptingCompleted(false);
    setShowMovingAnalysisModal(true);
  }, [analyzeDescription, description, showModal, setCurrentModalQuestion, setPromptingCompleted, setShowMovingAnalysisModal]);

  const handleBack = useCallback(() => {
    if (questionHistory.length <= 1) {
      // On first question, close the modal
      setShowMovingAnalysisModal(false);
      setCurrentModalQuestion(null);
      setQuestionHistory([]);
      setAnalysisSnapshot(null);
      return;
    }

    // Go back to previous question
    const newHistory = questionHistory.slice(0, -1);
    const previousQuestion = newHistory[newHistory.length - 1];
    setQuestionHistory(newHistory);
    setCurrentModalQuestion(previousQuestion);
  }, [questionHistory, setCurrentModalQuestion, setShowMovingAnalysisModal]);

  const handleNext = useCallback((): boolean => {
    // Fixed question order - always show these questions in this order
    const allQuestions: MovingModalQuestion[] = ['packingStatus', 'needsTruck', 'boxesNeeded', 'apartmentSize', 'uploadPhotos', 'details'];
    
    // Find the current question index based on what's in history
    const currentIndex = questionHistory.length > 0 
      ? allQuestions.indexOf(questionHistory[questionHistory.length - 1]) + 1
      : 0;
    
    // Skip boxesNeeded if items are already packed
    let nextIndex = currentIndex;
    while (nextIndex < allQuestions.length) {
      const nextQ = allQuestions[nextIndex];
      // Skip boxesNeeded if packed
      if (nextQ === 'boxesNeeded' && packingStatus === 'packed') {
        nextIndex++;
        continue;
      }
      break;
    }
    
    if (nextIndex < allQuestions.length) {
      const nextQuestion = allQuestions[nextIndex];
      setQuestionHistory(prev => [...prev, nextQuestion]);
      setCurrentModalQuestion(nextQuestion);
      return false;
    }

    // All questions answered
    return true;
  }, [packingStatus, questionHistory, setCurrentModalQuestion]);

  const applyAnswersToDescription = useCallback((originalDescription: string, answers: {
    apartmentSize: string;
    packingStatus: string;
    needsTruck: string;
    boxesNeeded: string;
    optionalDetails: string;
    attachments: AttachmentAsset[];
  }) => {
    let next = originalDescription.trim();
    const appendSentence = (sentence: string) => {
      const normalized = sentence.trim();
      if (!normalized || next.toLowerCase().includes(normalized.toLowerCase())) return;
      if (next.length > 0 && !/[.!?]$/.test(next)) next += '.';
      next = next.length > 0 ? `${next} ${normalized}` : normalized;
    };

    if (answers.apartmentSize.trim()) appendSentence(`Moving from a ${answers.apartmentSize}.`);
    if (answers.packingStatus === 'packed') appendSentence('Items are already packed.');
    else if (answers.packingStatus === 'not-packed') appendSentence('Need help packing items.');
    if (answers.needsTruck === 'yes') appendSentence('Moving truck is needed.');
    else if (answers.needsTruck === 'no') appendSentence('No moving truck needed.');
    if (answers.packingStatus !== 'packed') {
      if (answers.boxesNeeded === 'yes') appendSentence('Need boxes and packing supplies.');
      else if (answers.boxesNeeded === 'no') appendSentence('Already have boxes and supplies.');
    }
    if (answers.optionalDetails.trim()) appendSentence(answers.optionalDetails);

    return next;
  }, []);

  const handleUploadPhotos = useCallback(async () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take Photo', 'Upload from Camera Roll', 'Cancel'], cancelButtonIndex: 2 },
        async (buttonIndex) => {
          if (buttonIndex === 0) {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              showModal({ title: 'Permission needed', message: 'Enable camera access to take photos.' });
              return;
            }
            const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
            if (!result.canceled && result.assets?.length) {
              // This would need to update attachments state - handled in parent
            }
          } else if (buttonIndex === 1) {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
              showModal({ title: 'Permission needed', message: 'Enable photo library access.' });
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsMultipleSelection: true, quality: 0.8 });
            if (!result.canceled && result.assets?.length) {
              // This would need to update attachments state - handled in parent
            }
          }
        }
      );
      return;
    }
    Alert.alert('Upload Photos', 'Choose an option', [
      { text: 'Take Photo', onPress: async () => { /* similar logic */ } },
      { text: 'Upload from Camera Roll', onPress: async () => { /* similar logic */ } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [showModal]);

  return {
    startPromptingFlow,
    handleBack,
    handleNext,
    applyAnswersToDescription,
    handleUploadPhotos,
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

  const transcribeAudio = useCallback(async (uri: string) => {
    if (!openAiApiKey) {
      showModal({ title: 'Missing API key', message: 'Add an OpenAI API key to enable voice mode.' });
      return '';
    }

    try {
      const formData = new FormData();
      formData.append('file', { uri, name: 'voice-input.m4a', type: Platform.select({ ios: 'audio/m4a', android: 'audio/mpeg', default: 'audio/m4a' }) } as any);
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

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
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

  return { isRecording, isTranscribing, handleVoicePress };
}

// =============================================================================
// useServiceSubmission - Handles form submission
// =============================================================================
interface ServiceSubmissionProps {
  user: any;
  description: string;
  startLocation: SelectedLocation | null;
  endLocation: SelectedLocation | null;
  priceQuote: string | null;
  isAuto: boolean;
  isPersonal: boolean;
  activePaymentMethod: SavedPaymentMethodSummary | null;
  showModal: (config: { title: string; message: string; onDismiss?: () => void }) => void;
  setShowSignInModal: (v: boolean) => void;
  params: any;
}

export function useServiceSubmission({
  user,
  description,
  startLocation,
  endLocation,
  priceQuote,
  isAuto,
  isPersonal,
  activePaymentMethod,
  showModal,
  setShowSignInModal,
  params,
}: ServiceSubmissionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Load customer ID when user changes
  useEffect(() => {
    if (!user?.email) {
      setCustomerId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('customer').select('customer_id').eq('email', user.email).maybeSingle();
        if (!cancelled && data?.customer_id) setCustomerId(data.customer_id);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  const preserveFormForAuth = useCallback(() => {
    // Would save form state to returnTo - simplified here
  }, []);

  const handleSchedule = useCallback(async () => {
    if (isSubmitting) return;

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      showModal({ title: 'Add a description', message: 'Please describe what you need help with.' });
      return;
    }

    if (!startLocation || !endLocation) {
      showModal({ title: 'Add locations', message: 'Please provide both start and end locations.' });
      return;
    }

    if (!isWithinServiceArea(startLocation.coordinate) || !isWithinServiceArea(endLocation.coordinate)) {
      showModal({ title: "We're not in your area yet.", message: "Helpr currently operates in NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ." });
      return;
    }

    const priceDigitsRaw = priceQuote?.replace(/[^0-9.]/g, '') ?? '';
    const priceValue = priceDigitsRaw.length > 0 ? Number(priceDigitsRaw) : null;
    if (!Number.isFinite(priceValue ?? NaN)) {
      showModal({ title: 'Estimate needed', message: 'Request a quick price estimate before scheduling.' });
      return;
    }

    if (!containsStreetNumber(startLocation.description) || !containsStreetNumber(endLocation.description)) {
      showModal({ title: 'Add street numbers', message: 'Update locations to include street numbers before scheduling.' });
      return;
    }

    if (!user) {
      preserveFormForAuth();
      setShowSignInModal(true);
      return;
    }

    if (!activePaymentMethod) {
      showModal({ title: 'Payment Method Required', message: 'Please add a payment method before scheduling.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedCustomerId = customerId || (await (async () => {
        const { data } = await supabase.from('customer').select('customer_id').eq('email', user.email).maybeSingle();
        return data?.customer_id ?? null;
      })());

      if (!resolvedCustomerId) {
        showModal({ title: 'Account issue', message: 'We could not find your customer profile.' });
        return;
      }

      const payload = {
        service_id: createUuid(),
        customer_id: resolvedCustomerId,
        date_of_creation: new Date().toISOString(),
        service_type: 'Moving',
        status: 'finding_pros',
        start_location: startLocation.description,
        end_location: endLocation.description,
        price: priceValue,
        payment_method_type: isPersonal ? 'Personal' : 'Business',
        autofill_type: isAuto ? 'AutoFill' : 'Custom',
        description: trimmedDescription,
      };

      router.push({
        pathname: 'booked-services' as any,
        params: {
          showOverlay: 'true',
          temporaryService: encodeURIComponent(JSON.stringify(payload)),
          requiresPayment: 'true',
        },
      });
    } catch {
      showModal({ title: 'Scheduling failed', message: 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    description,
    startLocation,
    endLocation,
    priceQuote,
    user,
    activePaymentMethod,
    customerId,
    isPersonal,
    isAuto,
    showModal,
    setShowSignInModal,
    preserveFormForAuth,
  ]);

  return { isSubmitting, handleSchedule, preserveFormForAuth };
}






