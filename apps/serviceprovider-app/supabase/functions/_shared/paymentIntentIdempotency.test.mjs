import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PaymentIntentCreateError,
  SAME_ATTEMPT_WINDOW_SECONDS,
  autofillChargeIdempotencyKey,
  autofillStoredIntentAction,
  chargeReuseDecision,
  confirmChargeIdempotencyKey,
  idempotencyKeyAfter,
  idempotencyKeySegment,
  isFullyRefunded,
  pickReusablePaymentIntent,
  preferredPaymentIntentId,
  resolveIdempotentPaymentIntent,
  shouldDeferSameProviderVoid,
  shouldRotateUnusablePaymentIntent,
} from './paymentIntentIdempotency.ts';

const now = 1_700_000_000;

test('idempotency keys are stable per service and per AutoFill claim', () => {
  assert.equal(confirmChargeIdempotencyKey('svc-1'), 'helpr-confirm-svc-1');
  assert.equal(confirmChargeIdempotencyKey('svc-1'), confirmChargeIdempotencyKey('svc-1'));
  assert.equal(
    autofillChargeIdempotencyKey('svc-1', 'pro-1'),
    'helpr-autofill-svc-1-pro-1',
  );
  assert.notEqual(
    confirmChargeIdempotencyKey('svc-1'),
    autofillChargeIdempotencyKey('svc-1', 'pro-1'),
  );
  assert.notEqual(
    autofillChargeIdempotencyKey('svc-1', 'pro-1'),
    autofillChargeIdempotencyKey('svc-1', 'pro-2'),
  );
  assert.equal(
    idempotencyKeyAfter('helpr-confirm-svc-1', 'pi_old'),
    'helpr-confirm-svc-1-after-pi_old',
  );
});

test('rejects ids that could change a Stripe search query', () => {
  assert.equal(idempotencyKeySegment('svc_1'), 'svc_1');
  assert.equal(idempotencyKeySegment('  abc-DEF  '), 'abc-DEF');
  assert.equal(idempotencyKeySegment("svc' OR 1=1"), null);
  assert.equal(idempotencyKeySegment(''), null);
  assert.equal(idempotencyKeySegment(null), null);
});

test('reuses a live charge and replaces a refunded or canceled one', () => {
  assert.equal(chargeReuseDecision({ id: 'pi_1', status: 'succeeded', amount_refunded: 0, amount_received: 10400 }), 'reuse');
  assert.equal(chargeReuseDecision({ id: 'pi_1', status: 'processing' }), 'reuse');
  assert.equal(chargeReuseDecision({ id: 'pi_1', status: 'requires_action' }), 'reuse');
  assert.equal(chargeReuseDecision({ id: 'pi_1', status: 'requires_capture' }), 'reuse');
  assert.equal(chargeReuseDecision({ id: 'pi_1', status: 'requires_confirmation' }), 'reuse');
  assert.equal(chargeReuseDecision({
    id: 'pi_1',
    status: 'succeeded',
    amount_refunded: 100,
    amount_received: 10400,
  }), 'reuse');
  assert.equal(isFullyRefunded({ status: 'succeeded', amount_refunded: 10400, amount_received: 10400 }), true);
  assert.equal(chargeReuseDecision({
    id: 'pi_1',
    status: 'succeeded',
    amount_refunded: 10400,
    amount_received: 10400,
  }), 'replace');
  assert.equal(chargeReuseDecision({ id: 'pi_1', status: 'canceled' }), 'replace');
  assert.equal(chargeReuseDecision({ id: 'pi_1', status: 'requires_payment_method' }), 'replace');
  assert.equal(chargeReuseDecision(null), 'create');
});

