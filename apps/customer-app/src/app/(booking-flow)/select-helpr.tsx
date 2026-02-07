import { useStripe } from '@stripe/stripe-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PaymentMethodModal } from '../../components/common/PaymentMethodModal';
import { PaymentSummaryModal } from '../../components/services/PaymentSummaryModal';
import type { ProviderSummary } from '../../components/services/PaymentSummaryModal/types';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { loadPaymentMethods, SavedPaymentMethodSummary, savePaymentMethod, setDefaultPaymentMethod } from '../../lib/paymentMethods';
import { supabase } from '../../lib/supabase';

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
  const [serviceName, setServiceName] = useState<string | null>(null);
  const { showModal } = useModal();
  const { user } = useAuth();
  const { confirmPayment } = useStripe();

  // Payment Summary Modal state
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ProviderRequestDisplay | null>(null);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethodSummary[]>([]);
  const [activePaymentMethodId, setActivePaymentMethodId] = useState<string | null>(null);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Payment Method Modal state (for adding new cards)
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardDetailsSnapshot, setCardDetailsSnapshot] = useState<{
    brand: string | null;
    last4: string | null;
    expiryMonth: number | null;
    expiryYear: number | null;
  } | null>(null);
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const { createPaymentMethod } = useStripe();

  const isAsapService = useMemo(() => (serviceSchedulingType ?? '').toLowerCase() === 'asap', [serviceSchedulingType]);

  // Fetch customer_id from customer table
  useEffect(() => {
    if (!user?.email) return;
    
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('customer')
          .select('customer_id')
          .eq('email', user.email)
          .maybeSingle();
        if (!cancelled && data?.customer_id) {
          setCustomerId(data.customer_id);
        }
      } catch (err) {
        console.error('Failed to fetch customer_id:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

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
        .select('scheduling_type, service_type')
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
      setServiceName(serviceRow?.service_type ?? null);

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

  // Load payment methods when user is available
  const loadUserPaymentMethods = useCallback(async () => {
    if (!user?.id) return;
    setLoadingPaymentMethods(true);
    try {
      const methods = await loadPaymentMethods(user.id);
      setSavedPaymentMethods(methods);
      // Set default payment method as active
      const defaultMethod = methods.find(m => m.isDefault);
      if (defaultMethod) {
        setActivePaymentMethodId(defaultMethod.id);
      } else if (methods.length > 0) {
        setActivePaymentMethodId(methods[0].id);
      }
    } catch (err) {
      console.error('Failed to load payment methods:', err);
    } finally {
      setLoadingPaymentMethods(false);
    }
  }, [user?.id]);

  // Handle opening the payment summary modal
  const handleOpenPaymentSummary = useCallback(async (request: ProviderRequestDisplay) => {
    setSelectedRequest(request);
    setShowPaymentSummary(true);
    await loadUserPaymentMethods();
  }, [loadUserPaymentMethods]);

  // Handle selecting a payment method
  const handleSelectPaymentMethod = useCallback((methodId: string) => {
    setActivePaymentMethodId(methodId);
    // Also set as default
    if (user?.id) {
      setDefaultPaymentMethod(user.id, methodId).catch(console.error);
    }
  }, [user?.id]);

  // Handle opening add payment modal
  const handleOpenAddPayment = useCallback(() => {
    setShowAddPaymentModal(true);
    setCardComplete(false);
    setCardDetailsSnapshot(null);
  }, []);

  // Handle saving a new payment method
  const handleSaveNewPaymentMethod = useCallback(async () => {
    if (!cardComplete || !user?.id || savingPaymentMethod) return;
    setSavingPaymentMethod(true);

    try {
      const result = await createPaymentMethod({ paymentMethodType: 'Card' });

      if (result.error || !result.paymentMethod) {
        showModal({
          title: 'Payment Method Error',
          message: result.error?.message || 'Failed to create payment method.',
        });
        return;
      }

      const brandSource = result.paymentMethod.Card?.brand ?? 'Card';
      const saved = await savePaymentMethod(
        user.id,
        result.paymentMethod.id,
        brandSource,
        cardDetailsSnapshot?.last4 ?? result.paymentMethod.Card?.last4 ?? '****',
        cardDetailsSnapshot?.expiryMonth ?? 0,
        cardDetailsSnapshot?.expiryYear ?? 0,
      );

      if (saved) {
        setSavedPaymentMethods(prev => [...prev, saved]);
        setActivePaymentMethodId(saved.id);
        setShowAddPaymentModal(false);
        setCardComplete(false);
        setCardDetailsSnapshot(null);
      }
    } catch (err) {
      console.error('Failed to save payment method:', err);
      showModal({
        title: 'Error',
        message: 'Failed to save payment method. Please try again.',
      });
    } finally {
      setSavingPaymentMethod(false);
    }
  }, [cardComplete, user?.id, savingPaymentMethod, createPaymentMethod, cardDetailsSnapshot, showModal]);

  // Handle confirming the booking with payment
  const handleConfirmBooking = useCallback(async () => {
    if (!selectedRequest || !serviceId || !activePaymentMethodId || !user?.id) return;

    setConfirming(true);

    try {
      // Find the selected payment method
      const paymentMethod = savedPaymentMethods.find(m => m.id === activePaymentMethodId);
      if (!paymentMethod) {
        showModal({
          title: 'Payment Error',
          message: 'Selected payment method not found.',
        });
        setConfirming(false);
        return;
      }

      // Ensure we have customer_id
      let resolvedCustomerId = customerId;
      if (!resolvedCustomerId) {
        const { data } = await supabase
          .from('customer')
          .select('customer_id')
          .eq('email', user.email)
          .maybeSingle();
        resolvedCustomerId = data?.customer_id ?? null;
      }

      if (!resolvedCustomerId) {
        showModal({
          title: 'Account Error',
          message: 'Unable to find your customer account. Please try again.',
        });
        setConfirming(false);
        return;
      }

      // Calculate total (base price + 3% processing fee + 1% platform fee)
      const basePrice = selectedRequest.bid;
      const processingFee = Math.round(basePrice * 0.03 * 100) / 100; // 3%
      const platformFee = Math.round(basePrice * 0.01 * 100) / 100; // 1%
      const totalAmount = Math.round((basePrice + processingFee + platformFee) * 100) / 100;

      // Create payment intent on server
      console.log('Creating payment intent with:', {
        amount: Math.round(totalAmount * 100),
        currency: 'usd',
        payment_method_id: paymentMethod.stripePaymentMethodId,
        service_id: serviceId,
        customer_id: resolvedCustomerId,
      });

      const { data: paymentIntentData, error: piError } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          amount: Math.round(totalAmount * 100), // Convert to cents
          currency: 'usd',
          payment_method_id: paymentMethod.stripePaymentMethodId,
          service_id: serviceId,
          customer_id: resolvedCustomerId,
        },
      });

      console.log('Payment intent response:', JSON.stringify(paymentIntentData, null, 2));
      console.log('Payment intent error:', piError);

      if (piError) {
        console.error('Payment intent error:', piError);
        showModal({
          title: 'Payment Failed',
          message: piError.message || 'Unable to process payment. Please try again.',
        });
        return;
      }

      // Handle different response formats from edge function
      const clientSecret = paymentIntentData?.clientSecret 
        || paymentIntentData?.client_secret 
        || paymentIntentData?.data?.clientSecret
        || paymentIntentData?.data?.client_secret;
      
      const paymentStatus = paymentIntentData?.status 
        || paymentIntentData?.data?.status;

      // Check if payment was already completed server-side (off_session)
      if (paymentStatus === 'succeeded') {
        console.log('Payment already succeeded server-side');
        // Payment already completed, continue to update service
      } else if (clientSecret) {
        // Need to confirm payment client-side
        console.log('Confirming payment with client secret');
        const { error: confirmError } = await confirmPayment(clientSecret, {
          paymentMethodType: 'Card',
          paymentMethodData: {
            paymentMethodId: paymentMethod.stripePaymentMethodId,
          },
        });

        if (confirmError) {
          console.error('Payment confirmation error:', confirmError);
          showModal({
            title: 'Payment Failed',
            message: confirmError.message || 'Payment could not be completed.',
          });
          return;
        }
      } else if (paymentIntentData?.error) {
        // Edge function returned an error
        console.error('Edge function error:', paymentIntentData.error);
        showModal({
          title: 'Payment Failed',
          message: paymentIntentData.error.message || paymentIntentData.message || 'Payment could not be processed.',
        });
        return;
      } else {
        // Unknown response format
        console.error('Unknown payment intent response format:', paymentIntentData);
        showModal({
          title: 'Payment Failed',
          message: 'Unexpected response from payment server.',
        });
        return;
      }

      // Payment successful - now update the service
      const { data: fillRequestData, error: fetchError } = await supabase
        .from('service_fill_request')
        .select('proposed_date_time')
        .eq('service_id', serviceId)
        .eq('service_provider_id', selectedRequest.service_provider_id)
        .single();

      if (fetchError) {
        console.error('Failed to fetch fill request:', fetchError);
      }

      const updateData: {
        service_provider_id: string;
        status: string;
        price: number;
        scheduled_date_time?: string;
        payment_status: string;
      } = {
        service_provider_id: selectedRequest.service_provider_id,
        status: 'confirmed',
        price: selectedRequest.bid,
        payment_status: 'paid',
      };

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
      }

      setShowPaymentSummary(false);
      setSelectedRequest(null);

      router.replace({
        pathname: '/(booking-flow)/booked-services' as any,
        params: {
          serviceId,
          showConfirmedModal: 'true',
          helprFirstName: selectedRequest.firstName,
        },
      });
    } catch (err) {
      console.error('Failed to confirm booking:', err);
      showModal({
        title: 'Booking Failed',
        message: 'Unable to complete booking. Please try again.',
      });
    } finally {
      setConfirming(false);
    }
  }, [selectedRequest, serviceId, activePaymentMethodId, user?.id, savedPaymentMethods, confirmPayment, showModal]);

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
          pathname: '/(booking-flow)/booked-services' as any,
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
                        style={styles.selectButton}
                        onPress={() => handleOpenPaymentSummary(request)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${request.firstName}`}
                        accessibilityHint="Opens payment confirmation for this Helpr"
                      >
                        <Text style={styles.selectButtonText}>Select</Text>
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
                              style={styles.selectButton}
                              onPress={() => handleOpenPaymentSummary(request)}
                              accessibilityRole="button"
                              accessibilityLabel={`Select ${request.firstName}`}
                              accessibilityHint="Opens payment confirmation for this Helpr"
                            >
                              <Text style={styles.selectButtonText}>Select</Text>
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
      <Pressable style={styles.backButton} onPress={() => router.push('/(booking-flow)/booked-services' as any)}>
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

      {/* Payment Summary Modal */}
      <PaymentSummaryModal
        visible={showPaymentSummary}
        onClose={() => {
          setShowPaymentSummary(false);
          setSelectedRequest(null);
        }}
        onConfirm={handleConfirmBooking}
        provider={selectedRequest ? {
          firstName: selectedRequest.firstName,
          fullName: selectedRequest.fullName,
          profileImageUrl: selectedRequest.profileImageUrl,
          initials: selectedRequest.initials,
          rating: selectedRequest.rating,
        } as ProviderSummary : null}
        price={selectedRequest?.bid ?? 0}
        serviceName={serviceName ?? undefined}
        scheduledDateTime={selectedRequest?.proposedDateTimeLabel ?? undefined}
        savedPaymentMethods={savedPaymentMethods}
        activePaymentMethodId={activePaymentMethodId}
        onSelectPaymentMethod={handleSelectPaymentMethod}
        onAddPaymentMethod={handleOpenAddPayment}
        loading={loadingPaymentMethods}
        confirming={confirming}
        showModal={showModal}
      />

      {/* Payment Method Modal (for adding new cards) */}
      <PaymentMethodModal
        visible={showAddPaymentModal}
        onClose={() => {
          setShowAddPaymentModal(false);
          setCardComplete(false);
          setCardDetailsSnapshot(null);
        }}
        savedPaymentMethods={[]}
        activePaymentMethodId={null}
        onSelectPaymentMethod={() => {}}
        showAddForm={true}
        setShowAddForm={() => {}}
        cardComplete={cardComplete}
        setCardComplete={setCardComplete}
        setCardDetailsSnapshot={(details) => setCardDetailsSnapshot(details ? {
          brand: details.brand ?? null,
          last4: details.last4 ?? null,
          expiryMonth: details.expiryMonth ?? null,
          expiryYear: details.expiryYear ?? null,
        } : null)}
        onSavePaymentMethod={handleSaveNewPaymentMethod}
        loading={false}
        saving={savingPaymentMethod}
        showModal={showModal}
      />
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
