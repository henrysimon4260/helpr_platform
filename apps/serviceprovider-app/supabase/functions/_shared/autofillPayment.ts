type PaymentIntentResponse = {
  paymentIntentId?: unknown;
  payment_intent_id?: unknown;
  status?: unknown;
  data?: {
    paymentIntentId?: unknown;
    payment_intent_id?: unknown;
    status?: unknown;
  } | null;
} | null | undefined;

export type AutoFillConfirmUpdate = {
  service_provider_id: string;
  status: 'confirmed';
  price: number;
  scheduling_type: 'scheduled';
  scheduled_date_time: string | null;
  payment_status: 'paid';
  payment_intent_id: string;
};

const WORKABLE_STATUSES = new Set(['confirmed', 'helpr_otw', 'in_progress', 'completed']);

/**
 * Same cents math as customer select-helpr: bid + 3% processing + 1% platform.
 * Returns null when the bid cannot be charged.
 */
export function bookingChargeCents(basePrice: number): number | null {
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return null;
  }

  const processingFee = Math.round(basePrice * 0.03 * 100) / 100;
  const platformFee = Math.round(basePrice * 0.01 * 100) / 100;
  const totalAmount = Math.round((basePrice + processingFee + platformFee) * 100) / 100;
  const cents = Math.round(totalAmount * 100);

  if (!Number.isInteger(cents) || cents <= 0) {
    return null;
  }

  return cents;
}

export function parseBidDollars(bid: unknown): number | null {
  if (typeof bid === 'number' && Number.isFinite(bid)) {
    return bid;
  }

  if (typeof bid === 'string') {
    const cleaned = bid.replace(/[^0-9.]/g, '');
    if (!cleaned) {
      return null;
    }
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

/**
 * Stripe PaymentIntent id from create-payment-intent.
 * Returned only as a non-empty string so AutoFill can store service.payment_intent_id.
 */
export function readPaymentIntentId(
  paymentIntentData: PaymentIntentResponse,
  confirmedPaymentIntentId?: string | null,
): string | null {
  const candidates = [
    paymentIntentData?.paymentIntentId,
    paymentIntentData?.payment_intent_id,
    paymentIntentData?.data?.paymentIntentId,
    paymentIntentData?.data?.payment_intent_id,
    confirmedPaymentIntentId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

export function readPaymentStatus(paymentIntentData: PaymentIntentResponse): string | null {
  const candidates = [
    paymentIntentData?.status,
    paymentIntentData?.data?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

/**
 * Confirm payload for an AutoFill claim. Null unless a real PaymentIntent id exists,
 * so the caller cannot mark the job confirmed unpaid.
 */
export function buildAutoFillConfirmUpdate(input: {
  providerId: string;
  price: number;
  paymentIntentId: string | null | undefined;
  scheduledDateTime: string | null;
}): AutoFillConfirmUpdate | null {
  if (typeof input.paymentIntentId !== 'string' || input.paymentIntentId.length === 0) {
    return null;
  }

  if (!input.providerId || !Number.isFinite(input.price) || input.price <= 0) {
    return null;
  }

  return {
    service_provider_id: input.providerId,
    status: 'confirmed',
    price: input.price,
    scheduling_type: 'scheduled',
    scheduled_date_time: input.scheduledDateTime,
    payment_status: 'paid',
    payment_intent_id: input.paymentIntentId,
  };
}

export function pickSavedPaymentMethodId(
  rows: Array<{ stripe_pm_id?: unknown; is_default?: unknown; created_at?: unknown }>,
): string | null {
  const usable = rows.filter(
    (row): row is { stripe_pm_id: string; is_default?: unknown; created_at?: unknown } =>
      typeof row.stripe_pm_id === 'string' && row.stripe_pm_id.length > 0,
  );

  usable.sort((a, b) => {
    const aDefault = a.is_default === true ? 1 : 0;
    const bDefault = b.is_default === true ? 1 : 0;
    if (aDefault !== bDefault) {
      return bDefault - aDefault;
    }
    const aTime = typeof a.created_at === 'string' ? a.created_at : '';
    const bTime = typeof b.created_at === 'string' ? b.created_at : '';
    return aTime.localeCompare(bTime);
  });

  return usable[0]?.stripe_pm_id ?? null;
}

export function authUserIdsForEmail(payload: unknown, email: string): string[] {
  const target = email.trim().toLowerCase();
  if (!target) {
    return [];
  }

  const users = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { users?: unknown }).users)
      ? (payload as { users: unknown[] }).users
      : [];

  const ids: string[] = [];
  for (const user of users) {
    if (!user || typeof user !== 'object') {
      continue;
    }
    const record = user as { email?: unknown; id?: unknown };
    if (typeof record.email !== 'string' || typeof record.id !== 'string' || record.id.length === 0) {
      continue;
    }
    if (record.email.trim().toLowerCase() === target) {
      ids.push(record.id);
    }
  }

  return ids;
}

/**
 * A captured or authorized PaymentIntent may be released when it is not already
 * the payment on a workable job. The winner's id is left alone.
 */
export function canVoidUnclaimedPayment(
  service: { status?: string | null; payment_intent_id?: string | null },
  paymentIntentId: string,
): boolean {
  if (!paymentIntentId) {
    return false;
  }

  const status = (service.status ?? '').toLowerCase();
  const attached = service.payment_intent_id === paymentIntentId;
  if (attached && WORKABLE_STATUSES.has(status)) {
    return false;
  }

  return true;
}

export function unclaimedPaymentRelease(
  status: string,
): 'refund' | 'cancel' | 'none' | 'unsupported' {
  if (status === 'succeeded') {
    return 'refund';
  }
  if (status === 'canceled') {
    return 'none';
  }
  if (
    status === 'requires_payment_method'
    || status === 'requires_confirmation'
    || status === 'requires_action'
    || status === 'requires_capture'
  ) {
    return 'cancel';
  }
  return 'unsupported';
}

export function readStripePaymentIntentId(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const record = error as {
    payment_intent?: { id?: unknown };
    raw?: { payment_intent?: { id?: unknown } };
  };
  const candidates = [record.payment_intent?.id, record.raw?.payment_intent?.id];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

export function isAlreadyRefunded(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { code?: unknown }).code === 'charge_already_refunded';
}
