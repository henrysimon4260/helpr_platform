import { View, Text, Modal, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator, GestureResponderEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/contexts/AuthContext';
import { useModal } from '../src/contexts/ModalContext';
import { hasShownSelectProModal, markSelectProModalShown, resetSelectProModalTracker } from '../src/lib/selectProModalTracker';

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
  description?: string | null;
  service_provider_id?: string | null;
};

type ServiceProviderProfile = {
  service_provider_id: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
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
  const showConfirmedModal = params.showConfirmedModal === 'true';
  const helprFirstNameParam = params.helprFirstName;
  const helprFirstName = useMemo(() => {
    if (!helprFirstNameParam) {
      return null;
    }
    return Array.isArray(helprFirstNameParam) ? helprFirstNameParam[0] : helprFirstNameParam;
  }, [helprFirstNameParam]);
  const serviceIdParam = params.serviceId;
  const temporaryServiceParam = params.temporaryService;
  const serviceId = useMemo(() => {
    if (!serviceIdParam) {
      return null;
    }
    return Array.isArray(serviceIdParam) ? serviceIdParam[0] : serviceIdParam;
  }, [serviceIdParam]);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [selectProModalVisible, setSelectProModalVisible] = useState(false);
  const [confirmationModalVisible, setConfirmationModalVisible] = useState(false);
  const [confirmationModalType, setConfirmationModalType] = useState<'finding_pros' | 'confirmed'>('finding_pros');
  const [confirmedHelprName, setConfirmedHelprName] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { showModal } = useModal();
  const isFocused = useIsFocused();

  // Parse temporary service data
  const temporaryService = useMemo(() => {
    if (!temporaryServiceParam) {
      return null;
    }
    const param = Array.isArray(temporaryServiceParam) ? temporaryServiceParam[0] : temporaryServiceParam;
    try {
      return JSON.parse(decodeURIComponent(param));
    } catch (error) {
      console.error('Failed to parse temporary service data:', error);
      return null;
    }
  }, [temporaryServiceParam]);

  // Custom date picker state
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [servicesLoading, setServicesLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceRow | null>(null);
  const selectedServiceId = selectedService?.service_id ?? null;
  const [fillRequestCounts, setFillRequestCounts] = useState<Record<string, number>>({});
  const [providerProfiles, setProviderProfiles] = useState<Record<string, ServiceProviderProfile>>({});
  const initialLoadRef = useRef(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousServiceStatusesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (showOverlay || temporaryService) {
      setOverlayVisible(true);
    }
  }, [showOverlay, temporaryService]);

  useEffect(() => {
    if (showConfirmedModal) {
      setConfirmationModalType('confirmed');
      setConfirmedHelprName(helprFirstName);
      setConfirmationModalVisible(true);
    }
  }, [showConfirmedModal, helprFirstName]);

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
      setFillRequestCounts({});
      initialLoadRef.current = false;
      return;
    }

    if (initialLoadRef.current) {
      setServicesLoading(true);
    }
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
        setFillRequestCounts({});
        initialLoadRef.current = false;
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

      const providerIds = Array.from(
        new Set(
          (serviceData ?? [])
            .map(item => (item as ServiceRow)?.service_provider_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (providerIds.length > 0) {
        const { data: providerRows, error: providerError } = await supabase
          .from('service_provider')
          .select('service_provider_id, first_name, last_name, profile_picture_url')
          .in('service_provider_id', providerIds);

        if (providerError) {
          console.error('Failed to load provider profiles:', providerError);
          setProviderProfiles({});
        } else {
          const profiles: Record<string, ServiceProviderProfile> = {};
          providerRows?.forEach(row => {
            if (!row || !row.service_provider_id) {
              return;
            }
            profiles[row.service_provider_id] = {
              service_provider_id: row.service_provider_id,
              first_name: row.first_name ?? null,
              last_name: row.last_name ?? null,
              profile_picture_url: row.profile_picture_url ?? null,
            };
          });
          setProviderProfiles(profiles);
        }
      } else {
        setProviderProfiles({});
      }

      if (!serviceData || serviceData.length === 0) {
        setSelectedService(null);
        setFillRequestCounts({});
      } else {
        const serviceIds = serviceData
          .map(item => item?.service_id)
          .filter((id): id is string => Boolean(id));

        if (serviceIds.length === 0) {
          setFillRequestCounts({});
        } else {
          const { data: fillRequests, error: fillRequestError } = await supabase
            .from('service_fill_request')
            .select('service_id')
            .in('service_id', serviceIds);

          if (fillRequestError) {
            console.error('Failed to load fill request counts:', fillRequestError);
            setFillRequestCounts({});
          } else {
            const counts: Record<string, number> = {};
            fillRequests?.forEach(row => {
              const id = (row as { service_id?: string })?.service_id;
              if (!id) {
                return;
              }
              counts[id] = (counts[id] ?? 0) + 1;
            });
            setFillRequestCounts(counts);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load services:', error);
      setServicesError('Unable to load your services right now.');
      setSelectedService(null);
      setFillRequestCounts({});
      setProviderProfiles({});
    } finally {
      setServicesLoading(false);
      initialLoadRef.current = false;
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
    if (authLoading) {
      return;
    }

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    pollingRef.current = setInterval(() => {
      fetchServices();
    }, 5000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [authLoading, fetchServices]);

  useEffect(() => {
    if (!user) {
      resetSelectProModalTracker();
      previousServiceStatusesRef.current = {};
    }
  }, [user]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const previous = previousServiceStatusesRef.current;
    const next: Record<string, string> = {};

    services.forEach(service => {
      if (!service?.service_id) {
        return;
      }

      const normalizedStatus = (service.status ?? '').toLowerCase();
      next[service.service_id] = normalizedStatus;

      const priorStatus = previous[service.service_id];
      const alreadyShown = hasShownSelectProModal(service.service_id);

      if (
        priorStatus === 'finding_pros' &&
        normalizedStatus === 'select_service_provider' &&
        !alreadyShown
      ) {
        markSelectProModalShown(service.service_id);
        showModal({
          title: 'Select a Pro',
          message: 'Workers are available to fill your request! Select a pro when you\'re ready.',
          buttons: [
            {
              text: 'Close',
            },
          ],
        });
      }
    });

    previousServiceStatusesRef.current = next;
  }, [isFocused, services, showModal]);

  const formatStatusLabel = useCallback((status?: string | null) => {
    if (!status) {
      return 'Finding Pros';
    }

    const normalized = status.toLowerCase();
    if (normalized === 'cancelled') {
      return 'Cancelled';
    }
    if (normalized === 'helpr_otw') {
      return 'On the Way';
    }
    if (normalized === 'in_progress') {
      return 'In Progress';
    }
    if (normalized === 'confirmed') {
      return 'Job Confirmed';
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

  const formatScheduledDateTime = useCallback((isoDate?: string | null) => {
    if (!isoDate) {
      return 'Scheduled';
    }

    try {
      const date = new Date(isoDate);
      if (Number.isNaN(date.getTime())) {
        return 'Scheduled';
      }

      return date.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch (error) {
      console.warn('Failed to format scheduled date/time banner:', error);
      return 'Scheduled';
    }
  }, []);

  const confirmedServices = useMemo(() => {
    let allServices = [...services];
    
    const filtered = allServices.filter(service => {
      const type = (service.scheduling_type ?? '').toLowerCase();
      const status = (service.status ?? '').toLowerCase();

      // Exclude completed services
      if (status === 'completed') {
        return false;
      }

      if (!type) {
        return false;
      }

      if (type === 'scheduled') {
        return Boolean(service.scheduled_date_time);
      }

      return true;
    });

    const getComparableTimestamp = (service: ServiceRow) => {
      const candidates = [
        service.scheduled_date_time,
        service.start_datetime,
        service.date_of_creation,
      ];

      for (const candidate of candidates) {
        if (!candidate) {
          continue;
        }

        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) {
          return date.getTime();
        }
      }

      return Number.MAX_SAFE_INTEGER;
    };

    return filtered.sort((a, b) => {
      const aType = a.scheduling_type?.toLowerCase();
      const bType = b.scheduling_type?.toLowerCase();
      const aIsAsap = aType === 'asap';
      const bIsAsap = bType === 'asap';

      if (aIsAsap !== bIsAsap) {
        return aIsAsap ? -1 : 1;
      }

      const aTime = getComparableTimestamp(a);
      const bTime = getComparableTimestamp(b);

      return aTime - bTime;
    });
  }, [services]);

  const asapServices = useMemo(
    () => confirmedServices.filter(service => (service.scheduling_type ?? '').toLowerCase() === 'asap'),
    [confirmedServices],
  );

  const scheduledServices = useMemo(
    () => confirmedServices.filter(service => (service.scheduling_type ?? '').toLowerCase() !== 'asap'),
    [confirmedServices],
  );

  useEffect(() => {
    if (confirmedServices.length === 0) {
      setSelectedService(null);
      return;
    }

    if (serviceId) {
      const match = confirmedServices.find(service => service.service_id === serviceId);
      if (match) {
        setSelectedService(match);
        return;
      }
    }

    // If we have a temporary service, select it
    if (temporaryService) {
      setSelectedService(temporaryService);
      return;
    }

    setSelectedService(prev => {
      if (prev) {
        const stillExists = confirmedServices.find(service => service.service_id === prev.service_id);
        if (stillExists) {
          return stillExists;
        }
      }
      return confirmedServices[0];
    });
  }, [confirmedServices, serviceId, temporaryService]);

  const renderServiceCard = (service: ServiceRow) => {
    const isSelected = selectedService?.service_id === service.service_id;
    const requestCount = fillRequestCounts[service.service_id] ?? 0;
    const normalizedStatus = (service.status ?? '').toLowerCase();
    const isConfirmed = normalizedStatus === 'confirmed';
    const isHelprOtw = normalizedStatus === 'helpr_otw';
    const isInProgress = normalizedStatus === 'in_progress';
    const hasRequests = requestCount > 0 && !isConfirmed && !isHelprOtw && !isInProgress;
    
    // Determine status label with priority
    let statusLabel: string;
    if (isHelprOtw) {
      statusLabel = 'On the Way';
    } else if (isInProgress) {
      statusLabel = 'In Progress';
    } else if (isConfirmed) {
      statusLabel = 'Job Confirmed';
    } else if (hasRequests) {
      statusLabel = 'Select a Pro';
    } else {
      statusLabel = formatStatusLabel(service.status);
    }
    
    const shortLocation = getShortLocation(service);
    const priceLabel = formatPrice(service.price);
    const profile = service.service_provider_id ? providerProfiles[service.service_provider_id] : undefined;
    const providerFirstName = profile?.first_name?.trim() || null;
    const providerLastName = profile?.last_name?.trim() || null;
    const displayProviderName = providerFirstName || 'Your Helpr';
    const providerInitials = `${providerFirstName ? providerFirstName.charAt(0) : ''}${providerLastName ? providerLastName.charAt(0) : ''}`.toUpperCase() || 'H';
    const profileImageUrl = profile?.profile_picture_url ?? null;
    const isAssigned = isConfirmed || isHelprOtw || isInProgress;
    const hasAssignedProvider = Boolean(service.service_provider_id);
  const assignedSubtitle = isHelprOtw ? 'On the Way' : isInProgress ? 'In Progress' : 'Job Confirmed';

    const statusContent = (
      <View style={styles.statusContentRow}>
        <Text style={styles.serviceStatusText} numberOfLines={1}>
          {statusLabel}
        </Text>
        {hasRequests ? (
          <View style={styles.requestCountBadge}>
            <Text style={styles.requestCountText}>{requestCount}</Text>
          </View>
        ) : null}
      </View>
    );

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
            {hasRequests ? (
              <Pressable
                style={[styles.serviceStatusPill, styles.selectProStatusPill]}
                onPress={(event: GestureResponderEvent) => {
                  event.stopPropagation();
                  handleSelectPro(service);
                }}
              >
                {statusContent}
              </Pressable>
            ) : isConfirmed ? null : (
              <View style={styles.serviceStatusPill}>{statusContent}</View>
            )}
            {isAssigned && hasAssignedProvider ? (
              <View style={styles.confirmedProfileRow}>
                <View style={styles.confirmedProfileCircle}>
                  {profileImageUrl ? (
                    <Image source={{ uri: profileImageUrl }} style={styles.confirmedProfileImage} />
                  ) : (
                    <Text style={styles.confirmedProfileInitials}>{providerInitials}</Text>
                  )}
                </View>
                <View style={styles.confirmedProviderMeta}>
                  <Text style={styles.confirmedProviderName} numberOfLines={1}>{displayProviderName}</Text>
                  <Text style={styles.confirmedProviderSubtitle} numberOfLines={1}>{assignedSubtitle}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.cardActionRow}>
              <Pressable style={styles.editRequestGroup} onPress={() => handleEditRequest(service)}>
                <View style={styles.editRequestIconWrapper}>
                  <SvgXml xml={EDIT_REQUEST_ICON_XML} width={16} height={16} />
                </View>
                <Text style={styles.editRequestText}>Edit Request</Text>
              </Pressable>
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
          {isAssigned ? (
            <View style={styles.confirmedButtonColumn}>
              {isConfirmed && (
                <Text style={styles.confirmedPriceLabel}>{priceLabel}</Text>
              )}
              <Pressable
                style={[styles.showDetailsButton, isConfirmed ? styles.showDetailsButtonCompact : null]}
                onPress={() => router.push({
                  pathname: '/ServiceDetails' as any,
                  params: { serviceId: service.service_id }
                })}
                accessibilityRole="button"
                accessibilityLabel="View service details"
                accessibilityHint="Opens the full service details screen"
              >
                <Text style={styles.showDetailsButtonText}>Service Details</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.priceColumn}>
              <View style={styles.priceRow}>
                <Text style={styles.priceValue}>{priceLabel}</Text>
                <Text style={styles.priceEstimate}>est.</Text>
              </View>
              <Pressable style={styles.serviceCancelButton} onPress={() => handleCancelService(service)}>
                <Text style={styles.serviceCancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const cancelService = useCallback(
    async (serviceIdToCancel: string) => {
      try {
        const { error: requestError } = await supabase
          .from('service_fill_request')
          .delete()
          .eq('service_id', serviceIdToCancel);

        if (requestError) {
          throw requestError;
        }

        const { error } = await supabase
          .from('service')
          .delete()
          .eq('service_id', serviceIdToCancel);

        if (error) {
          throw error;
        }

        await fetchServices();
      } catch (error) {
        console.error('Failed to delete service:', error);
        showModal({
          title: 'Delete failed',
          message: 'Unable to delete this service right now.',
        });
      }
    },
    [fetchServices, showModal],
  );

  const handleCancelService = useCallback(
    (service: ServiceRow) => {
      showModal({
        title: 'Cancel request?',
        message: 'This will permanently remove the service from your account.',
        buttons: [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Cancel service',
            style: 'destructive',
            onPress: () => cancelService(service.service_id),
          },
        ],
      });
    },
    [cancelService, showModal],
  );

  const handleEditRequest = useCallback((service: ServiceRow) => {
    if (!service) {
      return;
    }

    try {
      const payload = {
        service_id: service.service_id,
        service_type: service.service_type,
        start_location: service.start_location,
        end_location: service.end_location,
        price: service.price,
        payment_method_type: service.payment_method_type,
        autofill_type: service.autofill_type,
        scheduling_type: service.scheduling_type,
        scheduled_date_time: service.scheduled_date_time,
        description: service.description,
      };

      router.push({
        pathname: 'moving' as any,
        params: {
          editServiceId: service.service_id,
          editService: encodeURIComponent(JSON.stringify(payload)),
        },
      });
    } catch (error) {
      console.error('Failed to open edit request:', error);
      showModal({
        title: 'Unable to edit',
        message: 'We could not open this request for editing right now.',
      });
    }
  }, [showModal]);

  const handleSelectPro = useCallback((service: ServiceRow) => {
    if (!service?.service_id) {
      return;
    }

    router.push({
      pathname: 'selecthelpr' as any,
      params: {
        serviceId: service.service_id,
      },
    });
  }, []);

  const updateServiceRow = useCallback(
    async (changes: Record<string, unknown>, targetServiceId?: string | null) => {
      const effectiveServiceId = targetServiceId ?? serviceId ?? selectedServiceId ?? null;

      if (!effectiveServiceId) {
        showModal({
          title: 'Missing request',
          message: 'Unable to find the service you are scheduling. Please restart the request.',
        });
        return false;
      }

      try {
        const { error } = await supabase
          .from('service')
          .update(changes)
          .eq('service_id', effectiveServiceId);

        if (error) {
          throw error;
        }

        return true;
      } catch (error) {
        console.error('Failed to update service scheduling:', error);
        showModal({
          title: 'Scheduling failed',
          message: 'Unable to update your service. Please try again.',
        });
        return false;
      }
    },
    [selectedServiceId, serviceId, showModal],
  );

  const handleScheduleAsap = useCallback(async () => {
    const targetService = selectedService || temporaryService;
    
    if (!targetService) {
      showModal({
        title: 'No service selected',
        message: 'Please select a service to schedule.',
      });
      return;
    }

    // If this is a temporary service, create it in the database first
    if (temporaryService && targetService.service_id === temporaryService.service_id) {
      const { error } = await supabase.from('service').insert(temporaryService);
      if (error) {
        console.error('Failed to create service:', error);
        showModal({
          title: 'Scheduling failed',
          message: 'Unable to save your service. Please try again.',
        });
        return;
      }
    }

    const success = await updateServiceRow({
      scheduling_type: 'asap',
      scheduled_date_time: new Date().toISOString(),
    }, targetService.service_id);

    if (success) {
      await fetchServices();
      closeOverlay();
      setConfirmationModalType('finding_pros');
      setConfirmationModalVisible(true);
    }
  }, [closeOverlay, fetchServices, selectedService, showModal, temporaryService, updateServiceRow]);

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
    const targetService = selectedService || temporaryService;
    
    if (!targetService) {
      showModal({
        title: 'No service selected',
        message: 'Please select a service to schedule.',
      });
      return;
    }

    // If this is a temporary service, create it in the database first
    if (temporaryService && targetService.service_id === temporaryService.service_id) {
      const { error } = await supabase.from('service').insert(temporaryService);
      if (error) {
        console.error('Failed to create service:', error);
        showModal({
          title: 'Scheduling failed',
          message: 'Unable to save your service. Please try again.',
        });
        return;
      }
    }

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
    }, targetService.service_id);

    if (success) {
      await fetchServices();
      setPickerVisible(false);
      setOverlayVisible(false);
      setConfirmationModalType('finding_pros');
      setConfirmationModalVisible(true);
    }
  }, [fetchServices, selectedDate, selectedTimeSlot, selectedService, showModal, temporaryService, updateServiceRow]);

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
        ) : confirmedServices.length === 0 ? (
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
              {asapServices.length > 0 ? (
                <View style={styles.bannerSection}>
                  <View style={styles.primaryBannerContainer}>
                    <Text style={styles.primaryBannerText}>ASAP</Text>
                  </View>
                  {asapServices.map(renderServiceCard)}
                </View>
              ) : null}

              {scheduledServices.map(service => (
                <View key={`scheduled-${service.service_id}`} style={styles.bannerSection}>
                  <View style={styles.primaryBannerContainer}>
                    <Text style={styles.primaryBannerText}>
                      {formatScheduledDateTime(service.scheduled_date_time)}
                    </Text>
                  </View>
                  {renderServiceCard(service)}
                </View>
              ))}
            </View>
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
            <View style={styles.selectProDivider} />
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

      {/* Confirmation Modal */}
      <Modal
        visible={confirmationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmationModalVisible(false)}
      >
        <View style={styles.overlayBackground}>
          <View style={styles.confirmationModal}>
            <Text style={styles.confirmationTitle}>
              {confirmationModalType === 'confirmed' ? 'Helpr Confirmed' : 'Finding Pros'}
            </Text>
            <View style={styles.confirmationDivider} />
            <Text style={styles.confirmationMessage}>
              {confirmationModalType === 'confirmed' 
                ? `We'll let you know when ${confirmedHelprName} is on the way. Thanks for choosing Helpr!`
                : 'Finding available workers. We\'ll notify you when it\'s time to select a pro.'}
            </Text>
            <Pressable 
              style={styles.confirmationOkButton} 
              onPress={() => setConfirmationModalVisible(false)}
            >
              <Text style={styles.confirmationOkText}>OK</Text>
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
  bannerSection: {
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
    flexGrow: 1,
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
    paddingVertical: 3,
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
    paddingVertical: 4,
    minHeight: 20,
    marginTop: 6,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceStatusText: {
    color: '#FFF8E8',
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  statusContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestCountBadge: {
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    minWidth: 10,
    height: 15,
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  requestCountText: {
    color: '#0c4309',
    fontSize: 10.5,
    fontWeight: '700',
  },
  selectProStatusPill: {
    backgroundColor: '#0c4309',
  },
  confirmedStatusPill: {
    backgroundColor: '#0c4309',
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
    marginTop: 4,
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
    marginLeft: 10,
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
    width: '70%',
    backgroundColor: '#FFF8E8',
    borderRadius: 30,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  selectProTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  selectProDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: '#CAC4D0',
    marginBottom: 10,
    marginHorizontal: -30,
  },
  selectProMessage: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  selectProOkButton: {
    backgroundColor: '#0c4309',   
    borderRadius: 30,
    paddingVertical: 5,
    paddingHorizontal: 60,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  selectProOkText: {
    color: '#FFFFFF',
    fontSize: 14,
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
  confirmationModal: {
    width: '70%',
    backgroundColor: '#E5DCC9',
    borderRadius: 30,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  confirmationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  confirmationDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: '#CAC4D0',
    marginBottom: 10,
    marginHorizontal: -30,
  },
  confirmationMessage: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  confirmationOkButton: {
    backgroundColor: '#0c4309',
    borderRadius: 30,
    paddingVertical: 5,
    paddingHorizontal: 60,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmationOkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmedButtonColumn: {
    width: 140,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  confirmedProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  confirmedProfileCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#C0B9A6',
  },
  confirmedProfileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  confirmedProfileInitials: {
    color: '#0c4309',
    fontSize: 18,
    fontWeight: '700',
  },
  confirmedProviderMeta: {
    flexShrink: 1,
  },
  confirmedProviderName: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmedProviderSubtitle: {
    color: '#0c4309',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  confirmedPriceLabel: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  showDetailsButton: {
    width: '100%',
    paddingVertical: 30,
    backgroundColor: '#FFF8E8',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C0B9A6',
  },
  showDetailsButtonCompact: {
    paddingVertical: 16,
  },
  showDetailsButtonText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#0c4309',
  },
});
