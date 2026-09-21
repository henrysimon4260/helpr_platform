import { idempotencyKeySegment } from './paymentIntentIdempotency.ts';

/** Claim row exists; Stripe transfer has not been stored. */
export const PAYOUT_LEDGER_PENDING = 'payout_pending';
/** Transfer id is stored; provider balance has not been credited. */
export const PAYOUT_LEDGER_TRANSFER_RECORDED = 'transfer_recorded';
/** Transfer id is stored and the provider balance credit was applied. */
export const PAYOUT_LEDGER_COMPLETED = 'completed';

export type PayoutLedger = {
  transaction_id?: string | null;
  service_id?: string | null;
  stripe_transfer_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  status?: string | null;
};

export type StripeTransferRecord = {
  id: string;
  created?: number;
  reversed?: boolean | null;
};

export type PayoutDeps = {
  readLedger: () => Promise<PayoutLedger | null>;
  listTransfers: () => Promise<StripeTransferRecord[]>;
  prepareCharge: () => Promise<void>;
  insertClaim: () => Promise<'inserted' | 'conflict'>;
  createTransfer: (idempotencyKey: string) => Promise<{ id: string }>;
  saveTransfer: (transferId: string, status: string) => Promise<void>;
  creditBalanceIfRecorded: () => Promise<'credited' | 'already'>;
  markServiceCompleted: () => Promise<void>;
};

export type PayoutResult = {
  transferId: string;
  created: boolean;
  credited: boolean;
};

export function payoutTransferIdempotencyKey(serviceId: string): string {
  const segment = requireServiceSegment(serviceId);
  return `helpr-transfer-${segment}`;
}

export function payoutTransferGroup(serviceId: string): string {
  const segment = requireServiceSegment(serviceId);
  return `service_${segment}`;
}

export function choosePayoutLedger(rows: PayoutLedger[] | null | undefined): PayoutLedger | null {
  const list = (rows ?? []).filter((row) => !!row);
  const recorded = list.find((row) => hasText(row.stripe_transfer_id));
  if (recorded) return recorded;
  const inFlight = list.find((row) =>
    row.status === PAYOUT_LEDGER_PENDING || row.status === PAYOUT_LEDGER_TRANSFER_RECORDED
  );
  return inFlight ?? list[0] ?? null;
}

/**
 * Prefer the earliest live transfer. A fully reversed transfer still counts:
 * creating another one would pay the service twice.
 */
export function pickExistingTransfer(
  transfers: StripeTransferRecord[] | null | undefined,
): StripeTransferRecord | null {
  const list = (transfers ?? []).filter((row) => hasText(row.id));
  if (list.length === 0) return null;
  const live = list.filter((row) => row.reversed !== true);
  const pool = live.length > 0 ? live : list;
  return [...pool].sort((a, b) => (a.created ?? 0) - (b.created ?? 0))[0];
}

export function isUniqueViolation(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key|unique constraint/i.test(error.message ?? '');
}

export function isIdempotencyConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: string; type?: string; message?: string };
  if (record.code === 'idempotency_key_in_use') return true;
  if (record.type === 'idempotency_error' || record.type === 'StripeIdempotencyError') return true;
  return /idempotency/i.test(record.message ?? '');
}

/**
 * One payout per service. A known transfer id, in the ledger or on Stripe,
 * never reaches createTransfer. The Stripe Idempotency-Key is stable for the
 * service so two overlapping creates still settle as one transfer.
 */
export async function resolveServicePayout(input: {
  serviceId: string;
  deps: PayoutDeps;
  depth?: number;
}): Promise<PayoutResult> {
  const depth = input.depth ?? 0;
  if (depth > 2) {
    throw new Error('Payout is already in progress for this service. Retry shortly.');
  }

  const serviceId = requireServiceSegment(input.serviceId);
  const ledger = await input.deps.readLedger();
  const recordedId = hasText(ledger?.stripe_transfer_id) ? ledger.stripe_transfer_id.trim() : null;
  const existing = recordedId
    ? { id: recordedId }
    : pickExistingTransfer(await input.deps.listTransfers());

  if (existing) {
    return settleRecordedTransfer(input.deps, existing.id, ledger);
  }

  await input.deps.prepareCharge();

  if (!ledger) {
    const claim = await input.deps.insertClaim();
    if (claim === 'conflict') {
      return resolveServicePayout({ ...input, depth: depth + 1 });
    }
  }

  const idempotencyKey = payoutTransferIdempotencyKey(serviceId);
  let transfer: { id: string };
  try {
    transfer = await input.deps.createTransfer(idempotencyKey);
  } catch (error) {
    if (!isIdempotencyConflict(error)) throw error;
    const raced = pickExistingTransfer(await input.deps.listTransfers());
    if (!raced) {
      throw new Error('Payout is already in progress for this service. Retry shortly.');
    }
    const latest = await input.deps.readLedger();
    const settled = await settleRecordedTransfer(input.deps, raced.id, latest);
    return { ...settled, created: false };
  }

  await input.deps.saveTransfer(transfer.id, PAYOUT_LEDGER_TRANSFER_RECORDED);
  const latest = await input.deps.readLedger();
  const settled = await settleRecordedTransfer(
    input.deps,
    transfer.id,
    latest ?? {
      stripe_transfer_id: transfer.id,
      status: PAYOUT_LEDGER_TRANSFER_RECORDED,
    },
  );
  return { ...settled, created: true };
}

/**
 * A finished payout must not be moved back to transfer_recorded. Doing that
 * would let a second caller credit the provider balance again.
 */
export function nextLedgerStatus(
  current: PayoutLedger | null | undefined,
  requestedStatus: string,
): string | null {
  if (
    current?.status === PAYOUT_LEDGER_COMPLETED
    && hasText(current.stripe_transfer_id)
  ) {
    return null;
  }
  return requestedStatus;
}

async function settleRecordedTransfer(
  deps: PayoutDeps,
  transferId: string,
  ledger: PayoutLedger | null,
): Promise<PayoutResult> {
  const recorded = hasText(ledger?.stripe_transfer_id);
  if (!recorded) {
    // A claim we inserted is waiting for its transfer id, so the balance
    // still needs to be credited. A Stripe transfer with no ledger row was
    // written by the old function, which credited balance before the insert.
    const status = ledger ? PAYOUT_LEDGER_TRANSFER_RECORDED : PAYOUT_LEDGER_COMPLETED;
    await deps.saveTransfer(transferId, status);
  }

  const shouldCredit = !recorded
    ? !!ledger
    : ledger?.status === PAYOUT_LEDGER_TRANSFER_RECORDED;

  let credited = false;
  if (shouldCredit) {
    const credit = await deps.creditBalanceIfRecorded();
    credited = credit === 'credited';
  }

  await deps.markServiceCompleted();
  return { transferId, created: false, credited };
}

function requireServiceSegment(serviceId: string): string {
  const segment = idempotencyKeySegment(serviceId);
  if (!segment) {
    throw new Error('serviceId is not valid for an idempotent transfer');
  }
  return segment;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