test('does not rotate a card decline during the same-attempt window', () => {
  const declined = {
    id: 'pi_declined',
    status: 'requires_payment_method',
    created: now - 5,
  };
  assert.equal(shouldRotateUnusablePaymentIntent(declined, now), false);
  assert.equal(shouldRotateUnusablePaymentIntent({
    ...declined,
    created: now - SAME_ATTEMPT_WINDOW_SECONDS,
  }, now), true);
  assert.equal(shouldRotateUnusablePaymentIntent({
    id: 'pi_canceled',
    status: 'canceled',
    created: now,
  }, now), true);
  assert.equal(shouldRotateUnusablePaymentIntent({
    id: 'pi_refunded',
    status: 'succeeded',
    amount_refunded: 500,
    amount_received: 500,
    created: now,
  }, now), true);
  assert.equal(shouldRotateUnusablePaymentIntent({
    id: 'pi_ok',
    status: 'succeeded',
    amount_refunded: 0,
    amount_received: 500,
    created: now - 100,
  }, now), false);
});

test('picks the newest reusable PaymentIntent, preferring the matching amount', () => {
  const chosen = pickReusablePaymentIntent([
    { id: 'pi_old', status: 'succeeded', created: 10, amount: 10400, amount_refunded: 0, amount_received: 10400 },
    { id: 'pi_refunded', status: 'succeeded', created: 30, amount: 10400, amount_refunded: 10400, amount_received: 10400 },
    { id: 'pi_other_amount', status: 'succeeded', created: 40, amount: 2000, amount_refunded: 0, amount_received: 2000 },
    { id: 'pi_new', status: 'succeeded', created: 20, amount: 10400, amount_refunded: 0, amount_received: 10400 },
  ], 10400);
  assert.equal(chosen?.id, 'pi_new');
  assert.equal(pickReusablePaymentIntent([
    { id: 'pi_dead', status: 'canceled', created: 50 },
  ]), null);
});

test('keeps the stored charge and names the duplicate for release', () => {
  assert.deepEqual(preferredPaymentIntentId({
    createdId: 'pi_new',
    storedId: 'pi_stored',
    storedReusable: true,
  }), { returnId: 'pi_stored', releaseId: 'pi_new' });
  assert.deepEqual(preferredPaymentIntentId({
    createdId: 'pi_same',
    storedId: 'pi_same',
    storedReusable: true,
  }), { returnId: 'pi_same', releaseId: null });
  assert.deepEqual(preferredPaymentIntentId({
    createdId: 'pi_new',
    storedId: 'pi_dead',
    storedReusable: false,
  }), { returnId: 'pi_new', releaseId: null });
});

test('defers voiding a fresh charge while the same provider claim is still open', () => {
  assert.equal(shouldDeferSameProviderVoid({
    metadataProviderId: 'pro-1',
    callerId: 'pro-1',
    serviceProviderId: null,
    status: 'finding_pros',
    createdUnix: now - 5,
    nowUnix: now,
  }), true);
  assert.equal(shouldDeferSameProviderVoid({
    metadataProviderId: 'pro-1',
    callerId: 'pro-1',
    serviceProviderId: 'pro-2',
    status: 'confirmed',
    createdUnix: now - 5,
    nowUnix: now,
  }), false);
  assert.equal(shouldDeferSameProviderVoid({
    metadataProviderId: 'pro-1',
    callerId: 'pro-2',
    serviceProviderId: null,
    status: 'finding_pros',
    createdUnix: now - 5,
    nowUnix: now,
  }), false);
  assert.equal(shouldDeferSameProviderVoid({
    metadataProviderId: 'pro-1',
    callerId: 'pro-1',
    serviceProviderId: null,
    status: 'finding_pros',
    createdUnix: now - SAME_ATTEMPT_WINDOW_SECONDS,
    nowUnix: now,
  }), false);
});

test('AutoFill reuses only this provider charge', () => {
  assert.equal(autofillStoredIntentAction({
    providerId: 'pro-1',
    metadataProviderId: 'pro-1',
    decision: 'reuse',
  }), 'reuse');
  assert.equal(autofillStoredIntentAction({
    providerId: 'pro-1',
    metadataProviderId: 'pro-2',
    decision: 'reuse',
  }), 'conflict');
  assert.equal(autofillStoredIntentAction({
    providerId: 'pro-1',
    metadataProviderId: null,
    decision: 'reuse',
  }), 'conflict');
  assert.equal(autofillStoredIntentAction({
    providerId: 'pro-1',
    metadataProviderId: 'pro-2',
    decision: 'replace',
  }), 'ignore');
});

