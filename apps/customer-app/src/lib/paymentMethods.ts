import { supabase } from './supabase';

export type SavedPaymentMethodSummary = {
  id: string;
  customerId: string;
  stripePaymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  createdAt?: string | null;
};

const TABLE_NAME = 'customer_payment_methods';

const mapRowToSummary = (row: Record<string, any>): SavedPaymentMethodSummary => {
  const expMonth = row.expiry_month ?? row.exp_month;
  const expYear = row.expiry_year ?? row.exp_year;

  return {
    id: row.id,
    customerId: row.customer_id,
    stripePaymentMethodId: row.stripe_payment_method_id,
    brand: row.brand,
    last4: row.last4,
    expMonth,
    expYear,
    expiryMonth: expMonth,
    expiryYear: expYear,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at ?? null,
  };
};

export const loadPaymentMethods = async (customerId: string): Promise<SavedPaymentMethodSummary[]> => {
  if (!customerId) {
    return [];
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(
      'id, customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, created_at',
    )
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load payment methods', error);
    throw error;
  }

  return (data ?? []).map(mapRowToSummary);
};

export const savePaymentMethod = async (
  customerId: string,
  stripePaymentMethodId: string,
  brand: string,
  last4: string,
  expMonth: number,
  expYear: number,
): Promise<SavedPaymentMethodSummary | null> => {
  if (!customerId) {
    return null;
  }

  // Ensure this method becomes the default by clearing previous defaults first
  const { error: clearError } = await supabase
    .from(TABLE_NAME)
    .update({ is_default: false })
    .eq('customer_id', customerId);

  if (clearError) {
    console.error('Failed to clear default payment methods', clearError);
    throw clearError;
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      customer_id: customerId,
      stripe_payment_method_id: stripePaymentMethodId,
      brand,
      last4,
      exp_month: expMonth,
      exp_year: expYear,
      is_default: true,
    })
    .select(
      'id, customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, created_at',
    )
    .single();

  if (error) {
    console.error('Failed to save payment method', error);
    throw error;
  }

  return data ? mapRowToSummary(data) : null;
};

export const setDefaultPaymentMethod = async (
  customerId: string,
  paymentMethodId: string,
): Promise<boolean> => {
  if (!customerId || !paymentMethodId) {
    return false;
  }

  const { error: clearError } = await supabase
    .from(TABLE_NAME)
    .update({ is_default: false })
    .eq('customer_id', customerId);

  if (clearError) {
    console.error('Failed to clear default flags', clearError);
    return false;
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ is_default: true })
    .eq('customer_id', customerId)
    .eq('id', paymentMethodId);

  if (error) {
    console.error('Failed to set default payment method', error);
    return false;
  }

  return true;
};
