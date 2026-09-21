/**
 * Statuses a customer confirm may still assign.
 * Exact spellings from JOB_CONTRACT.md. An assigned AutoFill job is already
 * `confirmed` (or later) and has `service_provider_id` set, so it does not match.
 */
export const OPEN_UNASSIGNED_STATUSES = [
  'finding_pros',
  'pending',
  'scheduled',
  'select_service_provider',
] as const;

const WORKABLE_STATUSES = new Set([
  'confirmed',
  'helpr_otw',
  'in_progress',
  'completed',
]);

export type OpenJobSnapshot = {
  status?: string | null;
  service_provider_id?: string | null;
  payment_intent_id?: string | null;
};

export type ConfirmAssignmentOutcome = 'won' | 'lost' | 'unchanged';

export function isOpenUnassignedJob(service: OpenJobSnapshot | null | undefined): boolean {
  if (!service) {
    return false;
  }

  if (service.service_provider_id) {
    return false;
  }

  const status = (service.status ?? '').toLowerCase();
  return (OPEN_UNASSIGNED_STATUSES as readonly string[]).includes(status);
}

/**
 * `updatedCount` is the conditional update (`status` in the open set and
 * `service_provider_id` is null). Zero rows is not a win: re-read the job.
 * The same provider already confirmed with this PaymentIntent is a retry of
 * our own win. A different provider, or the same provider with a different
 * PaymentIntent, lost to another assignment and must not be overwritten.
 */
export function confirmAssignmentOutcome(input: {
  updatedCount: number;
  selectedProviderId: string;
  paymentIntentId: string | null;
  service: OpenJobSnapshot | null | undefined;
}): ConfirmAssignmentOutcome {
  if (input.updatedCount > 0) {
    return 'won';
  }

  if (!input.service) {
    return 'lost';
  }

  const status = (input.service.status ?? '').toLowerCase();
  const assignedProviderId = input.service.service_provider_id ?? null;
  const sameProvider = Boolean(assignedProviderId) && assignedProviderId === input.selectedProviderId;
  const paymentMatches = !input.paymentIntentId
    || input.service.payment_intent_id === input.paymentIntentId;

  if (sameProvider && status === 'confirmed' && paymentMatches) {
    return 'won';
  }

  if (assignedProviderId || !isOpenUnassignedJob(input.service)) {
    return 'lost';
  }

  return 'unchanged';
}

/**
 * Release a charge after a lost confirm only when it is not already the
 * payment on a workable job. Matches `canVoidUnclaimedPayment`.
 */
export function lostConfirmShouldReleaseCharge(
  service: OpenJobSnapshot | null | undefined,
  paymentIntentId: string | null | undefined,
): boolean {
  if (!paymentIntentId) {
    return false;
  }

  if (!service) {
    return true;
  }

  const status = (service.status ?? '').toLowerCase();
  const attached = service.payment_intent_id === paymentIntentId;
  if (attached && WORKABLE_STATUSES.has(status)) {
    return false;
  }

  return true;
}
