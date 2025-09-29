import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { PermissionStatus } from 'expo-modules-core';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { LatLng, Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { SvgXml } from 'react-native-svg';

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

type LocationAutocompleteInputProps = {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onClear: () => void;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  currentLocationOption?: CurrentLocationOption;
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
  }) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasInput = value.trim().length > 0;
    const shouldShowSuggestions =
      isFocused && hasInput && (loading || Boolean(currentLocationOption) || suggestions.length > 0);

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
  const [isAuto, setIsAuto] = useState(true);
  const [isPersonal, setIsPersonal] = useState(true);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation2 = useRef(new Animated.Value(0)).current;
  
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
  const mapRef = useRef<MapView | null>(null);
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
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionStatus>(
    PermissionStatus.UNDETERMINED,
  );
  const [currentLocation, setCurrentLocation] = useState<SelectedLocation | null>(null);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);
  const [currentLocationLoadingTarget, setCurrentLocationLoadingTarget] = useState<'start' | 'end' | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);

  const mapEdgePadding = useMemo(
    () => ({ top: 60, right: 36, bottom: 220, left: 36 }),
    [],
  );

  const defaultRegion = useMemo(
    () => ({
      latitude: 37.773972,
      longitude: -122.431297,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
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

  const applyLocation = useCallback((target: 'start' | 'end', location: SelectedLocation) => {
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
    [fetchPredictions, startSessionToken],
  );

  const handleEndChange = useCallback(
    (text: string) => {
      setEndQuery(text);
      setEndLocation(null);

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
    [fetchPredictions, endSessionToken],
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
  }, []);

  const handleEndClear = useCallback(() => {
    setEndQuery('');
    setEndSuggestions([]);
    setEndLocation(null);
    setEndSessionToken(createSessionToken());
  }, []);

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
            <View style={[styles.locationSection2, styles.locationSectionEnd]}>
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
                  <Text style={styles.PriceOfServiceQuoteText}>enter description { '\n' }to see price</Text>
              </View>
            </View>
            <View style={styles.jobDescriptionContainer}>
              <TextInput
                style={styles.jobDescriptionText}
                placeholder="Describe your task...                                              'I need everything moved to my new apartment. I need someone with a truck and moving equipment.'"
                multiline
                numberOfLines={4}
                placeholderTextColor="#333333ab"
              />
              
                <View style={styles.inputButtonsContainer}>
                  <View style={styles.voiceContainer}>
                    <Pressable style={styles.voiceButton}>
                      <SvgXml xml={voiceIconSvg} width="20" height="20" />
                    </Pressable>
                    <Text style={styles.inputButtonsText}>Voice Mode</Text>
                  </View>
                  <View style={styles.cameraContainer}> 
                    <Text style={styles.inputButtonsText}>Add Photo or Video</Text> 
                    <Pressable style={styles.cameraButton}>
                      <SvgXml xml={cameraIconSvg} width="20" height="20" />
                    </Pressable>
                  </View>
                </View>
            </View>
            <View style={styles.DividerContainer2}>
                <View style={styles.DividerLine2} />
            </View>
            <View style={styles.binarySliderContainer}>
              <Animated.View style={styles.binarySlider}>
                <View style={styles.binarySliderIcons}>
                  <Image 
                    source={require('../assets/icons/AutoFillIcon.png')} 
                    style={[styles.binarySliderIcon, { opacity: isAuto ? 1 : 0.5, marginLeft: 9 }]} 
                  />
                  <Image 
                    source={require('../assets/icons/ChooseHelprIcon.png')} 
                    style={[styles.binarySliderIcon, { opacity: !isAuto ? 1 : 0.5 }]} 
                  />
                </View>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    setIsAuto(prev => !prev);
                    Animated.spring(slideAnimation, {
                      toValue: isAuto ? 1 : 0,
                      useNativeDriver: false,
                      friction: 8,
                      tension: 50
                    }).start();
                  }}
                >
                  <Animated.View
                    style={[
                      styles.binarySliderThumb,
                      {
                        transform: [{
                          translateX: slideAnimation.interpolate({
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
                <Text style={[styles.binarySliderLabel, styles.isAutoSliderTitle]}>
                  {isAuto ? 'AutoFill' : 'Custom'}
                </Text>
                {'\n'}
                <Text style={[styles.binarySliderLabel, styles.isAutoSliderSubtitle]}>
                  {isAuto ? 'Match me with the first available helpr' : 'Choose a helpr based on your preferences'}
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
                      setIsPersonal(prev => !prev);
                      Animated.spring(slideAnimation2, {
                        toValue: isPersonal ? 1 : 0,
                        useNativeDriver: false,
                        friction: 8,
                        tension: 50
                      }).start();
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
                onPress={() => router.push({ pathname: 'booked-services' as any, params: { showOverlay: 'true' } })}
                style={styles.scheduleHelprContainer}
              >
                <Text style={styles.scheduleHelprText}>Schedule Helpr</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
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
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10,
    marginTop: 5,
    height: 40,
  },
  PriceOfServiceQuoteText:{
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '400',
    color: '#0c4309',
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
    gap: 8,
  },
  cameraContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // Space between text and camera button
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
  },
  inputButtonIcon: {
    fontSize: 16,
    marginRight: 0,
  },
    inputButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0c4309',
    marginLeft: 30,
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
    paddingHorizontal: 6,
    marginBottom: 10,
    position: 'relative',
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
});
