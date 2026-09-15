import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { SavedPaymentMethodSummary } from '../../../lib/paymentMethods';
import { supabase } from '../../../lib/supabase';
import { LocationMode, SelectedLocation } from './types';
import { containsStreetNumber, createUuid, isWithinServiceArea } from './utils';

interface ServiceSubmissionProps {
  user: { email?: string | null } | null;
  description: string;
  locationMode: LocationMode;
  startLocation: SelectedLocation | null;
  endLocation: SelectedLocation | null;
  priceQuote: string | null;
  isAuto: boolean;
  isPersonal: boolean;
  serviceType: string;
  activePaymentMethod: SavedPaymentMethodSummary | null;
  showModal: (config: { title: string; message: string; onDismiss?: () => void }) => void;
  setShowSignInModal: (v: boolean) => void;
  preserveFormForAuth: () => void;
  editServiceId?: string;
}

export function useServiceSubmission({
  user,
  description,
  locationMode,
  startLocation,
  endLocation,
  priceQuote,
  isAuto,
  isPersonal,
  serviceType,
  activePaymentMethod,
  showModal,
  setShowSignInModal,
  preserveFormForAuth,
  editServiceId,
}: ServiceSubmissionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) {
      setCustomerId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('customer').select('customer_id').eq('email', user.email).maybeSingle();
        if (!cancelled && data?.customer_id) setCustomerId(data.customer_id);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  const handleSchedule = useCallback(async () => {
    if (isSubmitting) return;

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      showModal({ title: 'Add a description', message: 'Please describe what you need help with.' });
      return;
    }

    if (locationMode === 'dual') {
      if (!startLocation || !endLocation) {
        showModal({ title: 'Add locations', message: 'Please provide both start and end locations.' });
        return;
      }
      if (!isWithinServiceArea(startLocation.coordinate) || !isWithinServiceArea(endLocation.coordinate)) {
        showModal({ title: "We're not in your area yet.", message: "Helpr currently operates in NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ." });
        return;
      }
      if (!containsStreetNumber(startLocation.description) || !containsStreetNumber(endLocation.description)) {
        showModal({ title: 'Add street numbers', message: 'Update locations to include street numbers before scheduling.' });
        return;
      }
    } else {
      if (!startLocation) {
        showModal({ title: 'Add a location', message: 'Please provide a location.' });
        return;
      }
      if (!isWithinServiceArea(startLocation.coordinate)) {
        showModal({ title: "We're not in your area yet.", message: "Helpr currently operates in NYC's five boroughs, Westchester County, and Hudson & Bergen counties in NJ." });
        return;
      }
      if (!containsStreetNumber(startLocation.description)) {
        showModal({ title: 'Add street number', message: 'Update your location to include the street number before scheduling.' });
        return;
      }
    }

    const priceDigitsRaw = priceQuote?.replace(/[^0-9.]/g, '') ?? '';
    const priceValue = priceDigitsRaw.length > 0 ? Number(priceDigitsRaw) : null;
    if (!Number.isFinite(priceValue ?? NaN)) {
      showModal({ title: 'Estimate needed', message: 'Request a quick price estimate before scheduling.' });
      return;
    }

    if (!user) {
      preserveFormForAuth();
      setShowSignInModal(true);
      return;
    }

    if (!activePaymentMethod) {
      showModal({ title: 'Payment Method Required', message: 'Please add a payment method before scheduling.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedCustomerId = customerId || (await (async () => {
        const { data } = await supabase.from('customer').select('customer_id').eq('email', user.email).maybeSingle();
        return data?.customer_id ?? null;
      })());

      if (!resolvedCustomerId) {
        showModal({ title: 'Account issue', message: 'We could not find your customer profile.' });
        return;
      }

      const paymentMethodType = isPersonal ? 'Personal' : 'Business';
      const autofillType = isAuto ? 'AutoFill' : 'Custom';

      if (editServiceId) {
        const updatePayload: Record<string, unknown> = {
          price: priceValue,
          payment_method_type: paymentMethodType,
          autofill_type: autofillType,
          description: trimmedDescription,
        };
        if (locationMode === 'dual') {
          updatePayload.start_location = startLocation?.description ?? null;
          updatePayload.end_location = endLocation?.description ?? null;
        } else {
          updatePayload.location = startLocation?.description ?? null;
        }

        const { error } = await supabase.from('service').update(updatePayload).eq('service_id', editServiceId);
        if (error) {
          showModal({ title: 'Update failed', message: 'Unable to save changes to your request. Please try again.' });
          return;
        }

        router.push({
          pathname: '/(booking-flow)/booked-services' as any,
          params: { serviceId: editServiceId },
        });
        return;
      }

      const payload: Record<string, unknown> = {
        service_id: createUuid(),
        customer_id: resolvedCustomerId,
        date_of_creation: new Date().toISOString(),
        service_type: serviceType,
        status: 'finding_pros',
        scheduling_type: null,
        price: priceValue,
        start_datetime: null,
        end_datetime: null,
        payment_method_type: paymentMethodType,
        autofill_type: autofillType,
        service_provider_id: null,
        scheduled_date_time: null,
        description: trimmedDescription,
      };

      if (locationMode === 'dual') {
        payload.location = null;
        payload.start_location = startLocation?.description ?? null;
        payload.end_location = endLocation?.description ?? null;
      } else {
        payload.location = startLocation?.description ?? null;
      }

      router.push({
        pathname: '/(booking-flow)/booked-services' as any,
        params: {
          showOverlay: 'true',
          temporaryService: encodeURIComponent(JSON.stringify(payload)),
          requiresPayment: 'true',
        },
      });
    } catch {
      showModal({ title: 'Scheduling failed', message: 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    description,
    locationMode,
    startLocation,
    endLocation,
    priceQuote,
    user,
    activePaymentMethod,
    customerId,
    isPersonal,
    isAuto,
    serviceType,
    showModal,
    setShowSignInModal,
    preserveFormForAuth,
    editServiceId,
  ]);

  return { isSubmitting, handleSchedule };
}
