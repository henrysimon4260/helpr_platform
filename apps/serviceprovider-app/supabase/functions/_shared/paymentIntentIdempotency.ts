export const SAME_ATTEMPT_WINDOW_SECONDS = 20;

export type PaymentIntentSnapshot = {
  id: string;
  status: string;
  created?: number;
  amount?: number;
  amount_refunded?: number | null;
  amount_received?: number | null;
  client_secret?: string | null;
  chargePath?: string | null;
  metadataProviderId?: string | null;
};

export type ChargeReuseDecision = 'reuse' | 'replace' | 'create';

export class PaymentIntentCreateError extends Error {
  paymentIntentId: string | null;
  idempotencyMismatch: boolean;

  constructor(message: string, paymentIntentId: string | null, idempotencyMismatch = false) {
    super(message);
    this.name = 'PaymentIntentCreateError';
    this.paymentIntentId = paymentIntentId;
    this.idempotencyMismatch = idempotencyMismatch;
  }
}

/**
 * Ids that are safe inside a Stripe Idempotency-Key and a metadata search query.
 * Rejects quotes and spaces so a client-supplied id cannot change the query.
 */
export function idempotencyKeySegment(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(trimmed)) return null;
  return trimmed;
}

export function confirmChargeIdempotencyKey(serviceId: string): string {
  return `helpr-confirm-${serviceId}`;
}

export function autofillChargeIdempotencyKey(serviceId: string, providerId: string): string {
  return `helpr-autofill-${serviceId}-${providerId}`;
}

export function idempotencyKeyAfter(baseKey: string, priorPaymentIntentId: string): string {
  return `${baseKey}-after-${priorPaymentIntentId}`;
}

export function isFullyRefunded(intent: {
  status?: string | null;
  amount_refunded?: number | null;
  amount_received?: number | null;
}): boolean {
  if (intent.status !== 'succeeded') return false;
  const refunded = intent.amount_refunded ?? 0;
  if (refunded <= 0) return false;
  const received = intent.amount_received ?? 0;
  if (received <= 0) return true;
  return refunded >= received;
}

/**
 * reuse: return this PaymentIntent and do not create another charge.
 * replace: canceled or fully refunded, or a card attempt that did not succeed.
 * create: nothing to reuse.
 */
export function chargeReuseDecision(existing: {
  id?: string | null;
  status?: string | null;
  amount_refunded?: number | null;
  amount_received?: number | null;
} | null | undefined): ChargeReuseDecision {
  if (!existing?.id || !existing.status) return 'create';
  if (existing.status === 'canceled' || isFullyRefunded(existing)) return 'replace';
  if (existing.status === 'requires_payment_method') return 'replace';
  return 'reuse';
}

/**
 * A canceled or fully refunded PaymentIntent can be replaced immediately.
 * A card decline stays on the original idempotency key during the same-attempt
 * window so a double-tap cannot start a second charge. A later retry may.
 */
export function shouldRotateUnusablePaymentIntent(
  snapshot: PaymentIntentSnapshot,
  nowUnix: number,
): boolean {
  if (chargeReuseDecision(snapshot) !== 'replace') return false;
  if (snapshot.status === 'canceled' || isFullyRefunded(snapshot)) return true;
  if (snapshot.status !== 'requires_payment_method') return false;
  if (typeof snapshot.created !== 'number') return false;
  return nowUnix - snapshot.created >= SAME_ATTEMPT_WINDOW_SECONDS;
}

export function pickReusablePaymentIntent(
  candidates: PaymentIntentSnapshot[],
  amountCents?: number,
): PaymentIntentSnapshot | null {
  const reusable = candidates.filter((candidate) => chargeReuseDecision(candidate) === 'reuse');
  if (reusable.length === 0) return null;

  const pool = typeof amountCents === 'number'
    ? reusable.filter((candidate) => candidate.amount === amountCents)
    : reusable;
  const chosen = pool.length > 0 ? pool : reusable;

  return [...chosen].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0] ?? null;
}

/**
 * When two charges race, keep the PaymentIntent already stored on the service
 * and release the extra one. A dead stored id is not preferred.
 */
export function preferredPaymentIntentId(input: {
  createdId: string;
  storedId: string | null;
  storedReusable: boolean;
}): { returnId: string; releaseId: string | null } {
  if (input.storedId && input.storedId !== input.createdId && input.storedReusable) {
    return { returnId: input.storedId, releaseId: input.createdId };
  }
  return { returnId: input.createdId, releaseId: null };
}

/**
 * AutoFill must not reuse another provider's charge, and must not create a
 * second charge when this provider already has a reusable one stored.
 */
const OPEN_JOB_STATUSES = new Set([
  'finding_pros',
  'pending',
  'scheduled',
  'select_service_provider',
]);

