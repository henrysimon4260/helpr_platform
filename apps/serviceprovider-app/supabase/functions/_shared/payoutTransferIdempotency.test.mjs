import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  choosePayoutLedger,
  isIdempotencyConflict,
  isUniqueViolation,
  nextLedgerStatus,
  payoutTransferGroup,
  payoutTransferIdempotencyKey,
  pickExistingTransfer,
  resolveServicePayout,
} from './payoutTransferIdempotency.ts';

const serviceId = 'svc_1';

test('transfer idempotency key and group are stable per service', () => {
  assert.equal(payoutTransferIdempotencyKey(serviceId), 'helpr-transfer-svc_1');
  assert.equal(payoutTransferIdempotencyKey(serviceId), payoutTransferIdempotencyKey(' svc_1 '));
  assert.equal(payoutTransferGroup(serviceId), 'service_svc_1');
  assert.throws(() => payoutTransferIdempotencyKey("svc' OR 1=1"));
});

test('prefers a ledger row that already has a transfer id', () => {
  const chosen = choosePayoutLedger([
    { transaction_id: 'a', status: 'payout_pending', stripe_transfer_id: null },
    { transaction_id: 'b', status: 'completed', stripe_transfer_id: 'tr_old' },
  ]);
  assert.equal(chosen?.stripe_transfer_id, 'tr_old');
});

test('adopts the earliest live transfer and still blocks on a reversed one', () => {
  const live = pickExistingTransfer([
    { id: 'tr_new', created: 20, reversed: false },
    { id: 'tr_old', created: 10, reversed: false },
  ]);
  assert.equal(live?.id, 'tr_old');
  assert.equal(pickExistingTransfer([{ id: 'tr_rev', created: 1, reversed: true }])?.id, 'tr_rev');
  assert.equal(pickExistingTransfer([]), null);
});

test('does not downgrade a completed payout ledger row', () => {
  assert.equal(nextLedgerStatus(
    { status: 'completed', stripe_transfer_id: 'tr_1' },
    'transfer_recorded',
  ), null);
  assert.equal(nextLedgerStatus(
    { status: 'payout_pending', stripe_transfer_id: null },
    'transfer_recorded',
  ), 'transfer_recorded');
  assert.equal(nextLedgerStatus(null, 'completed'), 'completed');
});

test('recognizes unique violations and Stripe idempotency conflicts', () => {
  assert.equal(isUniqueViolation({ code: '23505', message: '' }), true);
  assert.equal(isUniqueViolation({ message: 'duplicate key value violates unique constraint' }), true);
  assert.equal(isUniqueViolation({ code: '23514', message: 'check constraint' }), false);
  assert.equal(isIdempotencyConflict({ code: 'idempotency_key_in_use' }), true);
  assert.equal(isIdempotencyConflict({ type: 'StripeIdempotencyError', message: 'Keys for idempotent requests...' }), true);
  assert.equal(isIdempotencyConflict(new Error('card declined')), false);
});