function memoryStripe(seed = []) {
  const records = new Map(seed.map((row) => [row.id, { ...row }]));
  const creates = [];
  let sequence = seed.length;

  return {
    records,
    creates,
    resolver: {
      async retrieve(id) {
        const row = records.get(id);
        return row ? { ...row } : null;
      },
      async searchReusable() {
        return null;
      },
      async create(idempotencyKey) {
        const existing = creates.find((entry) => entry.key === idempotencyKey);
        if (existing) {
          const row = records.get(existing.id);
          if (!row) throw new Error('missing created intent');
          if (row.failCreate) {
            throw new PaymentIntentCreateError('card declined', row.id, false);
          }
          return { ...row };
        }

        sequence += 1;
        const id = `pi_${sequence}`;
        const row = {
          id,
          status: 'succeeded',
          created: now,
          amount: 10400,
          amount_refunded: 0,
          amount_received: 10400,
          client_secret: `secret_${id}`,
        };
        records.set(id, row);
        creates.push({ key: idempotencyKey, id });
        return { ...row };
      },
    },
  };
}

test('a second confirm returns the same PaymentIntent', async () => {
  const stripe = memoryStripe();
  const first = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });
  const second = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    storedPaymentIntentId: first.id,
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });

  assert.equal(second.id, first.id);
  assert.equal(stripe.creates.length, 1);
});

test('concurrent confirms share one idempotency key and one PaymentIntent', async () => {
  const stripe = memoryStripe();
  let started = 0;
  let releaseCreate;
  const gate = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  const originalCreate = stripe.resolver.create;
  stripe.resolver.create = async (key) => {
    started += 1;
    if (started === 1) {
      await gate;
    }
    return originalCreate(key);
  };

  const firstPromise = resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });
  await Promise.resolve();
  const secondPromise = resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });

  await Promise.resolve();
  releaseCreate();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.equal(first.id, second.id);
  assert.equal(stripe.creates.length, 1);
  assert.equal(stripe.creates[0].key, 'helpr-confirm-svc-1');
});

test('a retry finds a succeeded charge that was not stored on the row', async () => {
  const orphan = {
    id: 'pi_orphan',
    status: 'succeeded',
    created: now - 10,
    amount: 10400,
    amount_refunded: 0,
    amount_received: 10400,
  };
  const stripe = memoryStripe([orphan]);
  stripe.resolver.searchReusable = async () => ({ ...orphan });

  const resolved = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });

  assert.equal(resolved.id, 'pi_orphan');
  assert.equal(stripe.creates.length, 0);
});

test('a refunded charge is replaced once, and that replacement is reused', async () => {
  const stripe = memoryStripe();
  const first = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });
  const row = stripe.records.get(first.id);
  row.amount_refunded = row.amount_received;

  const replaced = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    storedPaymentIntentId: first.id,
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });

  assert.notEqual(replaced.id, first.id);
  assert.equal(stripe.creates.length, 2);
  assert.equal(stripe.creates[1].key, `helpr-confirm-svc-1-after-${first.id}`);

  const again = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    storedPaymentIntentId: replaced.id,
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });
  assert.equal(again.id, replaced.id);
  assert.equal(stripe.creates.length, 2);
});

