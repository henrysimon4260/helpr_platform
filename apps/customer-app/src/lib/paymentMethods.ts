import { supabase } from './supabase';

export type SavedPaymentMethodSummary = {
  id: string;
  user_id: string;
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

const TABLE_NAME = 'payment_methods';

const mapRowToSummary = (row: Record<string, any>): SavedPaymentMethodSummary => {
  const expMonth = row.expiry_month ?? row.exp_month;
  const expYear = row.expiry_year ?? row.exp_year;

  return {
    id: row.id,
    user_id: row.user_id,
    stripePaymentMethodId: row.stripe_pm_id,
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

export const loadPaymentMethods = async (user_id: string): Promise<SavedPaymentMethodSummary[]> => {
  if (!user_id) {
    return [];
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(
      'id, user_id, stripe_pm_id, brand, last4, exp_month, exp_year, is_default, created_at',
    )
    .eq('user_id', user_id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load payment methods', error);
    throw error;
  }

  return (data ?? []).map(mapRowToSummary);
};

export const savePaymentMethod = async (
  user_id: string,
  stripePaymentMethodId: string,
  brand: string,
  last4: string,
  expMonth: number,
  expYear: number,
  isDefault: boolean = false,
): Promise<SavedPaymentMethodSummary | null> => {
  if (!user_id) {
    return null;
  }

  // If this method should be default, clear previous defaults first
  if (isDefault) {
    const { error: clearError } = await supabase
      .from(TABLE_NAME)
      .update({ is_default: false })
      .eq('user_id', user_id);

    if (clearError) {
      console.error('Failed to clear default payment methods', clearError);
      throw clearError;
    }
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      user_id: user_id,
      stripe_pm_id: stripePaymentMethodId,
      brand,
      last4,
      exp_month: expMonth,
      exp_year: expYear,
      is_default: isDefault,
    })
    .select(
      'id, user_id, stripe_pm_id, brand, last4, exp_month, exp_year, is_default, created_at',
    )
    .single();

  if (error) {
    console.error('Failed to save payment method', error);
    throw error;
  }

  return data ? mapRowToSummary(data) : null;
};

export const setDefaultPaymentMethod = async (
  user_id: string,
  paymentMethodId: string,
): Promise<boolean> => {
  if (!user_id || !paymentMethodId) {
    return false;
  }

  const { error: clearError } = await supabase
    .from(TABLE_NAME)
    .update({ is_default: false })
    .eq('user_id', user_id);

  if (clearError) {
    console.error('Failed to clear default flags', clearError);
    return false;
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ is_default: true })
    .eq('user_id', user_id)
    .eq('id', paymentMethodId);

  if (error) {
    console.error('Failed to set default payment method', error);
    return false;
  }

  return true;
};
