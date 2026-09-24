/**
 * HLP-34: thread the composer `requiresPayment` draft flag onto the booked service.
 *
 * Storage is the existing `service.payment_status` column (`requires_payment`),
 * not a new capture model. `paid` stays the post-charge value written by select-helpr.
 */

export const PAYMENT_STATUS_REQUIRES_PAYMENT = 'requires_payment';
export const PAYMENT_STATUS_PAID = 'paid';

export type PaymentGate = 'payment_required' | 'open';
export type ConfirmAction = 'payment' | 'free';
export type RequiresPaymentFlag = 'true' | 'false' | 'unset';

export type ServicePaymentFields = {
  requiresPayment?: unknown;
  requires_payment?: unknown;
  payment_status?: string | null;
};

export function classifyRequiresPaymentFlag(value: unknown): RequiresPaymentFlag {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'unset';
    }
    return classifyRequiresPaymentFlag(value[0]);
  }

  if (value === undefined || value === null) {
    return 'unset';
  }

  if (value === true || value === 1) {
    return 'true';
  }

  if (value === false || value === 0) {
    return 'false';
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') {
      return 'unset';
    }
    if (normalized === 'true' || normalized === '1') {
      return 'true';
    }
    if (normalized === 'false' || normalized === '0') {
      return 'false';
    }
  }

  return 'unset';
}

export function serviceRequiresPayment(
  service: ServicePaymentFields | null | undefined,
  routeFlag?: unknown,
): boolean {
  const route = classifyRequiresPaymentFlag(routeFlag);
  if (route === 'true') {
    return true;
  }
  if (route === 'false') {
    return false;
  }

  if (!service) {
    return false;
  }

  const embedded = classifyRequiresPaymentFlag(service.requiresPayment);
  if (embedded === 'true') {
    return true;
  }
  if (embedded === 'false') {
    return false;
  }

  const columnFlag = classifyRequiresPaymentFlag(service.requires_payment);
  if (columnFlag === 'true') {
    return true;
  }
  if (columnFlag === 'false') {
    return false;
  }

  return service.payment_status === PAYMENT_STATUS_REQUIRES_PAYMENT;
}

/** Scheduler and open-job gate. Unset or false keeps the previous open-job behavior. */
export function resolveSchedulerPaymentGate(
  service: ServicePaymentFields | null | undefined,
  routeFlag?: unknown,
): PaymentGate {
  return serviceRequiresPayment(service, routeFlag) ? 'payment_required' : 'open';
}

/**
 * Confirm gate. A payment-required job cannot take the free confirm path.
 * Unflagged jobs keep `priorAction` (select-helpr's existing action is `payment`).
 */
export function resolveConfirmAction(
  service: ServicePaymentFields | null | undefined,
  priorAction: ConfirmAction,
): ConfirmAction {
  if (serviceRequiresPayment(service)) {
    return 'payment';
  }
  return priorAction;
}

export function applyRequiresPaymentToDraft<T extends Record<string, unknown>>(
  draft: T,
  routeFlag?: unknown,
): T {
  const next: Record<string, unknown> = { ...draft };
  delete next.requiresPayment;
  delete next.requires_payment;

  const route = classifyRequiresPaymentFlag(routeFlag);
  const gate = resolveSchedulerPaymentGate(draft, routeFlag);

  if (gate !== 'payment_required') {
    if (route === 'false' && next.payment_status === PAYMENT_STATUS_REQUIRES_PAYMENT) {
      delete next.payment_status;
    }
    return next as T;
  }

  if (next.payment_status !== PAYMENT_STATUS_PAID) {
    next.payment_status = PAYMENT_STATUS_REQUIRES_PAYMENT;
  }

  return next as T;
}