test('a double-tap after a decline does not create a second PaymentIntent', async () => {
  const stripe = memoryStripe();
  const originalCreate = stripe.resolver.create;
  stripe.resolver.create = async (key) => {
    const created = await originalCreate(key);
    const row = stripe.records.get(created.id);
    row.status = 'requires_payment_method';
    row.failCreate = true;
    row.amount_received = 0;
    throw new PaymentIntentCreateError('card declined', created.id, false);
  };

  await assert.rejects(
    () => resolveIdempotentPaymentIntent({
      serviceId: 'svc-1',
      useSavedPaymentMethod: false,
      nowUnix: now,
      resolver: stripe.resolver,
    }),
    (error) => error instanceof PaymentIntentCreateError && error.paymentIntentId === 'pi_1',
  );

  await assert.rejects(
    () => resolveIdempotentPaymentIntent({
      serviceId: 'svc-1',
      useSavedPaymentMethod: false,
      nowUnix: now + 5,
      resolver: stripe.resolver,
    }),
    (error) => error instanceof PaymentIntentCreateError,
  );

  assert.equal(stripe.creates.length, 1);
});

test('a later retry after a decline may create one new PaymentIntent', async () => {
  const stripe = memoryStripe();
  let failNext = true;
  const originalCreate = stripe.resolver.create;
  stripe.resolver.create = async (key) => {
    const created = await originalCreate(key);
    if (failNext) {
      const row = stripe.records.get(created.id);
      row.status = 'requires_payment_method';
      row.failCreate = true;
      row.amount_received = 0;
      throw new PaymentIntentCreateError('card declined', created.id, false);
    }
    return created;
  };

  await assert.rejects(() => resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  }));

  failNext = false;
  const retried = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    storedPaymentIntentId: 'pi_1',
    useSavedPaymentMethod: false,
    nowUnix: now + SAME_ATTEMPT_WINDOW_SECONDS,
    resolver: stripe.resolver,
  });

  assert.equal(retried.status, 'succeeded');
  assert.notEqual(retried.id, 'pi_1');
  assert.equal(stripe.creates.length, 2);
  assert.equal(stripe.creates[1].key, 'helpr-confirm-svc-1-after-pi_1');
});

test('AutoFill claims for two providers do not share a PaymentIntent', async () => {
  const stripe = memoryStripe();
  const first = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    providerId: 'pro-1',
    useSavedPaymentMethod: true,
    nowUnix: now,
    resolver: stripe.resolver,
  });
  const second = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    providerId: 'pro-2',
    useSavedPaymentMethod: true,
    nowUnix: now,
    resolver: stripe.resolver,
  });

  assert.notEqual(first.id, second.id);
  assert.deepEqual(stripe.creates.map((entry) => entry.key), [
    'helpr-autofill-svc-1-pro-1',
    'helpr-autofill-svc-1-pro-2',
  ]);
});

test('the same AutoFill provider retry reuses the succeeded charge', async () => {
  const stripe = memoryStripe();
  const first = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    providerId: 'pro-1',
    useSavedPaymentMethod: true,
    nowUnix: now,
    resolver: stripe.resolver,
  });
  const second = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    providerId: 'pro-1',
    useSavedPaymentMethod: true,
    nowUnix: now + 3,
    resolver: stripe.resolver,
  });

  assert.equal(second.id, first.id);
  assert.equal(stripe.creates.length, 1);
});

test('an idempotency parameter mismatch reuses the succeeded charge instead of creating another', async () => {
  const stripe = memoryStripe([{
    id: 'pi_orphan',
    status: 'succeeded',
    created: now - 5,
    amount: 10400,
    amount_refunded: 0,
    amount_received: 10400,
  }]);
  stripe.resolver.searchReusable = async () => null;
  stripe.resolver.create = async () => {
    throw new PaymentIntentCreateError('idempotency parameter mismatch', null, true);
  };
  let searches = 0;
  const originalSearch = async () => {
    searches += 1;
    return searches === 1
      ? null
      : {
        id: 'pi_orphan',
        status: 'succeeded',
        created: now - 5,
        amount: 10400,
        amount_refunded: 0,
        amount_received: 10400,
      };
  };
  stripe.resolver.searchReusable = originalSearch;

  const resolved = await resolveIdempotentPaymentIntent({
    serviceId: 'svc-1',
    useSavedPaymentMethod: false,
    nowUnix: now,
    resolver: stripe.resolver,
  });

  assert.equal(resolved.id, 'pi_orphan');
});
