import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  autofill_type?: string | null;
};

export default function PastServices() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [servicesLoading, setServicesLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const initialLoadRef = useRef(true);

  const fetchServices = useCallback(async () => {
    if (authLoading) return;
    if (!user?.email) {
      setServices([]);
      setServicesLoading(false);
      initialLoadRef.current = false;
      return;
    }

    if (initialLoadRef.current) setServicesLoading(true);
    setServicesError(null);

    try {
      const { data: customer } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('email', user.email)
        .maybeSingle();

      if (!customer) {
        setServices([]);
        return;
      }

      const { data: serviceData } = await supabase
        .from('service')
        .select('*')
        .eq('customer_id', customer.customer_id)
        .eq('status', 'completed')
        .order('date_of_creation', { ascending: false });

      setServices(serviceData ?? []);
    } catch (error) {
      setServicesError('Unable to load your past services.');
    } finally {
      setServicesLoading(false);
      initialLoadRef.current = false;
    }
  }, [authLoading, user]);

  useFocusEffect(useCallback(() => { if (!authLoading) fetchServices(); }, [authLoading, fetchServices]));
  useEffect(() => { if (!authLoading) fetchServices(); }, [authLoading, fetchServices]);

  const formatServiceType = useCallback((serviceType?: string | null) => {
    if (!serviceType) return 'Service';
    return serviceType.charAt(0).toUpperCase() + serviceType.slice(1).toLowerCase();
  }, []);

  const getPrimaryLocation = useCallback((service: ServiceRow) => {
    const start = service.start_location?.trim();
    if (start && start.length > 0) return start;
    const fallback = service.location?.trim();
    if (fallback && fallback.length > 0) return fallback;
    return 'Location not specified';
  }, []);

  const getShortLocation = useCallback((service: ServiceRow) => {
    const location = getPrimaryLocation(service);
    if (location.length <= 25) return location;
    return `${location.slice(0, 25)}…`;
  }, [getPrimaryLocation]);

  const formatPrice = useCallback((price?: number | null) => {
    if (typeof price === 'number' && Number.isFinite(price)) {
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(price);
      } catch (error) {
        return `$${Math.round(price)}`;
      }
    }
    return '$0';
  }, []);

  const formatCompletionDate = useCallback((isoDate?: string | null) => {
    if (!isoDate) return 'Completed';
    try {
      const date = new Date(isoDate);
      if (Number.isNaN(date.getTime())) return 'Completed';
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (error) {
      return 'Completed';
    }
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Pressable style={styles.backButton} onPress={() => router.push('/landing')}>
        <Image source={require('../assets/icons/backButton.png')} style={styles.backButtonIcon} />
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.title}>Past Services</Text>
      </View>
      <View style={styles.GreenHeaderBar} />
      <View style={styles.contentContainer}>
        {servicesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0c4309" />
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
            {services.map((service) => (
              <View key={service.service_id} style={styles.serviceCard}>
                <View style={styles.cardContentRow}>
                  <View style={styles.cardInfoColumn}>
                    <View style={styles.serviceTypePill}>
                      <Text style={styles.serviceTypeText} numberOfLines={1}>
                        {formatServiceType(service.service_type)}
                      </Text>
                    </View>
                    <View style={styles.completedStatusPill}>
                      <Text style={styles.completedStatusText}>Completed</Text>
                    </View>
                    <View style={styles.cardActionRow}>
                      <View style={styles.locationGroup}>
                        <Image
                          source={require('../assets/icons/ConfirmLocationIcon.png')}
                          style={styles.locationIcon}
                        />
                        <Text style={styles.locationText} numberOfLines={1}>
                          {getShortLocation(service)}
                        </Text>
                      </View>
                      {service.autofill_type && (
                        <View style={styles.autofillPill}>
                          <Text style={styles.autofillText}>
                            {service.autofill_type === 'AutoFill' ? 'AutoFill' : 'Custom'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.dateText}>
                      {formatCompletionDate(service.date_of_creation)}
                    </Text>
                  </View>
                  <View style={styles.buttonColumn}>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceValue}>{formatPrice(service.price)}</Text>
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
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#E5DCC9' 
  },
  header: { 
    backgroundColor: '#FFF8E8', 
    padding: 15, 
    paddingTop: 70, 
    alignItems: 'center' 
  },
  title: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#0c4309' 
  },
  GreenHeaderBar: { 
    backgroundColor: '#0c4309', 
    height: 30 
  },
  contentContainer: { 
    flex: 1, 
    paddingHorizontal: 16, 
    paddingTop: 24 
  },
  loadingContainer: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  noServicesContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  noServicesText: { 
    fontSize: 16, 
    color: '#666' 
  },
  serviceList: { 
    flex: 1 
  },
  serviceListContent: {
    paddingTop: 4,
    paddingBottom: 120,
    flexGrow: 1,
  },
  serviceCard: { 
    backgroundColor: '#F5E7D0', 
    borderRadius: 14, 
    paddingHorizontal: 20,
    paddingVertical: 15, // Consistent vertical padding
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    minHeight: 140, // Ensure consistent minimum height for all cards
  },
  cardContentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    flex: 1, // Make sure content fills the card properly
  },
  cardInfoColumn: {
    flex: 1,
    paddingRight: 16,
    justifyContent: 'space-between', // Distribute content evenly
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
  completedStatusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#0c4309',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 4,
    minHeight: 20,
    marginTop: 6,
    marginBottom: 8,
  },
  completedStatusText: {
    color: '#FFF8E8',
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginTop: 4,
    marginBottom: 4,
    gap: 8, // Reduced space between location and autofill pill
  },
  locationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autofillPill: {
    backgroundColor: '#E5DCC9',
    borderColor: '#C0B9A6',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  autofillText: {
    color: '#0c4309',
    fontSize: 10,
    fontWeight: '600',
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
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
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
    zIndex: 10 
  },
  backButtonIcon: { 
    width: 40, 
    height: 40 
  },
});
