import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/contexts/AuthContext';

type ServiceRow = {
  service_id: string;
  customer_id?: string;
  service_type?: string | null;
  status?: string | null;
  scheduling_type?: string | null;
  scheduled_date_time?: string | null;
  date_of_creation?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  location?: string | null;
  price?: number | null;
  description?: string | null;
  service_provider_id?: string | null;
};

export default function PastServices() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [servicesLoading, setServicesLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceRow | null>(null);
  const initialLoadRef = useRef(true);

  const fetchServices = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!user || !user.email) {
      setServices([]);
      setSelectedService(null);
      setServicesLoading(false);
      initialLoadRef.current = false;
      return;
    }

    if (initialLoadRef.current) {
      setServicesLoading(true);
    }
    setServicesError(null);

    try {
      const { data: authUser, error: userError } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!authUser?.user?.id) {
        throw new Error('No authenticated user found');
      }

      const providerId = authUser.user.id;

      // Query only completed services for this provider
      const { data: serviceData, error: serviceError } = await supabase
        .from('service')
        .select('*')
        .eq('service_provider_id', providerId)
        .eq('status', 'completed')
        .order('date_of_creation', { ascending: false });

      if (serviceError) {
        throw serviceError;
      }

      const visibleServices = (serviceData ?? [])
        .filter((service): service is ServiceRow => Boolean(service?.service_id));

      setServices(visibleServices);

      if (visibleServices.length > 0 && !selectedService) {
        setSelectedService(visibleServices[0]);
      }
    } catch (error) {
      console.error('Failed to load past services:', error);
      setServicesError('Unable to load your past services right now.');
      setSelectedService(null);
    } finally {
      setServicesLoading(false);
      initialLoadRef.current = false;
    }
  }, [authLoading, user, selectedService]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        fetchServices();
      }
    }, [authLoading, fetchServices]),
  );

  useEffect(() => {
    if (!authLoading) {
      fetchServices();
    }
  }, [authLoading, fetchServices]);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const formatServiceType = useCallback((serviceType?: string | null) => {
    if (!serviceType) {
      return 'Service';
    }
    return serviceType.charAt(0).toUpperCase() + serviceType.slice(1).toLowerCase();
  }, []);

  const getPrimaryLocation = useCallback((service: ServiceRow) => {
    const start = service.start_location?.trim();
    if (start && start.length > 0) {
      return start;
    }
    const fallback = service.location?.trim();
    if (fallback && fallback.length > 0) {
      return fallback;
    }
    return 'Location not specified';
  }, []);

  const getShortLocation = useCallback(
    (service: ServiceRow) => {
      const location = getPrimaryLocation(service);
      if (location.length <= 15) {
        return location;
      }
      return `${location.slice(0, 15)}…`;
    },
    [getPrimaryLocation],
  );

  const formatPrice = useCallback((price?: number | null) => {
    if (typeof price === 'number' && Number.isFinite(price)) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(price);
    }
    return '$0';
  }, []);

  const formatDate = useCallback((isoDate?: string | null) => {
    if (!isoDate) {
      return 'Date not specified';
    }
    try {
      const date = new Date(isoDate);
      if (Number.isNaN(date.getTime())) {
        return 'Date not specified';
      }
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (error) {
      return 'Date not specified';
    }
  }, []);

  const renderServiceCard = (service: ServiceRow) => {
    const isSelected = selectedService?.service_id === service.service_id;
    const shortLocation = getShortLocation(service);
    const priceLabel = formatPrice(service.price);
    const dateLabel = formatDate(service.date_of_creation);

    return (
      <Pressable
        key={service.service_id}
        style={[
          styles.serviceCard,
          isSelected ? styles.serviceCardSelected : null,
        ]}
        onPress={() => setSelectedService(service)}
      >
        <View style={styles.cardContentRow}>
          <View style={styles.cardInfoColumn}>
            <View style={styles.serviceTypePill}>
              <Text style={styles.serviceTypeText} numberOfLines={1}>
                {formatServiceType(service.service_type)}
              </Text>
            </View>
            <View style={styles.completedPill}>
              <Text style={styles.completedPillText}>Completed</Text>
            </View>
            <View style={styles.cardActionRow}>
              <View style={styles.locationGroup}>
                <Image
                  source={require('../assets/icons/ConfirmLocationIcon.png')}
                  style={styles.locationIcon}
                />
                <Text style={styles.locationText} numberOfLines={1}>
                  {shortLocation}
                </Text>
              </View>
            </View>
            <Text style={styles.dateText}>{dateLabel}</Text>
          </View>
          <View style={styles.buttonColumn}>
            <View style={styles.priceRow}>
              <Text style={styles.priceValue}>{priceLabel}</Text>
            </View>
            <Pressable
              style={styles.showDetailsButton}
              onPress={() => router.push({
                pathname: '/ServiceDetails' as any,
                params: { serviceId: service.service_id }
              })}
            >
              <Text style={styles.showDetailsButtonText}>Service Details</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#0c4309" />
      
      {/* Back Button */}
      <Pressable style={styles.backButton} onPress={() => router.push('/landing')}>
        <Image 
          source={require('../assets/icons/backButton.png')} 
          style={styles.backButtonIcon} 
        />
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Past Services</Text>
      </View>
      <View style={styles.GreenHeaderBar} />
      
      <View style={styles.contentContainer}>
        {servicesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0c4309" />
            <Text style={styles.loadingText}>Loading your past services…</Text>
          </View>
        ) : servicesError ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>{servicesError}</Text>
            <Pressable style={styles.retryButton} onPress={fetchServices}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : services.length === 0 ? (
          <View style={styles.noServicesContainer}>
            <Text style={styles.noServicesText}>No past services yet</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.serviceList}
            contentContainerStyle={styles.serviceListContent}
            showsVerticalScrollIndicator={false}
          >
            {services.map(renderServiceCard)}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

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
  contentContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
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
  noServicesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noServicesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    textAlign: 'center',
  },
  serviceList: {
    flex: 1,
  },
  serviceListContent: {
    paddingTop: 4,
    paddingBottom: 20,
  },
  serviceCard: {
    backgroundColor: '#F5E7D0',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  serviceCardSelected: {
    backgroundColor: '#F5E7D0',
    shadowOpacity: 0.16,
    elevation: 5,
  },
  serviceTypePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5DCC9',
    borderColor: '#C0B9A6',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 4,
  },
  serviceTypeText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  completedPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#0c4309',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 4,
    marginTop: 6,
    marginBottom: 8,
  },
  completedPillText: {
    color: '#FFF8E8',
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cardContentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    marginTop: 6,
  },
  cardInfoColumn: {
    flex: 1,
    paddingRight: 16,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    marginRight: 2,
  },
  locationText: {
    color: '#0c4309',
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  dateText: {
    color: '#666',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
  buttonColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 100,
    paddingLeft: 16,
  },
  priceColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 80,
    paddingLeft: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  priceValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0c4309',
  },
  showDetailsButton: {
    width: '100%',
    paddingVertical: 10,
    backgroundColor: '#FFF8E8',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C0B9A6',
  },
  showDetailsButtonText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#0c4309',
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
