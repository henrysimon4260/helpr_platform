import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator, Platform, InteractionManager, Modal, TextInput } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../src/lib/supabase';
import { ensureServiceProviderProfile } from '../src/lib/providerProfile';
import { useAuth } from '../src/contexts/AuthContext';
import { useModal } from '../src/contexts/ModalContext';
// @ts-ignore - Only for native platforms
import LottieView from 'lottie-react-native';

const sanitizeCurrencyValue = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = typeof value === 'number' ? value.toString() : value;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric.toFixed(2);
};

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

type ServiceRequestRow = {
  service_id: string;
  service_provider_id: string;
  bid: string | number | null;
  created_at?: string | null;
  proposed_date_time?: string | null;
};

const helpIconSvg = `
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="none" stroke="#0c4309" stroke-width="2"/>
    <path d="M10 10a2 2 0 0 1 2-2c1.1 0 2 .9 2 2 0 .7-.3 1.3-.8 1.7l-.2.2c-.3.3-.5.6-.5 1" fill="none" stroke="#0c4309" stroke-width="2"/>
    <circle cx="12" cy="16" r="1" fill="#0c4309"/>
  </svg>
`;

const greenArrowSvg = `
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12h14M13 5l7 7-7 7" stroke="#0c4309" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export default function Landing() {
  const router = useRouter();
  const lottieRef = useRef<any>(null);
  const helpLottieRef = useRef<any>(null);
  const isDateTimePickerSupported = useMemo(() => Platform.OS === 'ios' || Platform.OS === 'android', []);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [canRenderLottie, setCanRenderLottie] = useState(Platform.OS !== 'web');
  const { user, loading: authLoading } = useAuth();
  const { showModal } = useModal();
  const [servicesLoading, setServicesLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceRow | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [serviceRequests, setServiceRequests] = useState<Record<string, ServiceRequestRow>>({});
  const [customBids, setCustomBids] = useState<Record<string, string>>({});
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [modalService, setModalService] = useState<ServiceRow | null>(null);
  const [bidInput, setBidInput] = useState('');
  const [descriptionModalVisible, setDescriptionModalVisible] = useState(false);
  const [descriptionModalService, setDescriptionModalService] = useState<ServiceRow | null>(null);
  const [suggestTimeModalVisible, setSuggestTimeModalVisible] = useState(false);
  const [suggestTimeModalService, setSuggestTimeModalService] = useState<ServiceRow | null>(null);
  const [suggestedTimeSelection, setSuggestedTimeSelection] = useState<Date | null>(null);
  const [suggestedTimeDraft, setSuggestedTimeDraft] = useState<Date>(() => new Date());
  const [suggestTimeError, setSuggestTimeError] = useState<string | null>(null);
  const [suggestTimeSubmitting, setSuggestTimeSubmitting] = useState(false);
  const [customerData, setCustomerData] = useState<Record<string, { first_name?: string; last_name?: string }>>({});

  const formattedSuggestedTime = useMemo(() => {
    if (!suggestedTimeSelection) {
      return 'Select Date and Time';
    }

    try {
      return suggestedTimeSelection.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (error) {
      console.warn('Failed to format suggested time:', error);
      return suggestedTimeSelection.toString();
    }
  }, [suggestedTimeSelection]);

  useEffect(() => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      setCanRenderLottie(false);
      const task = InteractionManager?.runAfterInteractions?.(() => setCanRenderLottie(true));
      // @ts-ignore
      return () => task?.cancel?.();
    }
    setCanRenderLottie(true);
  }, []);

  const initialLoadRef = useRef(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetServiceState = useCallback(() => {
    setServices([]);
    setServiceRequests({});
    setCustomBids({});
    setSelectedService(null);
    setCustomerData({});
  }, []);

  const fetchServices = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (initialLoadRef.current) {
      setServicesLoading(true);
    }

    setServicesError(null);

    try {
      let authUser = user ?? null;
      if (!authUser) {
        const { data: authUserResponse, error: authUserError } = await supabase.auth.getUser();

        if (authUserError) {
          const isSessionMissing =
            authUserError.name === 'AuthSessionMissingError' ||
            (typeof authUserError.message === 'string' && authUserError.message.toLowerCase().includes('session missing'));

          if (!isSessionMissing) {
            throw authUserError;
          }
        }

        authUser = authUserResponse?.user ?? null;
      }

      if (!authUser?.id) {
        setProviderId(null);
        resetServiceState();
        setServicesLoading(false);
        initialLoadRef.current = true;
        // Redirect unauthenticated users to login
        router.replace('/login');
        return;
      }

      if (authUser) {
        const ensureResult = await ensureServiceProviderProfile({
          userId: authUser.id,
          email: authUser.email,
          firstName: (authUser.user_metadata?.first_name as string | null) ?? null,
          lastName: (authUser.user_metadata?.last_name as string | null) ?? null,
          phone: (authUser.user_metadata?.phone as string | null) ?? null,
        });

        if (!ensureResult.success) {
          console.warn('Unable to ensure provider profile:', ensureResult.error);
        }
      }

      const providerIdentifier = authUser.id;
      setProviderId(providerIdentifier);

      const statusesToQuery = [
        'finding_pros', 'pending', 'scheduled', 'confirmed', 
        'helpr_otw', 'in_progress', 'select_service_provider',
        'Finding_Pros', 'Pending', 'Scheduled', 'Confirmed',
        'Helpr_Otw', 'In_Progress', 'Select_Service_Provider'
      ];

      const { data: serviceData, error: serviceError } = await supabase
        .from('service')
        .select('*')
        .in('status', statusesToQuery)
        .order('date_of_creation', { ascending: true });

      if (serviceError) {
        throw serviceError;
      }

      const visibleServices = (serviceData ?? [])
        .filter((service): service is ServiceRow => Boolean(service?.service_id))
        .filter(service => {
          const status = (service.status ?? '').toString().toLowerCase();
          return status === 'finding_pros' || status === 'pending' || status === 'scheduled' || status === 'confirmed' || status === 'helpr_otw' || status === 'in_progress' || status === 'select_service_provider';
        });

      if (visibleServices.length === 0) {
        resetServiceState();
        return;
      }

      setServices(visibleServices);

      // Fetch customer data for confirmed services
      const confirmedServices = visibleServices.filter(service => {
        const status = (service.status ?? '').toLowerCase();
        return (status === 'confirmed' || status === 'helpr_otw' || status === 'in_progress') && service.customer_id;
      });

      if (confirmedServices.length > 0) {
        const customerIds = confirmedServices
          .map(service => service.customer_id)
          .filter((id): id is string => Boolean(id));

        if (customerIds.length > 0) {
          const { data: customerDataResult, error: customerError } = await supabase
            .from('customer')
            .select('customer_id, first_name, last_name')
            .in('customer_id', customerIds);

          if (!customerError && customerDataResult) {
            const customerMap: Record<string, { first_name?: string; last_name?: string }> = {};
            customerDataResult.forEach(customer => {
              if (customer.customer_id) {
                customerMap[customer.customer_id] = {
                  first_name: customer.first_name ?? undefined,
                  last_name: customer.last_name ?? undefined,
                };
              }
            });
            setCustomerData(customerMap);
          }
        }
      }

      const serviceIds = visibleServices
        .map(service => service.service_id)
        .filter((id): id is string => Boolean(id));

      if (serviceIds.length === 0) {
        resetServiceState();
        return;
      }

      const { data: requestData, error: requestError } = await supabase
        .from('service_fill_request')
        .select('*')
        .eq('service_provider_id', providerIdentifier)
        .in('service_id', serviceIds);

      if (requestError) {
        throw requestError;
      }

      const nextRequests: Record<string, ServiceRequestRow> = {};
      const nextBids: Record<string, string> = {};

      requestData?.forEach(row => {
        if (!row?.service_id) {
          return;
        }

        const typedRow = row as ServiceRequestRow;
        nextRequests[typedRow.service_id] = typedRow;

        const sanitizedBid = sanitizeCurrencyValue(typedRow.bid);
        if (sanitizedBid) {
          nextBids[typedRow.service_id] = sanitizedBid;
        }
      });

      setServiceRequests(nextRequests);

      setCustomBids(prev => {
        const updated: Record<string, string> = {};
        serviceIds.forEach(id => {
          if (nextBids[id]) {
            updated[id] = nextBids[id];
          } else if (prev[id]) {
            updated[id] = prev[id];
          }
        });
        return updated;
      });
    } catch (error) {
      console.error('Failed to load services:', error);
      setServicesError('Unable to load jobs right now.');
    } finally {
      setServicesLoading(false);
      initialLoadRef.current = false;
    }
  }, [authLoading, resetServiceState, user]);

  useFocusEffect(
    useCallback(() => {
      fetchServices();
      return () => {
        // no-op
      };
    }, [fetchServices]),
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    fetchServices();

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
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

  const formatServiceType = useCallback((serviceType?: string | null) => {
    if (!serviceType) {
      return 'Service';
    }

    const normalized = serviceType.trim();
    if (!normalized) {
      return 'Service';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  }, []);

  const getPrimaryLocation = useCallback((service: ServiceRow) => {
    const start = service.start_location?.trim();
    if (start) {
      return start;
    }

    const fallback = service.location?.trim();
    if (fallback) {
      return fallback;
    }

    return 'Add location';
  }, []);

  const getShortLocation = useCallback(
    (service: ServiceRow) => {
      const location = getPrimaryLocation(service);
      if (location.length <= 20) {
        return location;
      }
      return `${location.slice(0, 20)}…`;
    },
    [getPrimaryLocation],
  );

  const formatPrice = useCallback((price?: number | null) => {
    if (typeof price === 'number' && Number.isFinite(price)) {
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(price);
      } catch {
        return `$${Math.round(price)}`;
      }
    }
    return '$0';
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
    } catch {
      return 'Scheduled';
    }
  }, []);

  const sortedServices = useMemo(() => {
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

    return [...services].sort((a, b) => {
      const aType = (a.scheduling_type ?? '').toLowerCase();
      const bType = (b.scheduling_type ?? '').toLowerCase();
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
    () => sortedServices.filter((service: ServiceRow) => (service.scheduling_type ?? '').toLowerCase() === 'asap'),
    [sortedServices],
  );

  const scheduledServices = useMemo(
    () => sortedServices.filter((service: ServiceRow) => (service.scheduling_type ?? '').toLowerCase() !== 'asap'),
    [sortedServices],
  );

  useEffect(() => {
    if (sortedServices.length === 0) {
      setSelectedService(null);
      return;
    }

    setSelectedService(prev => {
      if (prev) {
        const stillExists = sortedServices.find(service => service.service_id === prev.service_id);
        if (stillExists) {
          return stillExists;
        }
      }
      return sortedServices[0];
    });
  }, [sortedServices]);

  const sanitizeBidValue = useCallback(
    (value: string | number | null | undefined) => sanitizeCurrencyValue(value),
    [],
  );

  const getEffectiveBidForService = useCallback(
    (service: ServiceRow) => {
      const custom = customBids[service.service_id];
      const customSanitized = sanitizeBidValue(custom);
      if (customSanitized) {
        return customSanitized;
      }

      const existingBid = serviceRequests[service.service_id]?.bid;
      const existingSanitized = sanitizeBidValue(existingBid ?? null);
      if (existingSanitized) {
        return existingSanitized;
      }

      if (typeof service.price === 'number' && Number.isFinite(service.price)) {
        return sanitizeBidValue(service.price);
      }

      return null;
    },
    [customBids, serviceRequests, sanitizeBidValue],
  );

  const submitServiceRequest = useCallback(
    async (service: ServiceRow, options: { proposedDateTime?: string | null } = {}) => {
      if (!providerId) {
        showModal({
          title: 'Provider not found',
          message: 'We could not verify your provider profile. Please sign out and sign back in.',
        });
        return false;
      }

      const bidValue = getEffectiveBidForService(service);
      const numericBid = bidValue ? Number(bidValue) : null;

      if (numericBid === null || Number.isNaN(numericBid)) {
        showModal({
          title: 'Bid required',
          message: 'Please enter a bid amount before requesting this job.',
        });
        return false;
      }

      const schedulingTypeNormalized = (service.scheduling_type ?? '').toLowerCase();
      const shouldProposeDateTime = schedulingTypeNormalized === 'asap' || options.proposedDateTime;
      const proposedDateTime = shouldProposeDateTime
        ? options.proposedDateTime?.trim() || null
        : null;

      const { data, error } = await supabase
        .from('service_fill_request')
        .insert({
          service_provider_id: providerId,
          service_id: service.service_id,
          bid: numericBid,
          proposed_date_time: proposedDateTime,
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create service request:', error);
        showModal({
          title: 'Unable to request job',
          message: 'Please try again in a moment.',
        });
        return false;
      }

      const newRow = data as ServiceRequestRow;
      const combinedRow: ServiceRequestRow = {
        ...newRow,
        proposed_date_time: proposedDateTime ?? newRow.proposed_date_time ?? null,
      };

      const isAutoFill = (service.autofill_type ?? '').toString().toLowerCase() === 'autofill';

      if (isAutoFill) {
        try {
          const { data: assignmentRows, error: assignError } = await supabase
            .from('service')
            .update({
              service_provider_id: providerId,
              status: 'confirmed',
              price: numericBid,
              scheduling_type: 'scheduled',
              scheduled_date_time: proposedDateTime ?? service.scheduled_date_time ?? null,
            })
            .eq('service_id', service.service_id)
            .in('status', ['finding_pros', 'select_service_provider'])
            .is('service_provider_id', null)
            .select('service_id');

          if (assignError) {
            throw assignError;
          }

          if (assignmentRows && assignmentRows.length > 0) {
            await supabase
              .from('service_fill_request')
              .delete()
              .eq('service_id', service.service_id);

            setServiceRequests(prev => {
              const next = { ...prev };
              delete next[service.service_id];
              return next;
            });

            setCustomBids(prev => {
              const next = { ...prev };
              delete next[service.service_id];
              return next;
            });

            setServices(prev => prev.map(existing =>
              existing.service_id === service.service_id
                ? {
                    ...existing,
                    status: 'confirmed',
                    service_provider_id: providerId,
                    price: numericBid,
                    scheduling_type: 'scheduled',
                    scheduled_date_time: proposedDateTime ?? existing.scheduled_date_time ?? null,
                  }
                : existing,
            ));

            setSelectedService(prev => (prev && prev.service_id === service.service_id
              ? {
                  ...prev,
                  status: 'confirmed',
                  service_provider_id: providerId,
                  price: numericBid,
                  scheduling_type: 'scheduled',
                  scheduled_date_time: proposedDateTime ?? prev.scheduled_date_time ?? null,
                }
              : prev));

            await fetchServices();

            showModal({
              title: 'Job confirmed',
              message: 'Head to Service Details for next steps.',
            });
            return true;
          }

          await supabase
            .from('service_fill_request')
            .delete()
            .eq('service_id', service.service_id)
            .eq('service_provider_id', providerId);

          showModal({
            title: 'Job filled',
            message: 'Another Helpr was just assigned to this AutoFill job.',
          });
          return false;
        } catch (assignError) {
          console.error('AutoFill assignment failed:', assignError);
          await supabase
            .from('service_fill_request')
            .delete()
            .eq('service_id', service.service_id)
            .eq('service_provider_id', providerId);

          showModal({
            title: 'AutoFill unavailable',
            message: 'We were unable to claim this job automatically. Please try again.',
          });
          return false;
        }
      }

      setServiceRequests(prev => ({
        ...prev,
        [service.service_id]: combinedRow,
      }));

      setCustomBids(prev => ({
        ...prev,
        [service.service_id]: bidValue ?? numericBid.toFixed(2),
      }));

      const currentStatus = (service.status ?? '').toLowerCase();
      if (currentStatus === 'finding_pros') {
        try {
          const { data: updatedRows, error: statusUpdateError } = await supabase
            .from('service')
            .update({ status: 'select_service_provider' })
            .eq('service_id', service.service_id)
            .eq('status', 'finding_pros')
            .select('service_id');

          if (statusUpdateError) {
            console.error('Failed to update service status to select_service_provider:', statusUpdateError);
          } else if (updatedRows && updatedRows.length > 0) {
            setServices(prev => prev.map(existing => existing.service_id === service.service_id
              ? { ...existing, status: 'select_service_provider' }
              : existing,
            ));
          }
        } catch (statusError) {
          console.error('Unexpected error while updating service status:', statusError);
        }
      }

      return true;
    },
    [providerId, showModal, getEffectiveBidForService, supabase, setServiceRequests, setCustomBids, setServices, setSelectedService, fetchServices],
  );

  const handleToggleServiceRequest = useCallback(async (service: ServiceRow) => {
    if (!providerId) {
      showModal({
        title: 'Provider not found',
        message: 'We could not verify your provider profile. Please sign out and sign back in.',
      });
      return;
    }

    const normalizedStatus = (service.status ?? '').toLowerCase();
    const isConfirmed = normalizedStatus === 'confirmed';
    const existingRequest = serviceRequests[service.service_id];

    // Handle canceling a confirmed job
    if (isConfirmed && service.service_provider_id === providerId) {
      showModal({
        title: 'Cancel Confirmed Job',
        message: 'Are you sure you want to cancel this confirmed job? The customer will be notified.',
        allowBackdropDismiss: false,
        buttons: [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes, Cancel',
            style: 'destructive',
            onPress: async () => {
              try {
                const { error: deleteRequestError } = await supabase
                  .from('service_fill_request')
                  .delete()
                  .eq('service_provider_id', providerId)
                  .eq('service_id', service.service_id);

                if (deleteRequestError) {
                  console.error('Failed to delete service fill request:', deleteRequestError);
                }

                const { error: updateError } = await supabase
                  .from('service')
                  .update({
                    service_provider_id: null,
                    status: 'finding_pros',
                  })
                  .eq('service_id', service.service_id);

                if (updateError) {
                  throw updateError;
                }

                setServiceRequests(prev => {
                  const next = { ...prev };
                  delete next[service.service_id];
                  return next;
                });

                await fetchServices();
                showModal({
                  title: 'Job Cancelled',
                  message: 'You have been removed from this job.',
                });
              } catch (error) {
                console.error('Failed to cancel confirmed job:', error);
                showModal({
                  title: 'Unable to cancel',
                  message: 'Please try again in a moment.',
                });
              }
            },
          },
        ],
      });
      return;
    }

    // Handle canceling a service fill request
    if (existingRequest) {
      const { error: deleteError } = await supabase
        .from('service_fill_request')
        .delete()
        .eq('service_provider_id', providerId)
        .eq('service_id', service.service_id);

      if (deleteError) {
        console.error('Failed to cancel service request:', deleteError);
        showModal({
          title: 'Unable to cancel request',
          message: 'Please try again in a moment.',
        });
        return;
      }

      setServiceRequests(prev => {
        const next = { ...prev };
        delete next[service.service_id];
        return next;
      });

      return;
    }

    const schedulingTypeNormalized = (service.scheduling_type ?? '').toLowerCase();
    if (schedulingTypeNormalized === 'asap') {
      setSuggestTimeModalService(service);
      const now = new Date();
      setSuggestedTimeDraft(now);
      setSuggestedTimeSelection(now);
      setSuggestTimeError(null);
      setSuggestTimeModalVisible(true);
      return;
    }

    await submitServiceRequest(service);
  }, [
    fetchServices,
    providerId,
    serviceRequests,
    showModal,
    submitServiceRequest,
    supabase,
    setServiceRequests,
    setSuggestTimeError,
    setSuggestedTimeDraft,
    setSuggestedTimeSelection,
    setSuggestTimeModalService,
    setSuggestTimeModalVisible,
  ]);

  const openAdjustBidModal = useCallback(
    (service: ServiceRow) => {
      const initialBid = getEffectiveBidForService(service) ?? '';
      setBidInput(initialBid);
      setModalService(service);
      setAdjustModalVisible(true);
    },
    [getEffectiveBidForService],
  );

  const handleAdjustBidCancel = useCallback(() => {
    setAdjustModalVisible(false);
    setModalService(null);
  }, []);

  const handleAdjustBidSave = useCallback(() => {
    if (!modalService) {
      return;
    }

    const sanitizedBid = sanitizeBidValue(bidInput);
    if (!sanitizedBid) {
      showModal({
        title: 'Invalid bid',
        message: 'Enter a valid dollar amount.',
      });
      return;
    }

    setCustomBids(prev => ({
      ...prev,
      [modalService.service_id]: sanitizedBid,
    }));

    setServiceRequests(prev => {
      const existing = prev[modalService.service_id];
      if (!existing) {
        return prev;
      }
      return {
        ...prev,
        [modalService.service_id]: {
          ...existing,
          bid: sanitizedBid,
        },
      };
    });

    setAdjustModalVisible(false);
    setModalService(null);
  }, [bidInput, modalService, sanitizeBidValue, showModal]);

  const openDescriptionModal = useCallback((service: ServiceRow) => {
    setDescriptionModalService(service);
    setDescriptionModalVisible(true);
  }, []);

  const closeDescriptionModal = useCallback(() => {
    setDescriptionModalVisible(false);
    setDescriptionModalService(null);
  }, []);

  const handleSuggestTimeCancel = useCallback(() => {
    if (suggestTimeSubmitting) {
      return;
    }
    setSuggestTimeModalVisible(false);
    setSuggestTimeModalService(null);
    setSuggestedTimeSelection(null);
    setSuggestedTimeDraft(new Date());
    setSuggestTimeError(null);
  }, [suggestTimeSubmitting]);

  const handleSuggestTimeConfirm = useCallback(async () => {
    if (!suggestTimeModalService) {
      return;
    }

    if (!suggestedTimeSelection) {
      setSuggestTimeError('Please choose a date and time so the customer can review it.');
      return;
    }

    setSuggestTimeSubmitting(true);
    try {
      const isoString = suggestedTimeSelection.toISOString();
      const success = await submitServiceRequest(suggestTimeModalService, { proposedDateTime: isoString });
      if (success) {
        setSuggestTimeModalVisible(false);
        setSuggestTimeModalService(null);
        setSuggestedTimeSelection(null);
        setSuggestedTimeDraft(new Date());
        setSuggestTimeError(null);
      }
    } finally {
      setSuggestTimeSubmitting(false);
    }
  }, [submitServiceRequest, suggestedTimeSelection, suggestTimeModalService]);

  const handleDraftDateChange = useCallback((_: any, date?: Date) => {
    if (!date) {
      return;
    }

    setSuggestedTimeDraft(prev => {
      const next = new Date(prev);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setSuggestedTimeSelection(new Date(next));
      return next;
    });
    setSuggestTimeError(null);
  }, []);

  const handleDraftTimeChange = useCallback((_: any, date?: Date) => {
    if (!date) {
      return;
    }

    setSuggestedTimeDraft(prev => {
      const next = new Date(prev);
      next.setHours(date.getHours());
      next.setMinutes(date.getMinutes());
      next.setSeconds(0);
      next.setMilliseconds(0);
      setSuggestedTimeSelection(new Date(next));
      return next;
    });
    setSuggestTimeError(null);
  }, []);

  const renderServiceCard = (service: ServiceRow) => {
    const isSelected = selectedService?.service_id === service.service_id;
    const shortLocation = getShortLocation(service);
    const schedulingType = (service.scheduling_type ?? '').toLowerCase();
    const scheduleLabel =
      schedulingType === 'asap'
        ? 'ASAP'
        : formatScheduledDateTime(service.scheduled_date_time);
    const basePriceLabel = formatPrice(service.price);
    const effectiveBid = getEffectiveBidForService(service);
    const bidDisplay = effectiveBid ? formatPrice(Number(effectiveBid)) : basePriceLabel;
    const isRequested = Boolean(serviceRequests[service.service_id]);
    const normalizedStatus = (service.status ?? '').toLowerCase();
    const isConfirmed = normalizedStatus === 'confirmed' || normalizedStatus === 'helpr_otw' || normalizedStatus === 'in_progress';
    const statusLabel = normalizedStatus === 'helpr_otw' ? 'On the Way' : normalizedStatus === 'in_progress' ? 'In Progress' : 'Confirmed';
    const isAutoFill = (service.autofill_type ?? '').toString().toLowerCase() === 'autofill';
    
    // Check if scheduled job is within 24 hours
    const isWithin24Hours = schedulingType !== 'asap' && service.scheduled_date_time && !isConfirmed && (() => {
      try {
        const scheduledTime = new Date(service.scheduled_date_time);
        const now = new Date();
        const hoursDiff = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursDiff > 0 && hoursDiff <= 24;
      } catch {
        return false;
      }
    })();

    return (
      <View key={service.service_id} style={styles.serviceCardWrapper}>
        <Pressable
          style={[
            styles.serviceCard,
            isSelected ? styles.serviceCardSelected : null,
          ]}
          onPress={() => setSelectedService(service)}
        >
          <View style={styles.cardContentRow}>
          <View style={styles.cardInfoColumn}>
            <View style={styles.pillRow}>
              <View style={styles.serviceTypePill}>
                <Text style={styles.serviceTypeText} numberOfLines={1}>
                  {formatServiceType(service.service_type)}
                </Text>
              </View>
              {isAutoFill && !isConfirmed ? (
                <View style={styles.autoFillPill}>
                  <Text style={styles.autoFillPillText}>AutoFill</Text>
                </View>
              ) : null}
              {isConfirmed && (
                <View style={styles.confirmedPill}>
                  <Text style={styles.confirmedPillText}>{statusLabel}</Text>
                </View>
              )}

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
            {!isConfirmed && (
              <Pressable
                style={styles.descriptionButton}
                onPress={() => openDescriptionModal(service)}
              >
                <Text style={styles.descriptionButtonText}>See full description</Text>
                <SvgXml xml={greenArrowSvg} width={16} height={16} style={styles.descriptionButtonIcon} />
              </Pressable>
            )}
          </View>
          {isConfirmed ? (
            <View style={styles.confirmedButtonColumn}>
              <Text style={styles.confirmedBidValue}>{bidDisplay}</Text>
              <Pressable
                style={styles.showDetailsButton}
                onPress={() => router.push({
                  pathname: '/ServiceDetails' as any,
                  params: { serviceId: service.service_id }
                })}
                accessibilityRole="button"
                accessibilityLabel="View service details"
                accessibilityHint="Opens details for this job"
              >
                <Text style={styles.showDetailsButtonText}>Details</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.priceColumn}>
              <View style={styles.priceRow}>
                <Text style={styles.priceValue}>
                  {bidDisplay}
                </Text>
                {!isAutoFill ? <Text style={styles.priceEstimate}>bid</Text> : null}
              </View>
              <Pressable
                style={[
                  styles.requestActionButton,
                  isRequested ? styles.requestActionButtonCancel : styles.requestActionButtonRequest,
                  isAutoFill ? styles.requestActionButtonSolo : null,
                ]}
                onPress={() => handleToggleServiceRequest(service)}
              >
                <Text style={styles.requestActionButtonText}>
                  {isRequested ? 'Cancel Request' : 'Request'}
                </Text>
              </Pressable>
              {!isAutoFill ? (
                <Pressable
                  style={styles.adjustBidSecondaryButton}
                  onPress={() => openAdjustBidModal(service)}
                >
                  <Text style={styles.adjustBidSecondaryButtonText}>Adjust Bid</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
        </Pressable>
        {isWithin24Hours ? (
          <Pressable
            style={styles.suggestTimeBottomBanner}
            onPress={() => {
              setSuggestTimeModalService(service);
              // Set minimum time to 30 minutes after scheduled time
              if (service.scheduled_date_time) {
                try {
                  const scheduledTime = new Date(service.scheduled_date_time);
                  const minTime = new Date(scheduledTime.getTime() + 30 * 60 * 1000); // Add 30 minutes
                  setSuggestedTimeDraft(minTime);
                  setSuggestedTimeSelection(minTime);
                } catch {
                  const now = new Date();
                  setSuggestedTimeDraft(now);
                  setSuggestedTimeSelection(now);
                }
              }
              setSuggestTimeError(null);
              setSuggestTimeModalVisible(true);
            }}
          >
            <Text style={styles.suggestTimeBottomBannerText}>Suggest A Different Time</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const handleMenuPress = () => {
    if (Platform.OS === 'web') {
      setIsMenuOpen((v) => !v);
      return;
    }
    if (lottieRef.current) {
      if (isMenuOpen) lottieRef.current.play(24, 0);
      else lottieRef.current.play(0, 24);
    }
    setIsMenuOpen((v) => !v);
  };

  const handleHelpPress = () => {
    if (Platform.OS === 'web') {
      setIsHelpMenuOpen((v) => !v);
      return;
    }
    if (helpLottieRef.current) {
      if (isHelpMenuOpen) helpLottieRef.current.play(24, 0);
      else helpLottieRef.current.play(0, 24);
    }
    setIsHelpMenuOpen((v) => !v);
  };

  const navigate = (route: string) => {
    router.push(route as any);
  };

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#0c4309" />
      <View style={styles.header}>
        <Text style={styles.title}>Available Services</Text>
      </View>
      <View style={styles.GreenHeaderBar} />
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
        ) : sortedServices.length === 0 ? (
          <View style={styles.noServicesContainer}>
            <Text style={styles.noServicesText}>No Jobs Available</Text>
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

      <Modal
        visible={suggestTimeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleSuggestTimeCancel}
      >
        <View style={styles.suggestTimeOverlay}>
          <View style={styles.suggestTimeContent}>
            <Text style={styles.suggestTimeTitle}>Suggest A Time</Text>
            <Text style={styles.suggestTimeSubtitle}>
              {suggestTimeModalService && (suggestTimeModalService.scheduling_type ?? '').toLowerCase() === 'asap' 
                ? 'Let the customer know when you can arrive for this ASAP job.'
                : 'Let the customer know an alternative time that works better for you.'}
            </Text>
            <View style={styles.suggestTimeSummaryBox}>
              <Text style={styles.suggestTimeSummaryLabel}>Arrival time</Text>
              <Text style={styles.suggestTimeSummaryValue}>{formattedSuggestedTime}</Text>
            </View>

            {isDateTimePickerSupported ? (
              <View style={styles.inlinePickerGroup}>
                <View style={styles.inlinePickerSection}>
                  <Text style={styles.inlinePickerLabel}>Date</Text>
                  <DateTimePicker
                    value={suggestedTimeDraft}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'compact' : 'spinner'}
                    onChange={handleDraftDateChange}
                    style={styles.inlinePickerControl}
                  />
                </View>

                <View style={styles.inlinePickerDivider} />

                <View style={styles.inlinePickerSection}>
                  <Text style={styles.inlinePickerLabel}>Time</Text>
                  <DateTimePicker
                    value={suggestedTimeDraft}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'compact' : 'spinner'}
                    onChange={handleDraftTimeChange}
                    style={styles.inlinePickerControl}
                  />
                </View>
              </View>
            ) : (
              <Text style={styles.suggestTimePickerUnsupportedText}>
                Date and time selection isn’t available on this platform yet.
              </Text>
            )}

            {suggestTimeError ? (
              <Text style={styles.suggestTimeErrorText}>{suggestTimeError}</Text>
            ) : null}
            <View style={styles.suggestTimeButtonRow}>
              <Pressable
                style={[styles.suggestTimeButton, styles.suggestTimeCancelButton]}
                onPress={handleSuggestTimeCancel}
                disabled={suggestTimeSubmitting}
              >
                <Text style={styles.suggestTimeCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.suggestTimeButton,
                  styles.suggestTimeConfirmButton,
                  suggestTimeSubmitting ? styles.suggestTimeConfirmDisabled : null,
                ]}
                onPress={handleSuggestTimeConfirm}
                disabled={suggestTimeSubmitting}
              >
                <Text style={styles.suggestTimeConfirmText}>
                  {suggestTimeSubmitting ? 'Sending…' : 'Send Request'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={adjustModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleAdjustBidCancel}
      >
        <View style={styles.bidModalOverlay}>
          <View style={styles.bidModalContent}>
            <Text style={styles.bidModalTitle}>Adjust Bid</Text>
            <Text style={styles.bidModalSubtitle}>
              Original price:{' '}
              {modalService && typeof modalService.price === 'number'
                ? formatPrice(modalService.price)
                : '$0'}
            </Text>
            <View style={styles.bidInputContainer}>
              <TextInput
                style={styles.bidModalInput}
                keyboardType="decimal-pad"
                value={bidInput}
                onChangeText={setBidInput}
                placeholder="Enter your bid"
                placeholderTextColor="#7a735f"
              />
            </View>
            <View style={styles.bidModalButtonRow}>
              <Pressable style={styles.bidModalCancelButton} onPress={handleAdjustBidCancel}>
                <Text style={styles.bidModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.bidModalSaveButton} onPress={handleAdjustBidSave}>
                <Text style={styles.bidModalSaveText}>Save Bid</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

              <Modal
                visible={descriptionModalVisible}
                transparent
                animationType="fade"
                onRequestClose={closeDescriptionModal}
              >
                <View style={styles.descriptionModalOverlay}>
                  <View style={styles.descriptionModalContent}>
                    <Text style={styles.descriptionModalTitle}>Service Description</Text>
                    <View style={styles.descriptionModalBox}>
                      <ScrollView
                        style={styles.descriptionModalScroll}
                        contentContainerStyle={styles.descriptionModalScrollContent}
                        showsVerticalScrollIndicator
                      >
                        <Text style={styles.descriptionModalText}>
                          {descriptionModalService?.description?.trim() || 'No description provided.'}
                        </Text>
                      </ScrollView>
                    </View>
                    <Pressable style={styles.closeDescriptionButton} onPress={closeDescriptionModal}>
                      <Text style={styles.closeDescriptionButtonText}>Close Description</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>

      {/* Menu and Help Overlays */}
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={[styles.menuButton, { pointerEvents: 'none', backgroundColor: 'transparent' }]}>
          {Platform.OS === 'web' || !canRenderLottie ? (
            <Text style={[styles.menuIconTextLarge, { color: '#0c4309' }]}>☰</Text>
          ) : (
            <LottieView
              ref={lottieRef}
              source={require('../assets/animations/menuButtonAnimation.json')}
              autoPlay={false}
              loop={false}
              style={styles.lottieAnimationLarge}
            />
          )}
        </View>
        
        <Pressable 
          onPress={handleMenuPress} 
          style={styles.menuTogglePressable}
        />

        <View style={[styles.helpButton, { pointerEvents: 'none', backgroundColor: 'transparent' }]}>
          {Platform.OS === 'web' || !canRenderLottie ? (
            <SvgXml xml={helpIconSvg} width="20" height="20" />
          ) : (
            <LottieView
              ref={helpLottieRef}
              source={require('../assets/animations/helpButtonAnimation.json')}
              autoPlay={false}
              loop={false}
              style={styles.lottieAnimationLarge}
            />
          )}
        </View>
        
        <Pressable 
          onPress={handleHelpPress} 
          style={styles.helpTogglePressable}
        />
  
        {isMenuOpen && (
          <>
          <Pressable
            style={styles.dismissOverlay}
            onPress={() => {
              if (Platform.OS !== 'web' && lottieRef.current) {
                lottieRef.current.play(24, 0);
              }
              setIsMenuOpen(false);
            }}
          />
          <View style={styles.menuOverlay}>
            <View style={styles.menuContainer}>
              <Pressable 
                style={styles.menuItem} 
                onPress={() => {
                  setIsMenuOpen(false);
                  navigate('account');
                }}
              >
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Account</Text>
                </View>
              </Pressable>
              <Pressable 
                style={styles.menuItem} 
                onPress={() => {
                  setIsMenuOpen(false);
                  navigate('past-services');
                }}
              >
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Past Services</Text>
                </View>
              </Pressable>
            </View>
          </View>
          </>
        )}
        {isHelpMenuOpen && (
          <>
          <Pressable
            style={styles.dismissOverlay}
            onPress={() => {
              if (Platform.OS !== 'web' && helpLottieRef.current) {
                helpLottieRef.current.play(24, 0);
              }
              setIsHelpMenuOpen(false);
            }}
          />
          <View style={styles.helpMenuOverlay}>
            <View style={styles.helpMenuContainer}>
              <Pressable 
                style={styles.helpMenuItem} 
                onPress={() => {
                  setIsMenuOpen(false);
                  navigate('customer-service-chat');
                }}
              >
              <View style={styles.menuItemRow}>
                <Text style={styles.menuItemText}>Customer Service Chat</Text>
              </View>
              </Pressable>
            </View>
          </View>
          </>
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
  GreenHeaderBar:{
    backgroundColor: '#0c4309',
    height:30,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666666',
    textAlign: 'center',
    paddingBottom: 100,
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
  serviceCardWrapper: {
    marginBottom: 14,
    position: 'relative',
  },
  serviceCard: {
    backgroundColor: '#F5E7D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 2,
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
    paddingHorizontal: 25,
    paddingVertical: 3,
    marginBottom: 6,
  },
  serviceTypeText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  autoFillPill: {
    marginTop: 4,
    backgroundColor: '#0c4309',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 3,
  },
  autoFillPillText: {
    color: '#FFF8E8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pillRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 4,
  },

  serviceStatusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#A3926D',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 6,
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
    paddingRight: 0,
    // borderColor: 'red',
    // borderWidth: 1
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginTop: 2,
  },
  descriptionButton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 6,
    marginTop: 7,
    marginLeft: 4
    // borderColor: '#0c4309',
    // borderWidth: 1,
    // borderRadius: 18,
  },
  descriptionButtonText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  descriptionButtonIcon: {
    marginLeft: 6,
  },
  locationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    marginTop: 20,
  },
  locationIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    marginRight: 2,
  },
  locationText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  priceColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  confirmedPriceColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  confirmedPriceRow: {
    justifyContent: 'center',
    marginBottom: 12,
    alignItems: 'center',
  },
  priceValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
  },
  confirmedPriceValue: {
    textAlign: 'center',
  },
  priceEstimate: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0c4309',
    marginLeft: 6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0c4309',
  },
  scheduleText: {
    color: '#0c4309',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 6,
    flexShrink: 1,
  },
  requestActionButton: {
    width: '100%',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 5,
  },
  requestActionButtonSolo: {
    marginBottom: 0,
  },
  confirmedCancelButton: {
    marginBottom: 0,
  },
  requestActionButtonRequest: {
    backgroundColor: '#0c4309',
  },
  requestActionButtonCancel: {
    backgroundColor: '#C94736',
  },
  requestActionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF8E8',
  },
  adjustBidSecondaryButton: {
    width: '100%',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C0B9A6',
    backgroundColor: '#FFF8E8',
  },
  adjustBidSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0c4309',
  },
  suggestTimeBottomBanner: {
    backgroundColor: '#0c4309',
    paddingTop: 25,
    paddingBottom: 5,
    paddingHorizontal: 16,
    marginTop: -20,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    zIndex: 1,
  },
  suggestTimeBottomBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF8E8',
    letterSpacing: 0.3,
  },
  suggestTimeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  suggestTimeContent: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#F5E7D0',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  suggestTimeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 12,
  },
  suggestTimeSubtitle: {
    fontSize: 14,
    color: '#49454F',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  suggestTimeSummaryBox: {
    backgroundColor: '#FFF2DA',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#D3C7AE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  suggestTimeSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#74684F',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  suggestTimeSummaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0c4309',
  },
  inlinePickerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E8',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#D3C7AE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  inlinePickerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  inlinePickerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#74684F',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.6,
  },
  inlinePickerControl: {
    width: Platform.OS === 'ios' ? undefined : 120,
    minWidth: Platform.OS === 'ios' ? 0 : 110,
  },
  inlinePickerDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#D3C7AE',
    opacity: 0.7,
  },
  suggestTimeErrorText: {
    color: '#C94736',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  suggestTimeButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  suggestTimePickerUnsupportedText: {
    fontSize: 14,
    color: '#49454F',
    textAlign: 'center',
    marginVertical: 32,
  },
  suggestTimeButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  suggestTimeCancelButton: {
    backgroundColor: '#E5DCC9',
    marginRight: 8,
  },
  suggestTimeConfirmButton: {
    backgroundColor: '#0c4309',
    marginLeft: 8,
  },
  suggestTimeConfirmDisabled: {
    opacity: 0.7,
  },
  suggestTimeCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0c4309',
  },
  suggestTimeConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF8E8',
  },
  bidModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  bidModalContent: {
    width: '90%',
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  bidModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 8,
    textAlign: 'center',
  },
  bidModalSubtitle: {
    fontSize: 14,
    color: '#49454F',
    marginBottom: 16,
    textAlign: 'center',
  },
  bidInputContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bidModalInput: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0c4309',
    minHeight: 48,
  },
  bidModalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bidModalCancelButton: {
    flex: 1,
    backgroundColor: '#E5DCC9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  bidModalSaveButton: {
    flex: 1,
    backgroundColor: '#0c4309',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  bidModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0c4309',
  },
  bidModalSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF8E8',
  },
  descriptionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  descriptionModalContent: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#F5E7D0',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  descriptionModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 16,
  },
  descriptionModalBox: {
    backgroundColor: '#FFF8E8',
    borderRadius: 16,
    padding: 16,
    maxHeight: 260,
  },
  descriptionModalScroll: {
    maxHeight: 228,
  },
  descriptionModalScrollContent: {
    paddingBottom: 4,
  },
  descriptionModalText: {
    color: '#0c4309',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  closeDescriptionButton: {
    marginTop: 24,
    backgroundColor: '#0c4309',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeDescriptionButtonText: {
    color: '#FFF8E8',
    fontSize: 15,
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
  menuButton: {
    position: 'absolute',
    left: -380,
    bottom: -350,
    width: 900,
    height: 900,
  },
  helpButton: {
    position: 'absolute',
    left: -200,
    bottom: -305,
    width: 900,
    height: 900,
  },
  menuTogglePressable: {
    position: 'absolute',
    left: 35,
    bottom: 35,
    width: 70,
    height: 70,
    borderRadius: 70,
    backgroundColor: 'transparent',
  },
  helpTogglePressable: {
    position: 'absolute',
    right: 35,
    bottom: 35,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'transparent',
  },
  lottieAnimationLarge: {
    width: '100%',
    height: '100%',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  menuIconTextLarge: {
    fontSize: 120,
    fontWeight: 'bold',
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 998,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  menuContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginLeft: 38,
    marginBottom: 98,
  },
  helpMenuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  helpMenuContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginRight: 70,
    marginBottom: 125,
  },
  menuItem: {
    backgroundColor: 'transparent',
    paddingVertical: 17,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginVertical: 2,
    minWidth: 200,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  helpMenuItem: {
    backgroundColor: 'transparent',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 2,
    marginHorizontal: 20,
    minWidth: 90,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    color: 'transparent',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  confirmedBidValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  confirmedPill: {
    backgroundColor: '#0c4309',
    borderRadius: 18,
    paddingHorizontal: 30,
    paddingVertical: 3,
    marginTop: 3,
  },
  confirmedPillText: {
    color: '#FFF8E8',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  confirmedButtonColumn: {
    width: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  showDetailsButton: {
    width: '100%',
    paddingVertical: 22,
    backgroundColor: '#FFF8E8',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C0B9A6',
  },
  showDetailsButtonText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#0c4309',
  },
});
