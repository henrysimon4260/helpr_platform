import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../src/lib/supabase';

type ServiceFillRequestRow = {
  service_provider_id: string;
  bid: string | null;
};

type ServiceProviderRow = {
  service_provider_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type ProviderRequestDisplay = {
  service_provider_id: string;
  fullName: string;
  firstName: string;
  initials: string;
  bid: number;
  bidLabel: string;
  email: string | null;
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
      minimumFractionDigits: 2,
    }).format(safeValue);
  } catch (error) {
    return `$${safeValue.toFixed(2)}`;
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

  const fetchRequests = useCallback(async () => {
    if (!serviceId) {
      setError('Missing service reference.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: fillRows, error: fillError } = await supabase
        .from('service_fill_request')
        .select('service_provider_id, bid')
        .eq('service_id', serviceId);

      if (fillError) {
        throw fillError;
      }

      if (!fillRows || fillRows.length === 0) {
        setRequests([]);
        return;
      }

      const providerIds = Array.from(
        new Set(
          (fillRows as ServiceFillRequestRow[])
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
        .select('service_provider_id, first_name, last_name, email')
        .in('service_provider_id', providerIds);

      if (providerError) {
        throw providerError;
      }

      const providerMap = new Map<string, ServiceProviderRow>(
        (providerRows ?? []).map(row => [row.service_provider_id, row as ServiceProviderRow]),
      );

      const formatted: ProviderRequestDisplay[] = (fillRows as ServiceFillRequestRow[])
        .filter(row => row?.service_provider_id)
        .map(row => {
          const provider = providerMap.get(row.service_provider_id);
          const firstName = provider?.first_name?.trim() ?? '';
          const lastName = provider?.last_name?.trim() ?? '';
          const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unnamed Helpr';
          const initials = `${firstName.charAt(0) ?? ''}${lastName.charAt(0) ?? ''}`.toUpperCase() || 'H';
          const bid = parseBid(row.bid);

          return {
            service_provider_id: row.service_provider_id,
            fullName,
            firstName: firstName || fullName,
            initials,
            bid,
            bidLabel: formatPrice(bid),
            email: provider?.email ?? null,
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

        const { error: updateError } = await supabase
          .from('service')
          .update({
            service_provider_id: request.service_provider_id,
            status: 'confirmed',
            price: request.bid,
          })
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
          },
        });
      } catch (selectError) {
        console.error('Failed to select helpr:', selectError);
        Alert.alert('Unable to select Helpr', 'Please try again.');
        setSelectingProviderId(null);
      }
    },
    [serviceId],
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
      >
        {requests.map(request => {
          const isSelecting = selectingProviderId === request.service_provider_id;
          return (
            <View key={request.service_provider_id} style={styles.requestCard}>
              <View style={styles.requestCardLeft}>
                <View style={styles.profileCircle}>
                  <Text style={styles.profileInitials}>{request.initials}</Text>
                </View>
                <Text style={styles.providerName} numberOfLines={1}>
                  {request.firstName}
                </Text>
              </View>
              <View style={styles.requestCardRight}>
                <Text style={styles.bidHeadline}>Bid</Text>
                <Text style={styles.bidValue}>{request.bidLabel}</Text>
                <Pressable
                  style={[styles.selectButton, isSelecting ? styles.selectButtonDisabled : null]}
                  onPress={() => handleSelectProvider(request)}
                  disabled={isSelecting}
                >
                  <Text style={styles.selectButtonText}>{isSelecting ? 'Selecting…' : 'Select'}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#0c4309" />
      <Pressable style={styles.backButton} onPress={() => router.push('/booked-services')}>
        <Image
          source={require('../assets/icons/backButton.png')}
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
    padding: 20,
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
    paddingBottom: 40,
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
  },
  requestCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5DCC9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileInitials: {
    color: '#0c4309',
    fontSize: 18,
    fontWeight: '700',
  },
  providerName: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  requestCardRight: {
    alignItems: 'flex-end',
  },
  bidHeadline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0c4309',
    marginBottom: 2,
  },
  bidValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 10,
  },
  selectButton: {
    backgroundColor: '#0c4309',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 100,
    alignItems: 'center',
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