function harness(seed = {}) {
  const state = {
    ledger: seed.ledger ?? null,
    transfers: seed.transfers ?? [],
    credits: 0,
    serviceStatus: seed.serviceStatus ?? 'in_progress',
    failSave: seed.failSave ?? false,
    failCredit: seed.failCredit ?? false,
    failList: seed.failList ?? false,
    failClaim: seed.failClaim ?? false,
    createError: seed.createError ?? null,
  };
  const calls = [];

  const deps = {
    async readLedger() {
      calls.push('read');
      return state.ledger ? { ...state.ledger } : null;
    },
    async listTransfers() {
      calls.push('list');
      if (state.failList) throw new Error('stripe list failed');
      return state.transfers.map((transfer) => ({ ...transfer }));
    },
    async prepareCharge() {
      calls.push('prepare');
    },
    async insertClaim() {
      calls.push('claim');
      if (state.failClaim) throw new Error('claim failed');
      if (state.ledger) return 'conflict';
      state.ledger = {
        service_id: serviceId,
        status: 'payout_pending',
        stripe_transfer_id: null,
      };
      return 'inserted';
    },
    async createTransfer(idempotencyKey) {
      calls.push(`create:${idempotencyKey}`);
      if (state.createError) {
        const error = state.createError;
        state.createError = null;
        throw error;
      }
      const existing = state.transfers.find((transfer) => transfer.key === idempotencyKey);
      if (existing) return { id: existing.id };
      const created = {
        id: `tr_${state.transfers.length + 1}`,
        key: idempotencyKey,
        created: state.transfers.length + 1,
        reversed: false,
      };
      state.transfers.push(created);
      return { id: created.id };
    },
    async saveTransfer(transferId, status) {
      calls.push(`save:${status}`);
      if (state.failSave) {
        state.failSave = false;
        throw new Error('ledger write failed');
      }
      state.ledger = {
        ...(state.ledger ?? { service_id: serviceId }),
        stripe_transfer_id: transferId,
        status,
      };
    },
    async creditBalanceIfRecorded() {
      calls.push('credit');
      if (state.failCredit) {
        state.failCredit = false;
        throw new Error('balance write failed');
      }
      if (!state.ledger || state.ledger.status !== 'transfer_recorded') return 'already';
      state.ledger = { ...state.ledger, status: 'completed' };
      state.credits += 1;
      return 'credited';
    },
    async markServiceCompleted() {
      calls.push('status');
      state.serviceStatus = 'completed';
    },
  };

  return { state, calls, deps };
}

test('a retry after a failed ledger write does not create a second transfer', async () => {
  const { state, calls, deps } = harness({ failSave: true });

  await assert.rejects(
    () => resolveServicePayout({ serviceId, deps }),
    /ledger write failed/,
  );
  assert.equal(state.transfers.length, 1);
  assert.equal(calls.filter((call) => call.startsWith('create:')).length, 1);
  assert.equal(state.ledger.status, 'payout_pending');

  const retry = await resolveServicePayout({ serviceId, deps });
  assert.equal(retry.created, false);
  assert.equal(retry.transferId, 'tr_1');
  assert.equal(retry.credited, true);
  assert.equal(state.transfers.length, 1);
  assert.equal(calls.filter((call) => call.startsWith('create:')).length, 1);
  assert.equal(state.credits, 1);
  assert.equal(state.ledger.stripe_transfer_id, 'tr_1');
  assert.equal(state.ledger.status, 'completed');
  assert.equal(state.serviceStatus, 'completed');
  assert.ok(calls.indexOf('claim') < calls.findIndex((call) => call.startsWith('create:')));
});

test('a completed payout retries without transferring or crediting again', async () => {
  const { state, calls, deps } = harness();
  const first = await resolveServicePayout({ serviceId, deps });
  assert.equal(first.created, true);
  assert.equal(first.credited, true);

  const retry = await resolveServicePayout({ serviceId, deps });
  assert.equal(retry.created, false);
  assert.equal(retry.credited, false);
  assert.equal(retry.transferId, first.transferId);
  assert.equal(state.transfers.length, 1);
  assert.equal(state.credits, 1);
  assert.equal(calls.filter((call) => call.startsWith('create:')).length, 1);
  assert.equal(calls.filter((call) => call === 'list').length, 1);
});

test('a swallowed ledger insert still does not transfer again', async () => {
  const { state, calls, deps } = harness({
    transfers: [{ id: 'tr_legacy', created: 5, reversed: false }],
    serviceStatus: 'completed',
  });

  const result = await resolveServicePayout({ serviceId, deps });
  assert.equal(result.created, false);
  assert.equal(result.credited, false);
  assert.equal(result.transferId, 'tr_legacy');
  assert.equal(state.ledger.status, 'completed');
  assert.equal(state.ledger.stripe_transfer_id, 'tr_legacy');
  assert.equal(calls.some((call) => call.startsWith('create:')), false);
  assert.equal(calls.includes('prepare'), false);
});

