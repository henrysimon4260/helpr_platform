import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useModal } from '../../context/ModalContext';

type ServiceFillRequestRow = {
  service_provider_id: string;
  bid: string | null;
  proposed_date_time: string | null;
};

type ServiceProviderRow = {
  service_provider_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_picture_url: string | null;
  rating: number | null;
  jobs_completed: number | null;
};

type ProviderRequestDisplay = {
  service_provider_id: string;
  fullName: string;
  firstName: string;
  initials: string;
  bid: number;
  bidLabel: string;
  email: string | null;
  profileImageUrl: string | null;
  rating: number | null;
  jobsCompleted: number | null;
  proposedDateTimeLabel: string | null;
  proposedDateTimeBanner: string | null;
};

const parseBid = (rawBid: string | null): number => {
  if (rawBid === null || rawBid === undefined) {
    return 0;
  }

  const directNumeric = Number(rawBid);
  if (Number.isFinite(directNumeric)) {
    return directNumeric;
  }

  const cleaned = rawBid.replace(/[^0-9.]/g, '');
  const fallbackNumeric = Number(cleaned);
  return Number.isFinite(fallbackNumeric) ? fallbackNumeric : 0;
};

const formatPrice = (value: number): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safeValue);
  } catch (error) {
    return `$${Math.round(safeValue)}`;
  }
};

const formatProposedDateTime = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch (error) {
    console.warn('Unable to format proposed date time:', error);
    return null;
  }
};

const formatProposedDateTimeForBanner = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const parsedDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());

    let dateString: string;
    if (parsedDate.getTime() === today.getTime()) {
      dateString = 'Today';
    } else if (parsedDate.getTime() === tomorrow.getTime()) {
      dateString = 'Tomorrow';
    } else {
      dateString = parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    const timeString = parsed.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    return `${dateString} at ${timeString}`;
  } catch (error) {
    console.warn('Unable to format proposed date time for banner:', error);
    return null;
  }
};

