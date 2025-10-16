import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Constants from 'expo-constants';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, ActivityIndicator, Image, Modal, TextInput } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, LatLng } from 'react-native-maps';
import * as Location from 'expo-location';
import LottieView from 'lottie-react-native';
import { supabase } from '../src/lib/supabase';

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

type CustomerRatingRow = {
  id: string;
  service_id: string;
  service_provider_id: string;
  customer_id: string;
  rating: number | null;
  comment: string | null;
};

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
  const [customerFirstName, setCustomerFirstName] = useState<string | null>(null);
  const [customerLastName, setCustomerLastName] = useState<string | null>(null);
  const [customerProfileImageUrl, setCustomerProfileImageUrl] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [ratingRecordId, setRatingRecordId] = useState<string | null>(null);
  const [ratingComment, setRatingComment] = useState<string | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const animationRef = useRef<LottieView | null>(null);
  const previousStatusRef = useRef<string | null>(null);

  const fetchServiceData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('service')
        .select('*')
        .eq('service_id', serviceId)
        .single();

      if (error) throw error;

      setService(data);
      setRating(0);
      setRatingRecordId(null);
      setRatingComment(null);

      if (data.customer_id && data.service_provider_id) {
        const { data: ratingRow, error: ratingFetchError } = await supabase
          .from('customer_ratings')
          .select('id, rating, comment')
          .eq('service_id', data.service_id)
          .eq('customer_id', data.customer_id)
          .eq('service_provider_id', data.service_provider_id)
          .maybeSingle();

        if (!ratingFetchError && ratingRow) {
          const typedRow = ratingRow as CustomerRatingRow;
          setRating(typeof typedRow.rating === 'number' && !Number.isNaN(typedRow.rating) ? typedRow.rating : 0);
          setRatingRecordId(typedRow.id ?? null);
          setRatingComment(typedRow.comment ?? null);
        }
      }

      if (data.service_provider_id) {
        const { data: providerData, error: providerError } = await supabase
          .from('service_provider')
          .select('first_name')
          .eq('service_provider_id', data.service_provider_id)
          .single();

        if (!providerError && providerData) {
          setHelprFirstName(providerData.first_name);
        }
      }

      if (data.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .from('customer')
          .select('first_name, last_name, profile_image_url')
          .eq('customer_id', data.customer_id)
          .single();

        if (!customerError && customerData) {
          setCustomerFirstName(customerData.first_name ?? null);
          setCustomerLastName(customerData.last_name ?? null);
          setCustomerProfileImageUrl(customerData.profile_image_url ?? null);
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
          filter: `service_id=eq.${serviceId}`,
        },
        () => {
          fetchServiceData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serviceId, fetchServiceData]);

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

  const getNextStatus = (currentStatus: string | null | undefined) => {
    const normalized = (currentStatus ?? '').toLowerCase();
    switch (normalized) {
      case 'confirmed':
        return 'helpr_otw';
      case 'helpr_otw':
        return 'in_progress';
      case 'in_progress':
        return 'completed';
      default:
        return null;
    }
  };

  const getButtonText = (status: string | null | undefined) => {
    const normalized = (status ?? '').toLowerCase();
    switch (normalized) {
      case 'confirmed':
        return "I'm on the way";
      case 'helpr_otw':
        return 'Start Service';
      case 'in_progress':
        return 'Complete Service';
      case 'completed':
        return 'Service Completed';
      default:
        return 'Update Status';
    }
  };

  const getOnTheWaySubtext = (status: string | null | undefined) => {
    const normalized = (status ?? '').toLowerCase();
    if (normalized === 'confirmed') {
      return 'Let the customer know when you are on the way';
    }
    if (normalized === 'helpr_otw') {
      return 'Let the customer know when you are at the service location. Press the Start Service button when you begin your work.';
    }
    return null;
  };

  const handleUpdateStatus = async () => {
    if (!service) return;

    const nextStatus = getNextStatus(service.status);
    if (!nextStatus) {
      return;
    }

    try {
      const { error } = await supabase
        .from('service')
        .update({ status: nextStatus })
        .eq('service_id', serviceId);

      if (error) throw error;

      // Refresh service data
      await fetchServiceData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const isCheckpointComplete = (checkpoint: string) => {
    const normalized = (service?.status ?? '').toLowerCase();
    switch (checkpoint) {
      case 'on_the_way':
        return normalized === 'helpr_otw' || normalized === 'in_progress' || normalized === 'completed';
      case 'in_progress':
        return normalized === 'in_progress' || normalized === 'completed';
      case 'completed':
        return normalized === 'completed';
      default:
        return false;
    }
  };

  const getAnimationFrame = (status: string | null | undefined) => {
    const normalized = (status ?? '').toLowerCase();
    switch (normalized) {
      case 'confirmed':
        return 0;
      case 'helpr_otw':
        return 20;
      case 'in_progress':
        return 50;
      case 'completed':
        return 70;
      default:
        return 0;
    }
  };

  // Animate to the appropriate frame when service status changes
  useEffect(() => {
    if (!animationRef.current || !service?.status) {
      return;
    }

    const normalized = service.status.toLowerCase();
    const previous = previousStatusRef.current;
    const startFrame = previous ? getAnimationFrame(previous) : 0;
    const endFrame = getAnimationFrame(normalized);

    if (startFrame === endFrame) {
      animationRef.current.play(endFrame, endFrame + 1);
    } else if (startFrame < endFrame) {
      animationRef.current.play(startFrame, endFrame);
    } else {
      animationRef.current.play(0, endFrame);
    }

    previousStatusRef.current = normalized;
  }, [service?.status]);

  const handleRateCustomer = useCallback(
    async (value: number) => {
      if (
        !service?.service_id ||
        !service?.customer_id ||
        !service?.service_provider_id ||
        submittingRating
      ) {
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
            .from('customer_ratings')
            .update({ rating: clampedValue })
            .eq('id', ratingRecordId);

          if (error) {
            throw error;
          }
        } else {
          const { data, error } = await supabase
            .from('customer_ratings')
            .insert({
              service_id: service.service_id,
              customer_id: service.customer_id,
              service_provider_id: service.service_provider_id,
              rating: clampedValue,
              comment: ratingComment ?? null,
            })
            .select('id')
            .single();

          if (error) {
            throw error;
          }

          if (data?.id) {
            setRatingRecordId(data.id);
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
    [
      service?.service_id,
      service?.customer_id,
      service?.service_provider_id,
      submittingRating,
      rating,
      ratingRecordId,
      ratingComment,
    ],
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
    if (
      !service?.service_id ||
      !service?.customer_id ||
      !service?.service_provider_id ||
      commentSaving
    ) {
      return;
    }

    const trimmed = commentDraft.trim();
    setCommentSaving(true);
    setCommentError(null);

    try {
      const normalized = trimmed.length > 0 ? trimmed : null;

      if (ratingRecordId) {
        const { data, error } = await supabase
          .from('customer_ratings')
          .update({ comment: normalized })
          .eq('id', ratingRecordId)
          .select('comment')
          .single();

        if (error) {
          throw error;
        }

        setRatingComment(data?.comment ?? null);
      } else {
        const { data, error } = await supabase
          .from('customer_ratings')
          .insert({
            service_id: service.service_id,
            customer_id: service.customer_id,
            service_provider_id: service.service_provider_id,
            rating: rating > 0 ? rating : null,
            comment: normalized,
          })
          .select('id, comment, rating')
          .single();

        if (error) {
          throw error;
        }

        if (data?.id) {
          setRatingRecordId(data.id);
        }
        if (typeof data?.rating === 'number' && !Number.isNaN(data.rating)) {
          setRating(data.rating);
        }
        setRatingComment(data?.comment ?? null);
      }

      setCommentDraft(normalized ?? '');
      setCommentModalVisible(false);
    } catch (error) {
      console.error('Failed to save customer comment:', error);
      setCommentError('Unable to save your comment right now. Please try again.');
    } finally {
      setCommentSaving(false);
    }
  }, [
    service?.service_id,
    service?.customer_id,
    service?.service_provider_id,
    commentDraft,
    commentSaving,
    ratingRecordId,
    rating,
  ]);

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
                ref={animationRef}
                source={require('../assets/animations/ServiceProgressionAnimation.json')}
                autoPlay={false}
                loop={false}
                style={styles.lottieAnimation}
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
                    <Text style={styles.stageLabelSubtextInProgress}>Check with your client or make sure the service is finished before marking the service as completed.</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.stageLabelCompleted}>
                <Text style={styles.stageLabelTextCompleted}>Completed</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Update Status Button */}
        <View style={styles.actionButtonContainer}>
          {service?.status?.toLowerCase() === 'completed' ? (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewTitle}>
                {`Leave a review for ${customerFirstName ?? 'your customer'}`}
              </Text>
              <View style={styles.reviewContentRow}>
                {customerProfileImageUrl ? (
                  <Image
                    source={{ uri: customerProfileImageUrl }}
                    style={styles.reviewAvatar}
                  />
                ) : (
                  <View style={styles.reviewAvatarPlaceholder}>
                    <Text style={styles.reviewAvatarInitials}>
                      {`${customerFirstName?.charAt(0) ?? ''}${customerLastName?.charAt(0) ?? ''}`.trim() || 'C'}
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
                        onPress={() => handleRateCustomer(value)}
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
                  {submittingRating ? (
                    <Text style={styles.ratingStatusText}>Saving your rating…</Text>
                  ) : ratingError ? (
                    <Text style={styles.ratingErrorText}>{ratingError}</Text>
                  ) : rating > 0 ? (
                    <Text style={styles.ratingStatusText}>Thanks for your feedback!</Text>
                  ) : (
                    <Text style={styles.ratingHintText}>Tap a star to rate your experience.</Text>
                  )}
                  {ratingComment ? (
                    <View style={styles.commentPreview}>
                      <Text style={styles.commentPreviewLabel}>Your comment</Text>
                      <Text style={styles.commentPreviewText}>{ratingComment}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.commentButton, commentSaving ? styles.commentButtonDisabled : null]}
                    onPress={handleOpenCommentModal}
                    disabled={commentSaving}
                  >
                    <Text style={styles.commentButtonText}>
                      {ratingComment ? 'Edit comment' : 'Leave a comment'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
          {service?.status !== 'completed' && (
            <Pressable style={styles.updateButton} onPress={handleUpdateStatus}>
              <Text style={styles.updateButtonText}>{getButtonText(service?.status)}</Text>
            </Pressable>
          )}
          <Pressable 
            style={styles.backToServicesButton} 
            onPress={() => router.push('/landing' as any)}
          >
            <Text style={styles.backToServicesText}>back to available services</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={commentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseCommentModal}
      >
        <View style={styles.commentModalOverlay}>
          <View style={styles.commentModalContent}>
            <Text style={styles.commentModalTitle}>Share more about your client</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Leave a comment for your customer"
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
  commentButton: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0c4309',
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  commentButtonDisabled: {
    opacity: 0.6,
  },
  commentButtonText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
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
    paddingTop: Platform.OS === 'ios' ? 90 : 40,
    paddingBottom: 0,
    paddingHorizontal: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    alignItems: 'flex-start',
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4309',
  },
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 50,
    paddingTop: 16,
  },
  mapContainer: {
    height: 222,
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
  animationTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 35,
    marginTop: 10,
    marginLeft: 20,
    paddingTop: 10,
    alignSelf: 'flex-start',
  },
  animationContentRow: {
    marginTop: 25,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
    paddingRight: 20,
    paddingBottom: 20,
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
    height: 220,
    paddingTop: 8,
    paddingBottom: 15,
  },
  stageLabelOnTheWay: {
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  stageLabelTextOnTheWay: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 4,
  },
  stageLabelSubtextOnTheWayWrapper: {
    width: '100%',
    minHeight: 44,
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
    marginBottom: 4,
  },
  actionButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  updateButton: {
    backgroundColor: '#0c4309',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 12,
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  backToServicesButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backToServicesText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewSection: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fff8e8',
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 10,
  },
  reviewContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
  },
  reviewSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0c4309',
    marginBottom: 8,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  starButton: {
    marginRight: 10,
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