test('status update failure after a stored transfer does not transfer again', async () => {
  const { state, calls, deps } = harness({
    ledger: {
      service_id: serviceId,
      status: 'completed',
      stripe_transfer_id: 'tr_saved',
    },
    serviceStatus: 'in_progress',
  });

  const result = await resolveServicePayout({ serviceId, deps });
  assert.equal(result.transferId, 'tr_saved');
  assert.equal(result.created, false);
  assert.equal(result.credited, false);
  assert.equal(state.serviceStatus, 'completed');
  assert.equal(state.credits, 0);
  assert.equal(calls.includes('list'), false);
  assert.equal(calls.some((call) => call.startsWith('create:')), false);
});

test('balance credit failure retries the credit and not the transfer', async () => {
  const { state, deps } = harness({
    ledger: {
      service_id: serviceId,
      status: 'transfer_recorded',
      stripe_transfer_id: 'tr_saved',
    },
    failCredit: true,
  });

  await assert.rejects(() => resolveServicePayout({ serviceId, deps }), /balance write failed/);
  assert.equal(state.transfers.length, 0);

  const retry = await resolveServicePayout({ serviceId, deps });
  assert.equal(retry.created, false);
  assert.equal(retry.credited, true);
  assert.equal(retry.transferId, 'tr_saved');
  assert.equal(state.credits, 1);
});

test('claim failure and stripe lookup failure happen before any transfer', async () => {
  const claim = harness({ failClaim: true });
  await assert.rejects(() => resolveServicePayout({ serviceId, deps: claim.deps }), /claim failed/);
  assert.equal(claim.state.transfers.length, 0);

  const list = harness({ failList: true });
  await assert.rejects(() => resolveServicePayout({ serviceId, deps: list.deps }), /stripe list failed/);
  assert.equal(list.calls.some((call) => call.startsWith('create:')), false);
});

test('an idempotency conflict reuses the stripe transfer instead of a new key', async () => {
  const { state, calls, deps } = harness({
    createError: { code: 'idempotency_key_in_use', message: 'idempotency key in use' },
  });
  deps.createTransfer = async (idempotencyKey) => {
    calls.push(`create:${idempotencyKey}`);
    state.transfers.push({
      id: 'tr_raced',
      key: idempotencyKey,
      created: 1,
      reversed: false,
    });
    throw state.createError;
  };

  const result = await resolveServicePayout({ serviceId, deps });
  assert.equal(result.transferId, 'tr_raced');
  assert.equal(state.transfers.length, 1);
  assert.equal(calls.filter((call) => call.startsWith('create:')).length, 1);
  assert.equal(state.credits, 1);
});

test('an idempotency conflict with no visible transfer does not mint a second key', async () => {
  const { calls, deps } = harness({
    createError: { type: 'idempotency_error', message: 'Keys for idempotent requests can only be used with the same parameters' },
  });

  await assert.rejects(
    () => resolveServicePayout({ serviceId, deps }),
    /already in progress/,
  );
  assert.deepEqual(
    calls.filter((call) => call.startsWith('create:')),
    ['create:helpr-transfer-svc_1'],
  );
});

test('a unique claim conflict settles the transfer the other attempt stored', async () => {
  const { state, calls, deps } = harness();
  deps.insertClaim = async () => {
    calls.push('claim');
    state.ledger = {
      service_id: serviceId,
      status: 'completed',
      stripe_transfer_id: 'tr_winner',
    };
    return 'conflict';
  };

  const result = await resolveServicePayout({ serviceId, deps });
  assert.equal(result.created, false);
  assert.equal(result.transferId, 'tr_winner');
  assert.equal(result.credited, false);
  assert.equal(calls.some((call) => call.startsWith('create:')), false);
});

test('rejects an unsafe service id before looking up or creating a transfer', async () => {
  const { calls, deps } = harness();
  await assert.rejects(
    () => resolveServicePayout({ serviceId: 'svc 1', deps }),
    /not valid/,
  );
  assert.deepEqual(calls, []);
});
