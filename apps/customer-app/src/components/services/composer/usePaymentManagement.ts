import { useStripe } from '@stripe/stripe-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadPaymentMethods, SavedPaymentMethodSummary, savePaymentMethod, setDefaultPaymentMethod } from '../../../lib/paymentMethods';

interface PaymentManagementProps {
  user: { id?: string } | null;
  showModal: (config: { title: string; message: string }) => void;
}

export function usePaymentManagement({ user, showModal }: PaymentManagementProps) {
  const { createPaymentMethod } = useStripe();
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethodSummary[]>([]);
  const [activePaymentMethodId, setActivePaymentMethodId] = useState<string | null>(null);
  const [showAddPaymentForm, setShowAddPaymentForm] = useState(false);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardDetailsSnapshot, setCardDetailsSnapshot] = useState<{
    brand?: string | null;
    last4?: string | null;
    expiryMonth?: number | null;
    expiryYear?: number | null;
  } | null>(null);

  const activePaymentMethod = useMemo(() => {
    if (activePaymentMethodId) {
      return savedPaymentMethods.find(m => m.id === activePaymentMethodId) ?? null;
    }
    const defaultMethod = savedPaymentMethods.find(m => m.isDefault);
    return defaultMethod ?? savedPaymentMethods[0] ?? null;
  }, [activePaymentMethodId, savedPaymentMethods]);

  const loadSavedPaymentMethods = useCallback(async (): Promise<SavedPaymentMethodSummary[]> => {
    if (paymentMethodsLoaded) return [];
    if (!user?.id) return [];

    setLoadingPaymentMethods(true);
    try {
      const methods = await loadPaymentMethods(user.id);
      setSavedPaymentMethods(methods);
      setPaymentMethodsLoaded(true);

      const defaultMethod = methods.find(m => m.isDefault);
      if (defaultMethod && !activePaymentMethodId) {
        setActivePaymentMethodId(defaultMethod.id);
      }

      return methods;
    } catch {
      return [];
    } finally {
      setLoadingPaymentMethods(false);
    }
  }, [paymentMethodsLoaded, user, activePaymentMethodId]);

  const openPaymentModal = useCallback(async () => {
    const methods = await loadSavedPaymentMethods();
    setShowAddPaymentForm(methods.length === 0);
    setPaymentModalVisible(true);
  }, [loadSavedPaymentMethods]);

  const closePaymentModal = useCallback(() => {
    setPaymentModalVisible(false);
    setShowAddPaymentForm(false);
    setCardComplete(false);
    setCardDetailsSnapshot(null);
  }, []);

  const handleSelectPaymentMethod = useCallback(async (methodId: string) => {
    setActivePaymentMethodId(methodId);
    if (user?.id) {
      const success = await setDefaultPaymentMethod(user.id, methodId);
      if (success) {
        setSavedPaymentMethods(prev => prev.map(m => ({ ...m, isDefault: m.id === methodId })));
      }
    }
    closePaymentModal();
  }, [closePaymentModal, user]);

  const normalizeCardBrand = (brand: string): string => {
    const brandMap: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      jcb: 'JCB',
    };
    return brandMap[brand.toLowerCase().trim()] || brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const handleSavePaymentMethod = useCallback(async (isDefault: boolean = false) => {
    if (!cardComplete || !user?.id) {
      showModal({ title: 'Cannot Save', message: 'Please complete the card details.' });
      return;
    }

    if (savingPaymentMethod) return;
    setSavingPaymentMethod(true);

    try {
      const result = await createPaymentMethod({ paymentMethodType: 'Card' });

      if (result.error || !result.paymentMethod) {
        showModal({ title: 'Payment Method Error', message: result.error?.message || 'Failed to create payment method with Stripe.' });
        return;
      }

      const brandSource = result.paymentMethod.Card?.brand ?? 'Card';
      const savedMethod = await savePaymentMethod(
        user.id,
        result.paymentMethod.id,
        normalizeCardBrand(brandSource),
        result.paymentMethod.Card?.last4 ?? '0000',
        result.paymentMethod.Card?.expMonth ?? 12,
        result.paymentMethod.Card?.expYear ?? new Date().getFullYear() + 3,
        isDefault,
      );

      if (savedMethod) {
        if (isDefault) {
          setSavedPaymentMethods(prev => [...prev.map(m => ({ ...m, isDefault: false })), { ...savedMethod, isDefault: true }]);
        } else {
          setSavedPaymentMethods(prev => [...prev, savedMethod]);
        }
        setActivePaymentMethodId(savedMethod.id);
        setShowAddPaymentForm(false);
        setCardComplete(false);
        setCardDetailsSnapshot(null);
        closePaymentModal();
        showModal({ title: 'Payment Method Saved', message: 'Your payment method has been securely saved.' });
      } else {
        showModal({ title: 'Save Failed', message: 'Failed to save payment method to database.' });
      }
    } catch (error) {
      showModal({ title: 'Error', message: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setSavingPaymentMethod(false);
    }
  }, [cardComplete, user, createPaymentMethod, showModal, closePaymentModal, savingPaymentMethod]);

  useEffect(() => {
    if (!user) {
      if (paymentMethodsLoaded || savedPaymentMethods.length > 0 || activePaymentMethodId) {
        setPaymentMethodsLoaded(false);
        setSavedPaymentMethods([]);
        setActivePaymentMethodId(null);
      }
      return;
    }
    if (paymentMethodsLoaded) return;
    loadSavedPaymentMethods();
  }, [user, paymentMethodsLoaded, savedPaymentMethods.length, activePaymentMethodId, loadSavedPaymentMethods]);

  return {
    paymentModalVisible,
    savedPaymentMethods,
    activePaymentMethodId,
    activePaymentMethod,
    showAddPaymentForm,
    setShowAddPaymentForm,
    loadingPaymentMethods,
    savingPaymentMethod,
    cardComplete,
    setCardComplete,
    cardDetailsSnapshot,
    setCardDetailsSnapshot,
    openPaymentModal,
    closePaymentModal,
    handleSelectPaymentMethod,
    handleSavePaymentMethod,
  };
}
