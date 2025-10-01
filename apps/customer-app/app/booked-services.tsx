import { View, Text, Modal, StyleSheet, Pressable, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  start_datetime?: string | null;
  end_datetime?: string | null;
  payment_method_type?: string | null;
  autofill_type?: string | null;
};

const EDIT_REQUEST_ICON_XML = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25Z" fill="#0c4309"/>
  <path d="M20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z" fill="#0c4309"/>
</svg>
`;

export default function BookedServices() {
  const params = useLocalSearchParams();
  const showOverlay = params.showOverlay === 'true';
  const serviceIdParam = params.serviceId;
  const serviceId = useMemo(() => {
    if (!serviceIdParam) {
      return null;
    }
    return Array.isArray(serviceIdParam) ? serviceIdParam[0] : serviceIdParam;
  }, [serviceIdParam]);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [selectProModalVisible, setSelectProModalVisible] = useState(false);
  const { user, loading: authLoading } = useAuth();

  // Custom date picker state
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [servicesLoading, setServicesLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceRow | null>(null);

  useEffect(() => {
    if (showOverlay) {
      setOverlayVisible(true);
    }
  }, [showOverlay]);

  const closeOverlay = useCallback(() => {
    setOverlayVisible(false);
  }, []);

  // Generate date options
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  
  // Flexible time slots (30-minute intervals from 8 AM to 8 PM)
  const timeSlots = [];
  for (let hour = 8; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const period = hour < 12 ? 'AM' : 'PM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const timeString = `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
      timeSlots.push(timeString);
    }
  }
  
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('9:00 AM');

  const fetchServices = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!user || !user.email) {
      setServices([]);
      setSelectedService(null);
      setServicesLoading(false);
      return;
    }

    setServicesLoading(true);
    setServicesError(null);

    try {
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('email', user.email)
        .maybeSingle();

      if (customerError) {
        throw customerError;
      }

      if (!customer) {
        setServices([]);
        setSelectedService(null);
        return;
      }

      const { data: serviceData, error: serviceError } = await supabase
        .from('service')
        .select('*')
        .eq('customer_id', customer.customer_id)
        .order('date_of_creation', { ascending: false });

      if (serviceError) {
        throw serviceError;
      }

      setServices(serviceData ?? []);
    } catch (error) {
      console.error('Failed to load services:', error);
      setServicesError('Unable to load your services right now.');
      setSelectedService(null);
    } finally {
      setServicesLoading(false);
    }
  }, [authLoading, user]);

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

  useEffect(() => {
    if (services.length === 0) {
      setSelectedService(null);
      return;
    }

    if (serviceId) {
      const match = services.find(service => service.service_id === serviceId);
      if (match) {
        setSelectedService(match);
        return;
      }
    }

    setSelectedService(prev => {
      if (prev) {
        const stillExists = services.find(service => service.service_id === prev.service_id);
        if (stillExists) {
          return stillExists;
        }
      }
      return services[0];
    });
  }, [serviceId, services]);

  const parseScheduledDate = useCallback((isoDate?: string | null) => {
    if (!isoDate) {
      return null;
    }

    try {
      return new Date(isoDate);
    } catch (error) {
      console.warn('Failed to parse scheduled date:', error);
      return null;
    }
  }, []);

  const formatHumanDate = useCallback((date: Date | null) => {
    if (!date) {
      return null;
    }

    const today = new Date();
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();

    if (isToday) {
      return 'Today';
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, []);
  const formatStatusLabel = useCallback((status?: string | null) => {
    if (!status) {
      return 'Finding Pros';
    }

    const normalized = status.toLowerCase();
    if (normalized === 'cancelled') {
      return 'Cancelled';
    }

    return 'Finding Pros';
  }, []);

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

    return 'Add location';
  }, []);

  const getShortLocation = useCallback(
    (service: ServiceRow) => {
      const location = getPrimaryLocation(service);
      if (location.length <= 10) {
        return location;
      }
      return `${location.slice(0, 10)}…`;
    },
    [getPrimaryLocation],
  );

  const formatPrice = useCallback((price?: number | null) => {
    if (typeof price === 'number' && Number.isFinite(price)) {
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
        }).format(price);
      } catch (error) {
        console.warn('Price formatting fallback triggered:', error);
        return `$${price.toFixed(2)}`;
      }
    }
    return '$0.00';
  }, []);

  const cancelService = useCallback(
    async (serviceIdToCancel: string) => {
      try {
        const { error } = await supabase
          .from('service')
          .update({ status: 'cancelled' })
          .eq('service_id', serviceIdToCancel);

        if (error) {
          throw error;
        }

        await fetchServices();
      } catch (error) {
        console.error('Failed to cancel service:', error);
        Alert.alert('Cancel failed', 'Unable to cancel this service right now.');
      }
    },
    [fetchServices],
  );

  const handleCancelService = useCallback(
    (service: ServiceRow) => {
      Alert.alert(
        'Cancel request?',
        'Are you sure you want to cancel this service?',
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Cancel service',
            style: 'destructive',
            onPress: () => cancelService(service.service_id),
          },
        ],
      );
    },
    [cancelService],
  );

  const updateServiceRow = useCallback(
    async (changes: Record<string, unknown>) => {
      if (!serviceId) {
        Alert.alert('Missing request', 'Unable to find the service you are scheduling. Please restart the request.');
        return false;
      }

      try {
        const { error } = await supabase
          .from('service')
          .update(changes)
          .eq('service_id', serviceId);

        if (error) {
          throw error;
        }

        return true;
      } catch (error) {
        console.error('Failed to update service scheduling:', error);
        Alert.alert('Scheduling failed', 'Unable to update your service. Please try again.');
        return false;
      }
    },
    [serviceId],
  );

  const handleScheduleAsap = useCallback(async () => {
    const success = await updateServiceRow({
      scheduling_type: 'asap',
      scheduled_date_time: new Date().toISOString(),
      status: 'scheduled',
    });

    if (success) {
      await fetchServices();
      closeOverlay();
    }
  }, [closeOverlay, fetchServices, updateServiceRow]);

  const isDateInPast = (day: number) => {
    const today = new Date();
    const checkDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    return checkDate < today && !isSameDay(checkDate, today);
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  const handleDateSelect = (day: number) => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    setSelectedDate(newDate);
  };

  const handleConfirm = useCallback(async () => {
    const finalDateTime = new Date(selectedDate);
    
    // Parse the selected time slot (e.g., "2:30 PM")
    const [time, period] = selectedTimeSlot.split(' ');
    const [hourStr, minuteStr] = time.split(':');
    let hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    
    // Convert to 24-hour format
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    finalDateTime.setHours(hour, minute, 0, 0);
    
    const success = await updateServiceRow({
      scheduling_type: 'scheduled',
      scheduled_date_time: finalDateTime.toISOString(),
      status: 'scheduled',
    });

    if (success) {
      await fetchServices();
      setPickerVisible(false);
      setOverlayVisible(false);
    }
  }, [fetchServices, selectedDate, selectedTimeSlot, updateServiceRow]);

  const selectedScheduledDate = useMemo(() => {
    if (!selectedService) {
      return null;
    }
    return parseScheduledDate(selectedService.scheduled_date_time ?? null);
  }, [parseScheduledDate, selectedService]);

  const dateBannerText = useMemo(() => {
    if (!selectedService) {
      return null;
    }

    const formatted = formatHumanDate(selectedScheduledDate);
    return formatted;
  }, [formatHumanDate, selectedScheduledDate, selectedService]);

  const shouldShowDateBanner = selectedService?.scheduling_type !== 'asap' && Boolean(dateBannerText);

  const shouldShowAsapBanner = useMemo(() => {
    if (!selectedService) {
      return false;
    }

    return selectedService.scheduling_type === 'asap';
  }, [selectedService]);

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
      
      {/* Main content */}
      <View style={styles.header}>
        <Text style={styles.title}>Booked Services</Text>
      </View>
      <View style={styles.GreenHeaderBar}>
      </View>
      <View style={styles.contentContainer}>
        {servicesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0c4309" />
            <Text style={styles.loadingText}>Loading your services…</Text>
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
            <Pressable style={styles.selectProButton} onPress={() => setSelectProModalVisible(true)}>
              <Text style={styles.noServicesText}>No Services Booked</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            style={styles.serviceList}
            contentContainerStyle={styles.serviceListContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.bannerStack}>
              {shouldShowDateBanner ? (
                <View style={styles.primaryBannerContainer}>
                  <Text style={styles.primaryBannerText}>{dateBannerText}</Text>
                </View>
              ) : null}
              {shouldShowAsapBanner ? (
                <View style={styles.primaryBannerContainer}>
                  <Text style={styles.primaryBannerText}>ASAP</Text>
                </View>
              ) : null}
            </View>
            {services.map(service => {
              const isSelected = selectedService?.service_id === service.service_id;
              const statusLabel = formatStatusLabel(service.status);
              const shortLocation = getShortLocation(service);
              const priceLabel = formatPrice(service.price);

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
                      <View style={styles.serviceStatusPill}>
                        <Text style={styles.serviceStatusText} numberOfLines={1}>
                          {statusLabel}
                        </Text>
                      </View>
                      <View style={styles.cardActionRow}>
                        <View style={styles.editRequestGroup}>
                          <View style={styles.editRequestIconWrapper}>
                            <SvgXml xml={EDIT_REQUEST_ICON_XML} width={16} height={16} />
                          </View>
                          <Text style={styles.editRequestText}>Edit Request</Text>
                        </View>
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
                    </View>
                    <View style={styles.priceColumn}>
                      <View style={styles.priceRow}>
                        <Text style={styles.priceValue}>{priceLabel}</Text>
                        <Text style={styles.priceEstimate}>est.</Text>
                      </View>
                      <Pressable style={styles.serviceCancelButton} onPress={() => handleCancelService(service)}>
                        <Text style={styles.serviceCancelButtonText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Overlay Modal */}
      <Modal
        visible={overlayVisible}
        transparent
        animationType="fade"
        onRequestClose={closeOverlay}
        style={{ zIndex: 1000 }}
      >
        <View style={styles.overlayBackground}>
          <View style={styles.overlayPopup}>
            <View style={styles.popupHeader}>
              <Text style={styles.selectADateTitle}>Schedule Your Service</Text>
            </View>
            <View style={styles.scheduleOptions}>
              <View style={styles.popupActions}>
                <Pressable style={styles.primaryButton} onPress={handleScheduleAsap}>
                  <Text style={styles.primaryButtonText}>ASAP</Text>
                  <Text style={styles.primaryButtonSubText}>Get a Helpr as soon as possible</Text>
                </Pressable>
              </View>
              
              {/* Divider with "or" */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              
              <View style={styles.popupActions}>
                <Pressable style={styles.secondaryButton} onPress={() => {
                  
                  setOverlayVisible(false); // Close overlay first
                  setTimeout(() => setPickerVisible(true), 100); // Then open date picker
                  
                }}>
                  <Text style={styles.secondaryButtonText} numberOfLines={2}>Select{'\n'}Date & Time</Text>
                </Pressable>
              </View>
            </View>
            
            {/* Back to Service Details Button */}
            <View style={styles.backToServiceContainer}>
              <Pressable 
                style={styles.backToServiceButton}
                onPress={() => {
                  setOverlayVisible(false);
                  router.back();
                }}
              >
                <Text style={styles.backToServiceText}>Back to Service Details</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Date Picker Modal */}
      <Modal
        visible={isPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setPickerVisible(false);
          setTimeout(() => setOverlayVisible(true), 100);
        }}
        style={{ zIndex: 10000 }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#FFF8E8', padding: 20, borderRadius: 20, width: '90%', maxHeight: '85%' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#0c4309', textAlign: 'center', marginBottom: 0, marginTop: 0}}>Select a Date</Text>
            
            {/* Month Navigation */}
            <View style={{ marginBottom: 0, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Pressable 
                  style={{
                    padding: 15,
                    backgroundColor: '#FFF8E8',
                    borderRadius: 25,
                    marginRight: 0,
                    minWidth: 45,
                    minHeight: 45,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                  onPress={() => {
                    const newDate = new Date(selectedDate);
                    newDate.setMonth(selectedDate.getMonth() - 1);
                    setSelectedDate(newDate);
                  }}
                >
                  <Text style={{ color: '#0c4309', fontSize: 24, fontWeight: 'bold' }}>‹</Text>
                </Pressable>
                <View style={styles.monthYearContainer}>
                  <Text style={{ 
                    fontSize: 18, 
                    fontWeight: 'bold', 
                    color: '#0c4309',
                    minWidth: 120,
                    textAlign: 'center',
                    marginTop: 3,
                  }}>
                    {months[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                  </Text>
                </View>
                <Pressable 
                  style={{
                    padding: 15,
                    backgroundColor: '#FFF8E8',
                    borderRadius: 25,
                    marginLeft: 0,
                    minWidth: 45,
                    minHeight: 45,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                  onPress={() => {
                    const newDate = new Date(selectedDate);
                    newDate.setMonth(selectedDate.getMonth() + 1);
                    setSelectedDate(newDate);
                  }}
                >
                  <Text style={{ color: '#0c4309', fontSize: 24, fontWeight: 'bold' }}>›</Text>
                </Pressable>
              </View>
            </View>

            {/* Day Selection */}
            <View style={{ marginBottom: 5 }}>
              <View style={styles.calendarContainer}>
                <View style={{ alignItems: 'flex-start', marginBottom: 0 }}>
                  {Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => (
                    <View key={weekIndex} style={{ flexDirection: 'row', marginBottom: 5 }}>
                      {days.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day) => {
                        const isPast = isDateInPast(day);
                        const isSelected = selectedDate.getDate() === day;
                        
                        return (
                          <Pressable
                            key={day}
                            style={{
                              width: 35,
                              height: 35,
                              justifyContent: 'center',
                              alignItems: 'center',
                              margin: 2,
                              backgroundColor: isSelected ? '#0c4309' : isPast ? '#f0f0f0' : '#E5DCC9',
                              borderRadius: 17.5,
                              opacity: isPast ? 0.5 : 1
                            }}
                            onPress={() => !isPast && handleDateSelect(day)}
                            disabled={isPast}
                          >
                            <Text style={{ 
                              color: isSelected ? 'white' : isPast ? '#999' : '#0c4309', 
                              fontSize: 16, 
                              fontWeight: 'bold' 
                            }}>
                              {day}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>  
            </View>

            {/* Time Selection */}
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.selectATimeTitle}>Select a Time</Text>
              <ScrollView
                style={styles.timeSlotList}
                contentContainerStyle={styles.timeSlotListContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {timeSlots.map((timeSlot) => (
                  <Pressable
                    key={timeSlot}
                    style={{
                      padding: 10,
                      marginVertical: 2,
                      backgroundColor: selectedTimeSlot === timeSlot ? '#0c4309' : '#E5DCC9',
                      borderRadius: 8,
                      alignItems: 'center'
                    }}
                    onPress={() => setSelectedTimeSlot(timeSlot)}
                  >
                    <Text style={{ 
                      color: selectedTimeSlot === timeSlot ? 'white' : '#0c4309', 
                      fontSize: 16,
                      fontWeight: selectedTimeSlot === timeSlot ? 'bold' : 'normal'
                    }}>
                      {timeSlot}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Selected Date/Time Display */}
            <View style={{ backgroundColor: '#E5DCC9', padding: 15, borderRadius: 10, marginBottom: 20 }}>
              <Text style={{ textAlign: 'center', color: '#0c4309', fontSize: 16, fontWeight: 'bold' }}>
                {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} at {selectedTimeSlot}
              </Text>
            </View>

            {/* Cancel and Confirm Buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable 
                onPress={() => {
                  setPickerVisible(false);
                  setTimeout(() => setOverlayVisible(true), 100);
                }} 
                style={{ backgroundColor: '#E5DCC9', padding: 15, borderRadius: 8, flex: 1, alignItems: 'center', marginRight: 10 }}
              >
                <Text style={{ color: '#0c4309', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              
              <Pressable 
                onPress={handleConfirm} 
                style={{ backgroundColor: '#0c4309', padding: 15, borderRadius: 8, flex: 1, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Select a Pro Modal */}
      <Modal
        visible={selectProModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectProModalVisible(false)}
      >
        <View style={styles.overlayBackground}>
          <View style={styles.selectProModal}>
            <Text style={styles.selectProTitle}>Select a Pro</Text>
            <View style={styles.DividerContainer1}>
              <View style={styles.DividerLine1} />
            </View>
            <Text style={styles.selectProMessage}>
              Workers are available to fill your request!{'\n'}Select a pro when you&apos;re ready.
            </Text>
            <Pressable 
              style={styles.selectProOkButton} 
              onPress={() => {
                setSelectProModalVisible(false);
                router.push('/selecthelpr');
              }}
            >
              <Text style={styles.selectProOkText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    paddingTop: 70, // Account for status bar
    justifyContent: 'center',
    alignItems: 'center',
  },
  noServicesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noServicesText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666666',
    textAlign: 'center',
    paddingBottom: 100,
  },
  scrollViewContent: {
    height: '100%',
    paddingBottom: 60, // Account for footer
    color: '#0c4309',
  },
  footer: {
    backgroundColor: '#FFF8E8',
    padding: 15,
    paddingBottom: 60, // Account for status bar
    justifyContent: 'center',
    alignItems: 'center',
    height: 100,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0c4309',
    paddingTop: 10,
    
  },
  GreenHeaderBar:{
    backgroundColor: '#0c4309',
    height:30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayBadge: {
    backgroundColor: '#FFF8E8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  todayText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timeSlotList: {
    maxHeight: 180,
  },
  timeSlotListContent: {
    paddingBottom: 8,
  },
  WhiteHeaderText:{
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 16,
    color: '#49454F',
    textAlign: 'center',
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
  bannerStack: {
    marginBottom: 16,
  },
  primaryBannerContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C0B9A6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryBannerText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  serviceList: {
    flex: 1,
  },
  serviceListContent: {
    paddingTop: 4,
    paddingBottom: 120,
  },
  serviceCard: {
    backgroundColor: '#FFF8E8',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginBottom: 4,
  },
  serviceTypeText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  serviceStatusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#A3926D',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 5,
    marginTop: 6,
    marginBottom: 8,
  },
  serviceStatusText: {
    color: '#FFF8E8',
    fontSize: 12,
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
    flexWrap: 'nowrap',
    marginTop: 6,
  },
  editRequestGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
    marginBottom: 0,
  },
  editRequestIconWrapper: {
    marginRight: 3,
  },
  editRequestText: {
    color: '#0c4309',
    fontSize: 11,
    fontWeight: '600',
  },
  locationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    marginLeft: 6,
  },
  locationIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    marginRight: 4,
  },
  locationText: {
    color: '#0c4309',
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  priceColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 110,
    paddingLeft: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  priceValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0c4309',
    marginRight: 4,
  },
  priceEstimate: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0c4309',
    marginBottom: 4,
  },
  serviceCancelButton: {
    marginTop: 10,
    backgroundColor: '#C94736',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  serviceCancelButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  overlayBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Dimmed background
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayPopup: {
    width: '85%',
    backgroundColor: '#FFF8E8', // Matching app's background
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center', // Center content vertically within popup
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    // Android shadow
    elevation: 10,
  },
  popupHeader: {
    alignItems: 'center',
    justifyContent: 'center', // Center header content
    marginBottom: 16,
    width: '100%', // Ensure full width for centering
  },
  popupIcon: {
    width: 48,
    height: 48,
    marginBottom: 5,
  },
  selectADateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0c4309',
    textAlign: 'center',
  },
  selectATimeTitle: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: 'bold',
    color: '#0c4309',
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 16,
    color: '#49454F',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  monthYearContainer: {
    width: 150,
  },
  calendarContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    // borderColor: 'red',
    // borderWidth: 1,
  },
  popupDetails: {
    width: '100%',
    backgroundColor: '#E5DCC9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  detailText: {
    fontSize: 14,
    color: '#0c4309',
    marginBottom: 8,
  },
  scheduleOptions:{
    flexDirection: 'row',
    justifyContent: 'center', // Center the entire button group
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 10, // Add some padding for better spacing
  },
  popupActions: {
    width: '45%', // Adjust width for better centering
    marginHorizontal: 5, // Add small margin between buttons
  },
  dividerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#0c4309',
    width: 20,
    marginVertical: 5,
  },
  orText: {
    fontSize: 14,
    color: '#0c4309',
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 14, // Slightly increased for more rounded look
    height: 114, // Increased by 4px for taller buttons
    paddingVertical: 0, // Remove vertical padding since height is fixed
    paddingHorizontal: 16, // Reduced by 4px to make buttons appear wider
    alignItems: 'center',
    justifyContent: 'center', // Center text vertically
    width: '100%', // Fill container width
  },
  primaryButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  primaryButtonSubText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 14, // Slightly increased for more rounded look
    height: 114, // Increased by 4px for taller buttons
    paddingVertical: 0, // Remove vertical padding
    paddingHorizontal: 14, // Reduced by 4px to make buttons appear wider
    alignItems: 'center',
    justifyContent: 'center', // Center text vertically
    width: '100%', // Fill container width
  },
  secondaryButtonText: {
    color: '#0c4309',
    fontSize: 14, // Reduced from 16 to better fit the button
    fontWeight: '600',
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 58, // Moved up to align with header text
    left: 30,
    zIndex: 10,
  },
  backButtonIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  pickerBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    width: '90%',
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 20,
  },
  dateSection: {
    marginBottom: 20,
  },
  dropdownRow: {
    marginBottom: 10,
  },
  dropdownItem: {
    padding: 10,
    marginHorizontal: 5,
    backgroundColor: '#E5DCC9',
    borderRadius: 8,
  },
  selectedItem: {
    backgroundColor: '#0c4309',
  },
  dropdownText: {
    color: '#0c4309',
    fontSize: 16,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dayItem: {
    width: 35,
    height: 35,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
    backgroundColor: '#E5DCC9',
    borderRadius: 17.5,
  },
  selectedDay: {
    backgroundColor: '#0c4309',
  },
  dayText: {
    color: '#0c4309',
    fontSize: 16,
  },
  timeSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 16,
    color: '#0c4309',
    marginBottom: 10,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeScroll: {
    height: 100,
  },
  timeItem: {
    padding: 10,
    marginVertical: 2,
    backgroundColor: '#E5DCC9',
    borderRadius: 8,
    alignItems: 'center',
  },
  selectedTime: {
    backgroundColor: '#0c4309',
  },
  timeText: {
    color: '#0c4309',
    fontSize: 16,
  },
  colon: {
    fontSize: 24,
    color: '#0c4309',
    marginHorizontal: 10,
  },
  pickerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#E5DCC9',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#0c4309',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectProButton: {
    // No additional styling needed, inherits from container
  },
  selectProModal: {
    width: '75%',
    backgroundColor: '#FFF8E8',
    borderRadius: 30,
    paddingTop: 10,
    paddingBottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  DividerContainer1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
    marginBottom: 10,
    width: '100%', // Ensure full width
  },
  DividerLine1: {
    flex: 1, // Take up available space instead of fixed width
    height: 2,
    backgroundColor: '#bfbebcff',
    maxWidth: 350, // Optional: limit max width for better appearance
  },
  selectProTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  selectProMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    padding: 10,
  },
  selectProOkButton: {
    backgroundColor: '#0c4309',   
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 80,
    minWidth: 80,
  },
  selectProOkText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  backToServiceContainer: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  backToServiceButton: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backToServiceText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
