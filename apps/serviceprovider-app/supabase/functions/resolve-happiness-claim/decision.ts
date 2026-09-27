/**
 * Pure resolution rules for Helpr Happiness.
 * Discretionary goodwill only — this module does not describe an insurance benefit.
 * Keep HELPR_HAPPINESS_CAP_CENTS aligned with the customer policy module and JOB_CONTRACT.md.
 */

export const HELPR_HAPPINESS_CAP_CENTS = 100_000;

export type HappinessDecision = 'approve' | 'partial' | 'deny' | 'needs_info';
export type HappinessPayoutMethod = 'stripe_refund' | 'manual';
export type HappinessClaimStatus = 'submitted' | 'needs_info' | 'denied' | 'paid';
export type HappinessOutcome = 'approved' | 'partial' | 'denied' | 'needs_info';

export type OpenClaim = {
  status: HappinessClaimStatus;
  amountRequestedCents: number;
};

export type ResolveInput = {
  decision: HappinessDecision;
  amountApprovedCents?: number | null;
  payoutMethod?: HappinessPayoutMethod | null;
  notes?: string | null;
  /** Remaining cents Stripe can still refund on the job charge. Required to plan a card refund. */
  refundableCents?: number | null;
};

export type ResolvePlan = {
  ok: true;
  nextStatus: HappinessClaimStatus;
  outcome: HappinessOutcome;
  amountApprovedCents: number | null;
  payoutMethod: HappinessPayoutMethod | null;
  stripeRefundCents: number | null;
};

export type ResolveFailure = { ok: false; error: string };

const TERMINAL: HappinessClaimStatus[] = ['denied', 'paid'];

function payableCeiling(requested: number): number {
  return Math.min(requested, HELPR_HAPPINESS_CAP_CENTS);
}

export function planHappinessResolution(
  claim: OpenClaim,
  input: ResolveInput,
): ResolvePlan | ResolveFailure {
  if (TERMINAL.includes(claim.status)) {
    return { ok: false, error: 'This request is already resolved.' };
  }
  if (claim.status !== 'submitted' && claim.status !== 'needs_info') {
    return { ok: false, error: 'This request cannot be resolved from its current status.' };
  }

  const notes = input.notes?.trim() ?? '';
  if (notes.length < 8) {
    return { ok: false, error: 'Add a short note explaining the outcome.' };
  }
  if (!Number.isInteger(claim.amountRequestedCents) || claim.amountRequestedCents < 1) {
    return { ok: false, error: 'The request amount is not valid.' };
  }
  if (claim.amountRequestedCents > HELPR_HAPPINESS_CAP_CENTS) {
    return { ok: false, error: 'The request amount is above the program cap.' };
  }

  if (input.decision === 'needs_info') {
    if (input.payoutMethod) {
      return { ok: false, error: 'Do not choose a payout when asking for more information.' };
    }
    return {
      ok: true,
      nextStatus: 'needs_info',
      outcome: 'needs_info',
      amountApprovedCents: null,
      payoutMethod: null,
      stripeRefundCents: null,
    };
  }

  if (input.decision === 'deny') {
    if (input.payoutMethod) {
      return { ok: false, error: 'Do not choose a payout when declining a request.' };
    }
    return {
      ok: true,
      nextStatus: 'denied',
      outcome: 'denied',
      amountApprovedCents: 0,
      payoutMethod: null,
      stripeRefundCents: null,
    };
  }

  const ceiling = payableCeiling(claim.amountRequestedCents);
  let amount: number;
  let outcome: HappinessOutcome;

  if (input.decision === 'approve') {
    amount = ceiling;
    outcome = amount < claim.amountRequestedCents ? 'partial' : 'approved';
  } else {
    const proposed = input.amountApprovedCents;
    if (proposed == null || !Number.isInteger(proposed)) {
      return { ok: false, error: 'A partial decision needs an approved amount in cents.' };
    }
    if (proposed < 1 || proposed >= ceiling) {
      return {
        ok: false,
        error: 'A partial amount must be greater than zero and less than the payable amount.',
      };
    }
    amount = proposed;
    outcome = 'partial';
  }

  if (amount > HELPR_HAPPINESS_CAP_CENTS) {
    return { ok: false, error: 'The approved amount is above the program cap.' };
  }

  if (input.payoutMethod !== 'stripe_refund' && input.payoutMethod !== 'manual') {
    return { ok: false, error: 'Choose a Stripe refund or a manual payout record.' };
  }

  if (input.payoutMethod === 'stripe_refund') {
    const refundable = input.refundableCents;
    if (refundable == null || !Number.isInteger(refundable) || refundable < 1) {
      return {
        ok: false,
        error: 'No refundable card charge was found. Record a manual payout instead.',
      };
    }
    if (amount > refundable) {
      return {
        ok: false,
        error:
          'The approved amount is higher than the refundable card charge. Lower the amount or record a manual payout.',
      };
    }
    return {
      ok: true,
      nextStatus: 'paid',
      outcome,
      amountApprovedCents: amount,
      payoutMethod: 'stripe_refund',
      stripeRefundCents: amount,
    };
  }

  return {
    ok: true,
    nextStatus: 'paid',
    outcome,
    amountApprovedCents: amount,
    payoutMethod: 'manual',
    stripeRefundCents: null,
  };
}
