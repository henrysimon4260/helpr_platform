import * as Location from 'expo-location';
import { PermissionStatus } from 'expo-modules-core';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import MapView, { LatLng } from 'react-native-maps';

import { CurrentLocationOption, PlaceSuggestion } from './LocationAutocompleteInput';
import { LocationMode, SelectedLocation } from './types';
import {
  containsStreetNumber,
  createSessionToken,
  decodePolyline,
  ensureRouteEndpoints,
  isWithinServiceArea,
  resolveGooglePlacesKey,
} from './utils';

interface PlaceLocationsProps {
  showModal: (config: { title: string; message: string }) => void;
  mapRef: RefObject<MapView | null>;
  mode: LocationMode;
}

export function usePlaceLocations({ showModal, mapRef, mode }: PlaceLocationsProps) {
  const googlePlacesApiKey = useMemo(resolveGooglePlacesKey, []);
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
      const isStart = target === 'start';
      showModal({
        title: mode === 'single' ? 'Add street number to location' : isStart ? 'Add street number to start location' : 'Add street number to end location',
        message: mode === 'single' ? 'Update your location to include the street number.' : isStart ? 'Update your start location to include the street number.' : 'Update your end location to include the street number.',
      });
    }
  }, [mode, showModal]);

  const fetchPredictions = useCallback(async (
    input: string,
    sessionToken: string,
    setSuggestions: Dispatch<SetStateAction<PlaceSuggestion[]>>,
    setLoading: Dispatch<SetStateAction<boolean>>,
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

  const restoreLocations = useCallback((next: {
    startQuery?: string;
    endQuery?: string;
    startLocation?: SelectedLocation | null;
    endLocation?: SelectedLocation | null;
  }) => {
    setStartQuery(next.startQuery ?? '');
    setEndQuery(next.endQuery ?? '');
    setStartLocation(next.startLocation ?? null);
    setEndLocation(next.endLocation ?? null);
  }, []);

  const geocodeAddress = useCallback(async (address: string): Promise<SelectedLocation | null> => {
    const trimmed = address.trim();
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

  const hydrateFromAddresses = useCallback(async (addresses: { start?: string | null; end?: string | null }) => {
    const startAddress = addresses.start?.trim();
    const endAddress = addresses.end?.trim();

    if (startAddress) {
      const resolved = await geocodeAddress(startAddress);
      if (resolved) {
        applyLocation('start', resolved, { showStreetNumberWarning: false });
      } else {
        setStartQuery(startAddress);
        setStartLocation(null);
      }
    }

    if (mode === 'dual' && endAddress) {
      const resolved = await geocodeAddress(endAddress);
      if (resolved) {
        applyLocation('end', resolved, { showStreetNumberWarning: false });
      } else {
        setEndQuery(endAddress);
        setEndLocation(null);
      }
    }
  }, [applyLocation, geocodeAddress, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coordinates = [startLocation, mode === 'dual' ? endLocation : null]
      .filter((l): l is SelectedLocation => Boolean(l))
      .map(l => l.coordinate);
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      map.animateToRegion({ latitude: coordinates[0].latitude, longitude: coordinates[0].longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 300);
      return;
    }
    const coordinatesToFit = routeCoordinates.length > 1 ? routeCoordinates : coordinates;
    map.fitToCoordinates(coordinatesToFit, { edgePadding: mapEdgePadding, animated: true });
  }, [endLocation, mapEdgePadding, mapRef, mode, routeCoordinates, startLocation]);

  useEffect(() => {
    if (mode !== 'dual' || !startLocation || !endLocation) {
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
            setRouteCoordinates(ensureRouteEndpoints(decoded.length >= 2 ? decoded : [startLocation.coordinate, endLocation.coordinate], startLocation.coordinate, endLocation.coordinate));
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
  }, [endLocation, googlePlacesApiKey, mode, startLocation]);

  useEffect(() => () => {
    if (startDebounceRef.current) clearTimeout(startDebounceRef.current);
    if (endDebounceRef.current) clearTimeout(endDebounceRef.current);
  }, []);

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
    restoreLocations,
    hydrateFromAddresses,
  };
}
