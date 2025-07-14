import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Constants from 'expo-constants';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator, Image, Pressable, Modal, TextInput } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, LatLng } from 'react-native-maps';
import * as Location from 'expo-location';
import LottieView from 'lottie-react-native';
import { supabase } from '../src/lib/supabase';
import { markCompletedServiceAsViewed } from '../src/lib/viewedCompletedServices';

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

type ServiceData = {
  service_id: string;
  service_type?: string | null;
  location?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  scheduled_date_time?: string | null;
  price?: number | null;
  status?: string | null;
  description?: string | null;
  service_provider_id?: string | null;
  customer_id?: string | null;
  provider_rating?: number | null;
  provider_review?: string | null;
  customer_rating?: number | null;
  customer_review?: string | null;
};

type LocationData = {
  coordinate: { latitude: number; longitude: number };
  description: string;
};

type ServiceProviderRatingRow = {
  id: string;
  service_id: string;
  service_provider_id: string;
  customer_id: string;
  rating: number | null;
  comment: string | null;
};

// Decode polyline from Google Directions API
const decodePolyline = (encoded: string): LatLng[] => {
  const poly: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return poly;
};

const ensureRouteEndpoints = (
  path: LatLng[],
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): LatLng[] => {
  if (path.length < 2) {
    return [start, end];
  }
  const newPath = [...path];
  newPath[0] = start;
  newPath[newPath.length - 1] = end;
  return newPath;
};

const LOTTIE_FRAME_RATE = 29.97;
const STATUS_FRAME_MAP: Record<string, number> = {
  confirmed: 0,
  helpr_otw: 20,
  in_progress: 50,
  completed: 70,
};