/**
 * A second AutoFill claim from the same provider can see the shared
 * PaymentIntent before the first claim writes it. Voiding during that window
 * refunds the only charge. A different provider's lost race is still voided.
 */
export function shouldDeferSameProviderVoid(input: {
  metadataProviderId?: string | null;
  callerId?: string | null;
  serviceProviderId?: string | null;
  status?: string | null;
  createdUnix?: number | null;
  nowUnix: number;
}): boolean {
  if (!input.metadataProviderId || !input.callerId) return false;
  if (input.metadataProviderId !== input.callerId) return false;
  if (input.serviceProviderId) return false;
  const status = (input.status ?? '').toLowerCase();
  if (!OPEN_JOB_STATUSES.has(status)) return false;
  if (typeof input.createdUnix !== 'number') return false;
  return input.nowUnix - input.createdUnix < SAME_ATTEMPT_WINDOW_SECONDS;
}

export function autofillStoredIntentAction(input: {
  providerId: string;
  metadataProviderId?: string | null;
  decision: ChargeReuseDecision;
}): 'reuse' | 'ignore' | 'conflict' {
  if (input.decision !== 'reuse') return 'ignore';
  if (input.metadataProviderId === input.providerId) return 'reuse';
  return 'conflict';
}

export type PaymentIntentResolver = {
  retrieve: (id: string) => Promise<PaymentIntentSnapshot | null>;
  searchReusable: () => Promise<PaymentIntentSnapshot | null>;
  create: (idempotencyKey: string) => Promise<PaymentIntentSnapshot>;
};

export async function resolveIdempotentPaymentIntent(input: {
  serviceId: string;
  providerId?: string | null;
  storedPaymentIntentId?: string | null;
  useSavedPaymentMethod: boolean;
  nowUnix: number;
  resolver: PaymentIntentResolver;
}): Promise<PaymentIntentSnapshot> {
  const serviceId = idempotencyKeySegment(input.serviceId);
  if (!serviceId) {
    throw new PaymentIntentCreateError('service_id is not valid for an idempotent charge', null, false);
  }

  const providerId = input.useSavedPaymentMethod
    ? idempotencyKeySegment(input.providerId)
    : null;
  if (input.useSavedPaymentMethod && !providerId) {
    throw new PaymentIntentCreateError('Missing provider for AutoFill charge', null, false);
  }

  const baseKey = input.useSavedPaymentMethod
    ? autofillChargeIdempotencyKey(serviceId, providerId as string)
    : confirmChargeIdempotencyKey(serviceId);

  if (input.storedPaymentIntentId) {
    const stored = await input.resolver.retrieve(input.storedPaymentIntentId);
    if (stored && chargeReuseDecision(stored) === 'reuse') {
      return stored;
    }
  }

  const orphan = await input.resolver.searchReusable();
  if (orphan && chargeReuseDecision(orphan) === 'reuse') {
    return orphan;
  }

  let key = baseKey;
  if (input.storedPaymentIntentId) {
    const stored = await input.resolver.retrieve(input.storedPaymentIntentId);
    if (stored && shouldRotateUnusablePaymentIntent(stored, input.nowUnix)) {
      key = idempotencyKeyAfter(baseKey, stored.id);
    }
  }

  return createWithOptionalRotation(input.resolver, baseKey, key, input.nowUnix, true);
}

async function createWithOptionalRotation(
  resolver: PaymentIntentResolver,
  baseKey: string,
  key: string,
  nowUnix: number,
  allowRotate: boolean,
): Promise<PaymentIntentSnapshot> {
  try {
    const created = await resolver.create(key);
    const fresh = (await resolver.retrieve(created.id)) ?? created;
    if (chargeReuseDecision(fresh) === 'replace') {
      if (allowRotate && shouldRotateUnusablePaymentIntent(fresh, nowUnix)) {
        return createWithOptionalRotation(
          resolver,
          baseKey,
          idempotencyKeyAfter(baseKey, fresh.id),
          nowUnix,
          false,
        );
      }
      throw new PaymentIntentCreateError('Payment could not be completed', fresh.id, false);
    }
    return fresh;
  } catch (error) {
    if (!(error instanceof PaymentIntentCreateError)) throw error;

    if (error.idempotencyMismatch) {
      const again = await resolver.searchReusable();
      if (again && chargeReuseDecision(again) === 'reuse') return again;
      throw error;
    }

    if (error.paymentIntentId) {
      const fresh = await resolver.retrieve(error.paymentIntentId);
      if (fresh && chargeReuseDecision(fresh) === 'reuse') return fresh;
      if (fresh && allowRotate && shouldRotateUnusablePaymentIntent(fresh, nowUnix)) {
        return createWithOptionalRotation(
          resolver,
          baseKey,
          idempotencyKeyAfter(baseKey, fresh.id),
          nowUnix,
          false,
        );
      }
    }

    throw error;
  }
}