const SelectHelpr = () => {
  const params = useLocalSearchParams<{ serviceId?: string | string[] }>();
  const serviceId = useMemo(() => {
    const raw = params?.serviceId;
    if (!raw) {
      return null;
    }
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ProviderRequestDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectingProviderId, setSelectingProviderId] = useState<string | null>(null);
  const [serviceSchedulingType, setServiceSchedulingType] = useState<string | null>(null);
  const { showModal } = useModal();

  const isAsapService = useMemo(() => (serviceSchedulingType ?? '').toLowerCase() === 'asap', [serviceSchedulingType]);

  const fetchRequests = useCallback(async () => {
    if (!serviceId) {
      setError('Missing service reference.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const fillPromise = supabase
        .from('service_fill_request')
        .select('service_provider_id, bid, proposed_date_time')
        .eq('service_id', serviceId);

      const servicePromise = supabase
        .from('service')
        .select('scheduling_type')
        .eq('service_id', serviceId)
        .maybeSingle();

      const [{ data: fillRows, error: fillError }, { data: serviceRow, error: serviceError }] = await Promise.all([
        fillPromise,
        servicePromise,
      ]);

      if (serviceError) {
        throw serviceError;
      }

      setServiceSchedulingType(serviceRow?.scheduling_type ?? null);

      if (fillError) {
        throw fillError;
      }

      if (!fillRows || fillRows.length === 0) {
        setRequests([]);
        return;
      }

      const typedFillRows = (fillRows ?? []) as unknown as ServiceFillRequestRow[];

      const providerIds = Array.from(
        new Set(
          typedFillRows
            .map(row => row?.service_provider_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (providerIds.length === 0) {
        setRequests([]);
        return;
      }

      const { data: providerRows, error: providerError } = await supabase
        .from('service_provider')
        .select('service_provider_id, first_name, last_name, email, profile_picture_url, rating, jobs_completed')
        .in('service_provider_id', providerIds);

      if (providerError) {
        throw providerError;
      }

      const providerMap = new Map<string, ServiceProviderRow>(
        (providerRows ?? []).map(row => [row.service_provider_id, row as ServiceProviderRow]),
      );

      const formatted: ProviderRequestDisplay[] = typedFillRows
        .filter(row => row?.service_provider_id)
        .map(row => {
          const provider = providerMap.get(row.service_provider_id);
          const firstName = provider?.first_name?.trim() ?? '';
          const lastName = provider?.last_name?.trim() ?? '';
          const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unnamed Helpr';
          const initials = `${firstName.charAt(0) ?? ''}${lastName.charAt(0) ?? ''}`.toUpperCase() || 'H';
          const bid = parseBid(row.bid);
          const proposedDateTimeLabel = formatProposedDateTime(row.proposed_date_time ?? null);
          const proposedDateTimeBanner = formatProposedDateTimeForBanner(row.proposed_date_time ?? null);
          const profileImageUrl = provider?.profile_picture_url ?? null;
          const rating =
            typeof provider?.rating === 'number' && !Number.isNaN(provider.rating) && provider.rating > 0
              ? provider.rating
              : null;
          const jobsCompleted =
            typeof provider?.jobs_completed === 'number' && !Number.isNaN(provider.jobs_completed) && provider.jobs_completed > 0
              ? provider.jobs_completed
              : null;

          return {
            service_provider_id: row.service_provider_id,
            fullName,
            firstName: firstName || fullName,
            initials,
            bid,
            bidLabel: formatPrice(bid),
            email: provider?.email ?? null,
            profileImageUrl,
            rating,
            jobsCompleted,
            proposedDateTimeLabel,
            proposedDateTimeBanner,
          };
        })
        .sort((a, b) => a.bid - b.bid);

      setRequests(formatted);
    } catch (fetchError) {
      console.error('Failed to load helpr requests:', fetchError);
      setError('Unable to load Helpr requests right now.');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleSelectProvider = useCallback(
    async (request: ProviderRequestDisplay) => {
      if (!serviceId) {
        return;
      }

      try {
        setSelectingProviderId(request.service_provider_id);

        // Get the proposed_date_time from the service_fill_request
        const { data: fillRequestData, error: fetchError } = await supabase
          .from('service_fill_request')
          .select('proposed_date_time')
          .eq('service_id', serviceId)
          .eq('service_provider_id', request.service_provider_id)
          .single();

        if (fetchError) {
          console.error('Failed to fetch fill request:', fetchError);
        }

        // Prepare update object
        const updateData: {
          service_provider_id: string;
          status: string;
          price: number;
          scheduled_date_time?: string;
        } = {
          service_provider_id: request.service_provider_id,
          status: 'confirmed',
          price: request.bid,
        };

        // If there's a proposed_date_time, update the scheduled_date_time
        if (fillRequestData?.proposed_date_time) {
          updateData.scheduled_date_time = fillRequestData.proposed_date_time;
        }

        const { error: updateError } = await supabase
          .from('service')
          .update(updateData)
          .eq('service_id', serviceId);

        if (updateError) {
          throw updateError;
        }

        // Delete all service fill requests for this service
        const { error: deleteError } = await supabase
          .from('service_fill_request')
          .delete()
          .eq('service_id', serviceId);

        if (deleteError) {
          console.error('Failed to delete service fill requests:', deleteError);
          // Don't throw - the job is already confirmed, just log the error
        }

        setSelectingProviderId(null);

        router.replace({
          pathname: 'booked-services' as any,
          params: { 
            serviceId,
            showConfirmedModal: 'true',
            helprFirstName: request.firstName,
          },
        });
      } catch (selectError) {
        console.error('Failed to select helpr:', selectError);
        showModal({
          title: 'Unable to select Helpr',
          message: 'Please try again.',
        });
        setSelectingProviderId(null);
      }
    },
    [serviceId, showModal],
  );

  const renderContent = () => {
    if (!serviceId) {
      return (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.errorText}>We couldn&apos;t find the service you&apos;re looking for.</Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0c4309" />
          <Text style={styles.loadingText}>Loading Helpr requests…</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={fetchRequests}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    if (requests.length === 0) {
      return (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>No Helpr requests yet. Check back soon!</Text>
          <Pressable style={styles.retryButton} onPress={fetchRequests}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.requestList}
        contentContainerStyle={styles.requestListContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
      >
        {(() => {
          const availableAtRequestedTime = requests.filter(r => !r.proposedDateTimeLabel || isAsapService);
          const alternativeTimeProviders = requests.filter(r => r.proposedDateTimeLabel && !isAsapService);

          return (
            <>
              {availableAtRequestedTime.length === 0 && alternativeTimeProviders.length > 0 && (
                <View style={styles.emptyRequestedTimeSection}>
                  <Text style={styles.emptyRequestedTimeText}>No Helprs at your requested time yet</Text>
                </View>
              )}
              
              {availableAtRequestedTime.map(request => {
                const isSelecting = selectingProviderId === request.service_provider_id;
                return (
                  <View key={request.service_provider_id} style={styles.requestCard}>
                    <View style={styles.requestCardLeft}>
                      <View style={styles.profileCircle}>
                        {request.profileImageUrl ? (
                          <Image source={{ uri: request.profileImageUrl }} style={styles.profileImage} />
                        ) : (
                          <Text style={styles.profileInitials}>{request.initials}</Text>
                        )}
                      </View>
                      <View style={styles.providerDetails}>
                        <Text style={styles.providerName} numberOfLines={1}>
                          {request.firstName}
                        </Text>
                        <View style={styles.providerMetaRow}>
                          <View style={request.rating ? styles.ratingPill : styles.newBadge}>
                            <Text style={request.rating ? styles.ratingPillText : styles.newBadgeText}>
                              {request.rating ? `⭐️ ${request.rating.toFixed(1)}` : 'New to Helpr'}
                            </Text>
                          </View>
                          {typeof request.jobsCompleted === 'number' && request.jobsCompleted > 0 && (
                            <Text style={styles.providerSecondary}>
                              {`${request.jobsCompleted} job${request.jobsCompleted === 1 ? '' : 's'}`}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                    <View style={styles.requestCardRight}>
                      <Text style={styles.bidValue}>{request.bidLabel}</Text>
                      {isAsapService && request.proposedDateTimeLabel ? (
                        <View style={styles.requestedTimeContainer}>
                          <Text style={styles.requestedTimeLabel}>Requested time</Text>
                          <Text style={styles.requestedTimeValue}>{request.proposedDateTimeLabel}</Text>
                        </View>
                      ) : null}
                      <Pressable
                        style={[styles.selectButton, isSelecting ? styles.selectButtonDisabled : null]}
                        onPress={() => handleSelectProvider(request)}
                        disabled={isSelecting}
                        accessibilityRole="button"
                        accessibilityLabel={isSelecting ? `Selecting ${request.firstName}` : `Select ${request.firstName}`}
                        accessibilityHint="Confirms this Helpr for your service"
                      >
                        <Text style={styles.selectButtonText}>{isSelecting ? 'Selecting…' : 'Select'}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              
              {alternativeTimeProviders.length > 0 && (
                <>
                  <View style={styles.alternativeTimeDivider}>
                    <Text style={styles.alternativeTimeDividerText}>Alternative Time(s) Proposed by Helprs</Text>
                  </View>
                  {alternativeTimeProviders.map(request => {
                    const isSelecting = selectingProviderId === request.service_provider_id;
                    return (
                      <View key={request.service_provider_id} style={styles.requestCardContainer}>
                        <View style={[styles.requestCard, styles.requestCardWithBanner]}>
                          <View style={styles.alternativeTimeBanner}>
                            <Text style={styles.alternativeTimeBannerText}>
                              Available {request.proposedDateTimeBanner}
                            </Text>
                          </View>
                          <View style={styles.requestCardLeft}>
                            <View style={styles.profileCircle}>
                              {request.profileImageUrl ? (
                                <Image source={{ uri: request.profileImageUrl }} style={styles.profileImage} />
                              ) : (
                                <Text style={styles.profileInitials}>{request.initials}</Text>
                              )}
                            </View>
                            <View style={styles.providerDetails}>
                              <Text style={styles.providerName} numberOfLines={1}>
                                {request.firstName}
                              </Text>
                              <View style={styles.providerMetaRow}>
                                <View style={request.rating ? styles.ratingPill : styles.newBadge}>
                                  <Text style={request.rating ? styles.ratingPillText : styles.newBadgeText}>
                                    {request.rating ? `⭐️ ${request.rating.toFixed(1)}` : 'New to Helpr'}
                                  </Text>
                                </View>
                                {typeof request.jobsCompleted === 'number' && request.jobsCompleted > 0 && (
                                  <Text style={styles.providerSecondary}>
                                    {`${request.jobsCompleted} job${request.jobsCompleted === 1 ? '' : 's'}`}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>
                          <View style={styles.requestCardRight}>
                            <Text style={styles.bidValue}>{request.bidLabel}</Text>
                            <Pressable
                              style={[styles.selectButton, isSelecting ? styles.selectButtonDisabled : null]}
                              onPress={() => handleSelectProvider(request)}
                              disabled={isSelecting}
                              accessibilityRole="button"
                              accessibilityLabel={isSelecting ? `Selecting ${request.firstName}` : `Select ${request.firstName}`}
                              accessibilityHint="Confirms this Helpr for your service"
                            >
                              <Text style={styles.selectButtonText}>{isSelecting ? 'Selecting…' : 'Select'}</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </>
          );
        })()}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#0c4309" />
      <Pressable style={styles.backButton} onPress={() => router.push('/booked-services')}>
        <Image
          source={require('../../assets/icons/backButton.png')}
          style={styles.backButtonIcon}
        />
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Select a Helpr</Text>
      </View>
      <View style={styles.GreenHeaderBar}>
        <Text style={styles.AvailableProsText}>Available Pros</Text>
      </View>

      <View style={styles.contentContainer}>{renderContent()}</View>
    </View>
  );
};

export default SelectHelpr;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E5DCC9',
  },
  header: {
    backgroundColor: '#FFF8E8',
    padding: 15,
    paddingTop: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0c4309',
    paddingTop: 10,
  },
  GreenHeaderBar: {
    backgroundColor: '#0c4309',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  AvailableProsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyStateText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorText: {
    color: '#8B0000',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#0c4309',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#FFF8E8',
    fontSize: 14,
    fontWeight: '600',
  },
  requestList: {
    flex: 1,
  },
  requestListContent: {
    paddingTop: 15,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  requestCardContainer: {
    marginBottom: 14,
  },
  requestCard: {
    backgroundColor: '#F5E7D0',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  alternativeTimeBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0c4309',
    paddingVertical: 6,
    paddingHorizontal: 12,
    zIndex: 1,
  },
  alternativeTimeBannerText: {
    color: '#FFF8E8',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  requestCardWithBanner: {
    paddingTop: 36,
    marginBottom: 0,
  },
  emptyRequestedTimeSection: {
    paddingVertical: 60,
    paddingHorizontal: 16,
    marginBottom: 20,
    marginTop: 60,
    alignItems: 'center',
  },
  emptyRequestedTimeText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  alternativeTimeDivider: {
    backgroundColor: '#0c4309',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 6,
    marginLeft: -20,
    marginRight: -20,
  },
  alternativeTimeDividerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  requestCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  profileCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E5DCC9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
  profileInitials: {
    color: '#0c4309',
    fontSize: 22,
    fontWeight: '700',
  },
  providerName: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  providerDetails: {
    flex: 1,
  },
  providerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingPill: {
    backgroundColor: '#0c4309',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  ratingPillText: {
    color: '#FFF8E8',
    fontSize: 12,
    fontWeight: '600',
  },
  newBadge: {
    backgroundColor: 'rgba(12, 67, 9, 0.12)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  newBadgeText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '600',
  },
  providerSecondary: {
    marginLeft: 10,
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '500',
  },
  requestCardRight: {
    alignItems: 'flex-end',
  },
  bidValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0c4309',
    marginTop: 4,
    marginBottom: 8,
  },
  requestedTimeContainer: {
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  requestedTimeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0c4309',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  requestedTimeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0c4309',
    marginTop: 2,
    maxWidth: 160,
    textAlign: 'right',
  },
  selectButton: {
    backgroundColor: '#0c4309',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 100,
    alignItems: 'center',
    marginTop: 4,
  },
  selectButtonDisabled: {
    opacity: 0.6,
  },
  selectButtonText: {
    color: '#FFF8E8',
    fontSize: 14,
    fontWeight: '700',
  },
  backButton: {
    position: 'absolute',
    top: 58,
    left: 30,
    zIndex: 10,
  },
  backButtonIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
});