export default function ServiceDetails() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const serviceId = params.serviceId as string;
  const googlePlacesApiKey = useMemo(resolveGooglePlacesKey, []);

  const [service, setService] = useState<ServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startLocation, setStartLocation] = useState<LocationData | null>(null);
  const [endLocation, setEndLocation] = useState<LocationData | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [helprFirstName, setHelprFirstName] = useState<string | null>(null);
  const [helprLastName, setHelprLastName] = useState<string | null>(null);
  const [helprProfileImageUrl, setHelprProfileImageUrl] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [ratingRecordId, setRatingRecordId] = useState<string | null>(null);
  const [ratingComment, setRatingComment] = useState<string | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const animationRef = useRef<LottieView | null>(null);
  const [animationLoaded, setAnimationLoaded] = useState(false);
  const latestRequestRef = useRef(0);
  const pendingAnimationRef = useRef<{ frame: number; status: string } | null>(null);
  const [hasShowReviewedModal, setHasShowReviewedModal] = useState(false);

  const helprDisplayName = useMemo(() => {
    const trimmedFirst = helprFirstName?.trim();
    if (trimmedFirst) {
      return trimmedFirst;
    }

    const trimmedLast = helprLastName?.trim();
    if (trimmedLast) {
      return trimmedLast;
    }

    return null;
  }, [helprFirstName, helprLastName]);

  const helprSentenceName = helprDisplayName ?? 'your Helpr';
  const helprSentenceStartName = helprDisplayName ?? 'Your Helpr';
  const helprTitleName = helprDisplayName ?? 'Your Helpr';

  const fetchServiceData = useCallback(async () => {
    if (!serviceId) {
      return;
    }

    console.log('🔄 Fetching service data for:', serviceId);

    try {
      const { data, error } = await supabase
        .from('service')
        .select('*')
        .eq('service_id', serviceId)
        .single();

      if (error) throw error;

      console.log('✅ Service data fetched. Status:', data.status);
      setService(data);
      setRating(0);
      setRatingRecordId(null);
      setRatingComment(null);

      // Mark completed services as viewed
      if (data.status?.toLowerCase() === 'completed') {
        markCompletedServiceAsViewed(data.service_id);
      }

      if (data.service_provider_id && data.customer_id) {
        const { data: ratingRow, error: ratingFetchError } = await supabase
          .from('service_provider_ratings')
          .select('id, rating, comment')
          .eq('service_id', data.service_id)
          .eq('customer_id', data.customer_id)
          .eq('service_provider_id', data.service_provider_id)
          .maybeSingle();

        if (!ratingFetchError && ratingRow) {
          const typedRow = ratingRow as ServiceProviderRatingRow;
          setRating(typeof typedRow.rating === 'number' && !Number.isNaN(typedRow.rating) ? typedRow.rating : 0);
          setRatingRecordId(typedRow.id ?? null);
          setRatingComment(typedRow.comment ?? null);
        }
      }

      if (data.service_provider_id) {
        const { data: providerData, error: providerError } = await supabase
          .from('service_provider')
          .select('first_name, last_name, profile_image_url')
          .eq('service_provider_id', data.service_provider_id)
          .single();

        if (!providerError && providerData) {
          setHelprFirstName(providerData.first_name);
          setHelprLastName(providerData.last_name ?? null);
          setHelprProfileImageUrl(providerData.profile_image_url ?? null);
        }
      }

      if (data.start_location) {
        const startGeocode = await geocodeAddress(data.start_location);
        if (startGeocode) {
          setStartLocation(startGeocode);
        }
      }
      if (data.end_location) {
        const endGeocode = await geocodeAddress(data.end_location);
        if (endGeocode) {
          setEndLocation(endGeocode);
        }
      } else if (data.location && !data.start_location && !data.end_location) {
        const locationGeocode = await geocodeAddress(data.location);
        if (locationGeocode) {
          setStartLocation(locationGeocode);
        }
      }
    } catch (error) {
      console.error('Error fetching service:', error);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchServiceData();
  }, [fetchServiceData]);

  useEffect(() => {
    if (!serviceId) {
      return;
    }

    const channel = supabase
      .channel(`service-status-${serviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service',
        },
        (payload) => {
          if (payload.new && payload.new.service_id === serviceId) {
            fetchServiceData();
          }
        }
      )
      .subscribe();

    // Poll every 5 seconds as a fallback
    const pollInterval = setInterval(() => {
      fetchServiceData();
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [serviceId, fetchServiceData]);

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
  }, [startLocation, endLocation, googlePlacesApiKey]);

  // Fit map to markers once loaded
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    if (startLocation && endLocation) {
      const coordinatesToFit =
        routeCoordinates.length > 1
          ? routeCoordinates
          : [startLocation.coordinate, endLocation.coordinate];

      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coordinatesToFit, {
          edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
          animated: true,
        });
      }, 350);
    } else if (startLocation) {
      setTimeout(() => {
        mapRef.current?.animateToRegion(
          {
            ...startLocation.coordinate,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          750,
        );
      }, 350);
    }
  }, [startLocation, endLocation, routeCoordinates]);

  const geocodeAddress = async (address: string): Promise<LocationData | null> => {
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
      console.warn('Failed to geocode address:', error);
    }

    return null;
  };

  const getStatusTitle = (status: string | null | undefined) => {
    const normalized = (status ?? '').toLowerCase();
    switch (normalized) {
      case 'confirmed':
        return 'Service Details';
      case 'helpr_otw':
        return helprFirstName ? `${helprFirstName} is on the way!` : 'On the Way';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Service Completed';
      default:
        return 'Service Details';
    }
  };

  const getOnTheWaySubtext = (status: string | null | undefined) => {
    const normalized = (status ?? '').toLowerCase();
    if (normalized === 'confirmed') {
  return `${helprSentenceStartName} will let you know when they are on the way`;
    }
    if (normalized === 'helpr_otw') {
  return `${helprSentenceStartName} will let you know when they are at your location`;
    }
    return null;
  };

  const getAnimationFrame = (status: string | null | undefined) => {
    const normalized = (status ?? '').toLowerCase();
    return STATUS_FRAME_MAP[normalized] ?? 0;
  };

  const currentServiceIdRef = useRef<string | null>(null);
  const currentStatusRef = useRef<string | null>(null);
  const currentFrameRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);

  // Synchronize animation with the current service status.
  useEffect(() => {
    const lottieView = animationRef.current;
    const activeServiceId = service?.service_id;
    const rawStatus = service?.status;

    console.log('🔍 [Customer] Animation sync check:', { 
      hasLottie: !!lottieView, 
      serviceId: activeServiceId, 
      status: rawStatus,
      loaded: animationLoaded,
      currentServiceId: currentServiceIdRef.current,
      currentStatus: currentStatusRef.current,
      currentFrame: currentFrameRef.current
    });

    if (!lottieView || !activeServiceId || !rawStatus || !animationLoaded) {
      return;
    }

    const normalizedStatus = rawStatus.toLowerCase();
    const targetFrame = getAnimationFrame(normalizedStatus);

    const isNewService = currentServiceIdRef.current !== activeServiceId;
    const previousStatus = currentStatusRef.current;
    const previousFrame = currentFrameRef.current;

    const syncToFrame = (frame: number, status: string) => {
      const instance = animationRef.current as unknown as {
        goToAndStop?(position: number, isFrame: boolean): void;
        pause?: () => void;
      } | null;

      if (!instance) {
        return;
      }

      try {
        instance.pause?.();
        if (typeof instance.goToAndStop === 'function') {
          instance.goToAndStop(frame, true);
        } else {
          animationRef.current?.play(frame, frame);
        }
      } finally {
        currentFrameRef.current = frame;
        currentStatusRef.current = status;
      }
    };

    const animateForward = (fromFrame: number, toFrame: number, status: string) => {
      if (fromFrame >= toFrame) {
        syncToFrame(toFrame, status);
        return;
      }

      if (isAnimatingRef.current) {
        const existingPending = pendingAnimationRef.current;
        if (!existingPending || toFrame >= existingPending.frame) {
          pendingAnimationRef.current = { frame: toFrame, status };
        }
        return;
      }

      const instance = animationRef.current;
      if (!instance) {
        return;
      }

      isAnimatingRef.current = true;
      pendingAnimationRef.current = null;

      try {
        instance.play(fromFrame, toFrame);
      } catch (error) {
        console.warn('Failed to play animation segment', error);
        syncToFrame(toFrame, status);
        isAnimatingRef.current = false;
        return;
      }

      const estimatedDuration = Math.max(
        400,
        ((toFrame - fromFrame) / LOTTIE_FRAME_RATE) * 1000,
      );

      setTimeout(() => {
        syncToFrame(toFrame, status);
        isAnimatingRef.current = false;

        const pending = pendingAnimationRef.current;
        if (pending) {
          pendingAnimationRef.current = null;
          const resumeFrom = currentFrameRef.current ?? toFrame;
          animateForward(resumeFrom, pending.frame, pending.status);
        }
      }, estimatedDuration + 80);
    };

    if (isNewService) {
      console.log('🎬 [Customer] New service detected, animating from 0 to', targetFrame, 'for status:', normalizedStatus);
      currentServiceIdRef.current = activeServiceId;
      currentStatusRef.current = null;
      currentFrameRef.current = 0;
      isAnimatingRef.current = false;
      pendingAnimationRef.current = null;
      animateForward(0, targetFrame, normalizedStatus);
      return;
    }

    if (!previousStatus) {
      syncToFrame(targetFrame, normalizedStatus);
      return;
    }

    if (previousStatus === normalizedStatus) {
      if (previousFrame !== targetFrame) {
        syncToFrame(targetFrame, normalizedStatus);
      }
      return;
    }

    const startingFrame = previousFrame ?? getAnimationFrame(previousStatus);
    animateForward(startingFrame, targetFrame, normalizedStatus);
  }, [service?.service_id, service?.status, animationLoaded]);

  useEffect(() => {
    if (!service?.service_id) {
      return;
    }
    // Reset all animation state when service changes
    console.log('🔄 [Customer] Service changed to:', service?.service_id, 'Status:', service?.status);
    setAnimationLoaded(false);
    currentServiceIdRef.current = null;
    currentStatusRef.current = null;
    currentFrameRef.current = null;
    isAnimatingRef.current = false;
    pendingAnimationRef.current = null;
    
    // Fallback: set loaded to true after a short delay if callback doesn't fire
    const fallbackTimer = setTimeout(() => {
      console.log('⏰ [Customer] Animation load fallback triggered');
      setAnimationLoaded(true);
    }, 500);
    
    return () => clearTimeout(fallbackTimer);
  }, [service?.service_id]);

  useEffect(() => {
    return () => {
      currentServiceIdRef.current = null;
      currentStatusRef.current = null;
      currentFrameRef.current = null;
      isAnimatingRef.current = false;
      pendingAnimationRef.current = null;
    };
  }, []);

  const handleRateService = useCallback(
    async (value: number) => {
      if (!service?.service_id || submittingRating) {
        return;
      }

      if (!service.customer_id || !service.service_provider_id) {
        setRatingError('Missing service details. Please try again later.');
        return;
      }

      const clampedValue = Math.min(5, Math.max(1, value));
      const previousRating = rating;
      setRating(clampedValue);
      setSubmittingRating(true);
      setRatingError(null);

      try {
        if (ratingRecordId) {
          const { error } = await supabase
            .from('service_provider_ratings')
            .update({ rating: clampedValue })
            .eq('id', ratingRecordId);

          if (error) {
            throw error;
          }
        } else {
          const { data: insertedRow, error } = await supabase
            .from('service_provider_ratings')
            .insert({
              service_id: service.service_id,
              customer_id: service.customer_id,
              service_provider_id: service.service_provider_id,
              rating: clampedValue,
              comment: ratingComment ?? null,
            })
            .select('id, comment')
            .single();

          if (error) {
            throw error;
          }

          const typedRow = insertedRow as ServiceProviderRatingRow | null;
          setRatingRecordId(typedRow?.id ?? null);
          if (typedRow?.comment !== undefined) {
            setRatingComment(typedRow.comment ?? null);
          }
        }
      } catch (error) {
        console.error('Failed to save rating:', error);
        setRating(previousRating);
        setRatingError('Unable to save rating. Please try again.');
      } finally {
        setSubmittingRating(false);
      }
    },
    [service?.service_id, service?.customer_id, service?.service_provider_id, submittingRating, rating, ratingRecordId, ratingComment],
  );
  
  const handleOpenCommentModal = () => {
    if (commentSaving) {
      return;
    }
    setCommentError(null);
    setCommentDraft(ratingComment ?? '');
    setCommentModalVisible(true);
  };

  const handleCloseCommentModal = () => {
    if (commentSaving) {
      return;
    }
    setCommentModalVisible(false);
  };

  const handleSaveComment = useCallback(async () => {
    if (!service?.service_id || commentSaving) {
      return;
    }

    if (!service.customer_id || !service.service_provider_id) {
      setCommentError('Missing service details. Please try again later.');
      return;
    }

    const trimmed = commentDraft.trim();
    setCommentSaving(true);
    setCommentError(null);

    try {
      const normalized = trimmed.length > 0 ? trimmed : null;

      if (ratingRecordId) {
        const { data: updatedRow, error } = await supabase
          .from('service_provider_ratings')
          .update({ comment: normalized })
          .eq('id', ratingRecordId)
          .select('comment')
          .single();

        if (error) {
          throw error;
        }

        const typedRow = updatedRow as ServiceProviderRatingRow | null;
        setRatingComment(typedRow?.comment ?? normalized ?? null);
      } else {
        const { data: insertedRow, error } = await supabase
          .from('service_provider_ratings')
          .insert({
            service_id: service.service_id,
            customer_id: service.customer_id,
            service_provider_id: service.service_provider_id,
            rating: rating > 0 ? rating : null,
            comment: normalized,
          })
          .select('id, comment')
          .single();

        if (error) {
          throw error;
        }

        const typedRow = insertedRow as ServiceProviderRatingRow | null;
        setRatingRecordId(typedRow?.id ?? null);
        setRatingComment(typedRow?.comment ?? normalized ?? null);
      }

      setCommentModalVisible(false);
    } catch (error) {
      console.error('Failed to save provider comment:', error);
      setCommentError('Unable to save your comment right now. Please try again.');
    } finally {
      setCommentSaving(false);
    }
  }, [service?.service_id, service?.customer_id, service?.service_provider_id, commentDraft, commentSaving, ratingRecordId, rating]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0c4309" />
      </View>
    );
  }

  const onTheWaySubtext = getOnTheWaySubtext(service?.status);

  const defaultRegion = {
    latitude: startLocation?.coordinate.latitude ?? 40.7128,
    longitude: startLocation?.coordinate.longitude ?? -74.0060,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#0c4309" />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Image 
            source={require('../assets/icons/backButton.png')} 
            style={styles.backButtonIcon} 
          />
        </Pressable>
        <Text style={styles.headerTitle}>{getStatusTitle(service?.status)}</Text>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.contentContainer}>
        {/* Map View */}
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

        {/* Service Progress Animation */}
        <View style={styles.animationContainer}>
          <View style={styles.animationContentRow}>
            <View style={styles.animationWrapper}>
              <LottieView
                key={service?.service_id ?? 'service-animation'}
                ref={animationRef}
                source={require('../assets/animations/ServiceProgressionAnimation.json')}
                autoPlay={false}
                loop={false}
                speed={1}
                style={styles.lottieAnimation}
                onAnimationLoaded={() => { 
                  console.log('🎨 [Customer] Animation loaded for service:', service?.service_id);
                  setAnimationLoaded(true); 
                }}
              />
            </View>
            <View style={styles.stageLabelsContainer}>
              <View style={styles.stageLabelOnTheWay}>
                <Text style={styles.stageLabelTextOnTheWay}>On the Way</Text>
                <View style={styles.stageLabelSubtextOnTheWayWrapper}>
                  {onTheWaySubtext ? (
                    <Text style={styles.stageLabelSubtextOnTheWay}>{onTheWaySubtext}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.stageLabelInProgress}>
                <Text style={styles.stageLabelTextInProgress}>In Progress</Text>
                <View style={styles.stageLabelSubtextInProgressWrapper}>
                  {service?.status?.toLowerCase() === 'in_progress' ? (
                    <Text style={styles.stageLabelSubtextInProgress}>{`Make sure the service is complete before dismissing ${helprSentenceName}`}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.stageLabelCompleted}>
                <Text style={styles.stageLabelTextCompleted}>Completed</Text>
              </View>
            </View>
          </View>
        </View>

        {service?.status?.toLowerCase() === 'completed' ? (
          <>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewTitle}>
                Leave A Review For {helprFirstName || 'Your Helpr'}
              </Text>
              <View style={styles.reviewContentRow}>
              {helprProfileImageUrl ? (
                <Image
                  source={{ uri: helprProfileImageUrl }}
                  style={styles.reviewAvatar}
                />
              ) : (
                <View style={styles.reviewAvatarPlaceholder}>
                  <Text style={styles.reviewAvatarInitials}>
                    {`${helprFirstName?.charAt(0) ?? ''}${helprLastName?.charAt(0) ?? ''}`.trim() || 'H'}
                  </Text>
                </View>
              )}
              <View style={styles.reviewBody}>
                <Text style={styles.reviewSubtitle}>How was your service?</Text>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map(value => (
                    <Pressable
                      key={value}
                      style={styles.starButton}
                      onPress={() => handleRateService(value)}
                      disabled={submittingRating}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${value} star${value === 1 ? '' : 's'}`}
                    >
                      <FontAwesome
                        name={rating >= value ? 'star' : 'star-o'}
                        size={26}
                        color="#0c4309"
                      />
                    </Pressable>
                  ))}
                </View>
                {ratingComment ? (
                  <View style={styles.commentPreview}>
                    <Text style={styles.commentPreviewLabel}>Your comment</Text>
                    <Text style={styles.commentPreviewText}>{ratingComment}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <View style={styles.commentButtonContainer}>
            <Pressable
              style={[styles.commentButton, commentSaving ? styles.commentButtonDisabled : null]}
              onPress={handleOpenCommentModal}
              disabled={commentSaving}
            >
              <Text style={styles.commentButtonText}>
                {ratingComment ? 'Edit Comment' : 'Leave A Comment'}
              </Text>
            </Pressable>
          </View>
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={commentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseCommentModal}
      >
        <View style={styles.commentModalOverlay}>
          <View style={styles.commentModalContent}>
            <Text style={styles.commentModalTitle}>Share more about your experience</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Leave a comment for your Helpr"
              placeholderTextColor="#9B9B9B"
              multiline
              autoFocus
              value={commentDraft}
              onChangeText={setCommentDraft}
              editable={!commentSaving}
              autoCapitalize="sentences"
            />
            {commentError ? <Text style={styles.commentErrorText}>{commentError}</Text> : null}
            <View style={styles.commentModalActions}>
              <Pressable
                style={[styles.commentModalButton, styles.commentModalCancel]}
                onPress={handleCloseCommentModal}
                disabled={commentSaving}
              >
                <Text style={styles.commentModalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.commentModalButton, commentSaving ? styles.commentModalButtonDisabled : null]}
                onPress={handleSaveComment}
                disabled={commentSaving}
              >
                <Text style={styles.commentModalButtonText}>
                  {commentSaving ? 'Saving…' : 'Save comment'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF8E8',
  },
  commentButtonContainer: {
    alignItems: 'center',
    marginTop: 0,
    paddingHorizontal: 20,
    width: '100%',
  },
  commentButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0c4309',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  commentButtonDisabled: {
    opacity: 0.6,
  },
  commentButtonText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  commentPreview: {
    marginTop: 10,
    backgroundColor: '#FFF3DA',
    padding: 10,
    borderRadius: 10,
  },
  commentPreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0c4309',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  commentPreviewText: {
    fontSize: 13,
    color: '#0c4309',
    lineHeight: 18,
  },
  commentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  commentModalContent: {
    width: '100%',
    backgroundColor: '#FFF8E8',
    borderRadius: 18,
    padding: 20,
  },
  commentModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 16,
  },
  commentInput: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9C6A5',
    padding: 14,
    backgroundColor: '#FFFFFF',
    color: '#0c4309',
    textAlignVertical: 'top',
    fontSize: 14,
  },
  commentErrorText: {
    marginTop: 8,
    color: '#b3261e',
    fontSize: 13,
    fontWeight: '600',
  },
  commentModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  commentModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#0c4309',
    marginLeft: 12,
  },
  commentModalCancel: {
    backgroundColor: '#D9C6A5',
  },
  commentModalButtonDisabled: {
    opacity: 0.7,
  },
  commentModalButtonText: {
    color: '#FFF8E8',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#FFF8E8',
    paddingTop: Platform.OS === 'ios' ? 70 : 40,
    paddingBottom: 15,
    paddingHorizontal: 20,
  },
  backButton: {
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backButtonIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
    paddingTop: 0,
  },
  mapContainer: {
    height: 262,
    backgroundColor: '#fff',
    position: 'relative',
    borderColor: '#9b9b9bff',
    borderBottomWidth: 1,
    borderTopWidth: 1,
  },
  map: {
    width: '100%',
    height: '100%',
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
  animationContainer: {
    backgroundColor: '#fff8e8',
    marginTop: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 5,
  },
  animationContentRow: {
    marginTop: 25,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
    paddingRight: 20,
    paddingBottom: 0, 
  },
  animationWrapper: {
    width: 50,
    height: 200,
    marginLeft: 20,
    marginRight: 10,
  },
  lottieAnimation: {
    width: '100%',
    height: '100%',
  },
  stageLabelsContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    height: 200,
    paddingTop: 8,
    paddingBottom: 15,
  },
  stageLabelOnTheWay: {
    justifyContent: 'flex-start',
    marginBottom: 28,
  },
  stageLabelTextOnTheWay: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 0,
  },
  stageLabelSubtextOnTheWayWrapper: {
    width: '100%',
    minHeight: 32,
    justifyContent: 'flex-start',
  },
  stageLabelSubtextOnTheWay: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0c4309',
    lineHeight: 14,
  },
  stageLabelInProgress: {
    justifyContent: 'flex-start',
    marginBottom: 25,
  },
  stageLabelTextInProgress: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 4,
  },
  stageLabelSubtextInProgressWrapper: {
    width: '100%',
    minHeight: 32,
    justifyContent: 'flex-start',
  },
  stageLabelSubtextInProgress: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0c4309',
    lineHeight: 14,
  },
  stageLabelCompleted: {
    justifyContent: 'flex-start',
    marginBottom: 0,
  },
  stageLabelTextCompleted: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0c4309',
  },
  actionButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  reviewSection: {
    marginTop: 0,
    marginHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderRadius: 18,
    backgroundColor: '#fff8e8',
    alignSelf: 'center',
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 15,
    alignSelf: 'center',
  },
  reviewContentRow: {
    flexDirection: 'row',
    alignSelf: 'center',
  },
  reviewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
    borderWidth: 2,
    borderColor: '#0c4309',
  },
  reviewAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
    backgroundColor: '#0c4309',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarInitials: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  reviewBody: {
  },
  reviewSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0c4309',
    marginBottom: 8,
    marginTop: 6,
    alignSelf: 'center',
  },
  starRow: {
    flexDirection: 'row',
    marginBottom: 0,
    alignSelf: 'flex-start',
  },
  starButton: {
    marginRight: 3,
    marginLeft: 3,
  },
  ratingStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0c4309',
  },
  ratingHintText: {
    fontSize: 12,
    color: '#4f4f4f',
  },
  ratingErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a11313',
  },
});
