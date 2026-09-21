import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookingChargeCents } from './autofillPayment.ts';
import {
  CHARGE_AMOUNT_MISMATCH,
  CHARGE_FORBIDDEN,
  CHARGE_NOT_CHARGEABLE,
  CHARGE_PAYMENT_METHOD_FORBIDDEN,
  callerOwnsServiceCustomer,
  currencyAccepted,
  evaluateCustomerCharge,
  emailsMatch,
  isOpenCustomerCharge,
  parseBearerToken,
  paymentMethodBelongsToOwner,
  readClientAmountCents,
  rejectedClientOverride,
  resolveCustomerChargeAmount,
  stripePaymentMethodCustomerAllowed,
} from './chargeAuthorization.ts';

const auth = {
  authUserId: 'auth-user-1',
  authEmail: 'Customer@Example.com',
};

function ownedService(overrides = {}) {
  return {
    customer_id: 'cust-1',
    price: 40,
    status: 'select_service_provider',
    service_provider_id: null,
    payment_intent_id: null,
    ...overrides,
  };
}

function chargeInput(overrides = {}) {
  const { body: bodyOverrides, service: serviceOverrides, ...rest } = overrides;
  return {
    ...auth,
    customerEmail: 'customer@example.com',
    fillRequests: [{ service_provider_id: 'pro-1', bid: 100 }],
    paymentMethods: [{ stripe_pm_id: 'pm_owner', user_id: 'auth-user-1' }],
    ...rest,
    service: serviceOverrides === null ? null : ownedService(serviceOverrides),
    body: {
      amount: bookingChargeCents(100),
      currency: 'usd',
      payment_method_id: 'pm_owner',
      customer_id: 'cust-1',
      ...bodyOverrides,
    },
  };
}

test('rejects a missing or non-bearer token', () => {
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken(''), null);
  assert.equal(parseBearerToken('pm_card'), null);
  assert.equal(parseBearerToken('Bearer '), null);
  assert.equal(parseBearerToken('Bearer user-jwt'), 'user-jwt');
});

test('binds ownership to the auth user id or auth email, not a client customer id', () => {
  assert.equal(emailsMatch(' Customer@Example.com ', 'customer@example.com'), true);
  assert.equal(emailsMatch('', 'customer@example.com'), false);
  assert.equal(emailsMatch(null, null), false);

  assert.equal(callerOwnsServiceCustomer({
    ...auth,
    serviceCustomerId: 'cust-1',
    customerEmail: 'customer@example.com',
  }), true);
  assert.equal(callerOwnsServiceCustomer({
    authUserId: 'cust-1',
    authEmail: null,
    serviceCustomerId: 'cust-1',
    customerEmail: null,
  }), true);
  assert.equal(callerOwnsServiceCustomer({
    authUserId: 'someone-else',
    authEmail: 'other@example.com',
    serviceCustomerId: 'cust-1',
    customerEmail: 'customer@example.com',
  }), false);
});

test('mismatched client amount cannot match a server bid total', () => {
  const mismatch = evaluateCustomerCharge(chargeInput({
    body: { amount: 50 },
  }));
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.error, CHARGE_AMOUNT_MISMATCH);
  }

  assert.equal(readClientAmountCents(10.5), 'invalid');
  assert.equal(readClientAmountCents('10400'), 'invalid');
  assert.equal(readClientAmountCents(0), 'invalid');

  const fractional = evaluateCustomerCharge(chargeInput({
    body: { amount: 10400.4 },
  }));
  assert.equal(fractional.ok, false);
});

test('does not charge the pre-accept price estimate when a bid exists', () => {
  const estimateCents = bookingChargeCents(40);
  const decision = evaluateCustomerCharge(chargeInput({
    body: { amount: estimateCents },
    service: { price: 40 },
  }));
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.error, CHARGE_AMOUNT_MISMATCH);

  const approved = evaluateCustomerCharge(chargeInput());
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.amountCents, bookingChargeCents(100));
    assert.equal(approved.customerId, 'cust-1');
    assert.equal(approved.email, 'customer@example.com');
    assert.equal(approved.reuseOnly, false);
  }
});

test('omitted client amount uses the single server bid total', () => {
  const decision = evaluateCustomerCharge(chargeInput({
    body: { amount: undefined },
  }));
  assert.equal(decision.ok, true);
  if (decision.ok) assert.equal(decision.amountCents, bookingChargeCents(100));

  const missing = evaluateCustomerCharge(chargeInput({
    service: null,
  }));
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 400);
    assert.equal(missing.error, CHARGE_NOT_CHARGEABLE);
  }
});

test('foreign payment method cannot charge even for the owning user', () => {
  const foreign = evaluateCustomerCharge(chargeInput({
    body: { payment_method_id: 'pm_victim' },
    paymentMethods: [{ stripe_pm_id: 'pm_victim', user_id: 'victim-user' }],
  }));
  assert.equal(foreign.ok, false);
  if (!foreign.ok) {
    assert.equal(foreign.status, 403);
    assert.equal(foreign.error, CHARGE_PAYMENT_METHOD_FORBIDDEN);
  }

  assert.equal(paymentMethodBelongsToOwner(
    [{ stripe_pm_id: 'pm_owner', user_id: 'auth-user-1' }],
    'pm_owner',
    ['auth-user-1'],
  ), true);
  assert.equal(paymentMethodBelongsToOwner(
    [{ stripe_pm_id: 'pm_owner', user_id: 'someone-else' }],
    'pm_owner',
    ['auth-user-1', 'cust-1'],
  ), false);
});

test('a signed-in user who does not own the service is forbidden', () => {
  const denied = evaluateCustomerCharge(chargeInput({
    authUserId: 'other-user',
    authEmail: 'other@example.com',
    customerEmail: 'customer@example.com',
  }));
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.status, 403);
    assert.equal(denied.error, CHARGE_FORBIDDEN);
  }
});

test('client customer id or email that disagrees with the service is rejected', () => {
  const customer = evaluateCustomerCharge(chargeInput({
    body: { customer_id: 'cust-victim' },
  }));
  assert.equal(customer.ok, false);
  if (!customer.ok) {
    assert.equal(customer.status, 400);
    assert.equal(customer.error, CHARGE_NOT_CHARGEABLE);
  }

  const email = evaluateCustomerCharge(chargeInput({
    body: { customer_email: 'attacker@example.com' },
  }));
  assert.equal(email.ok, false);
  if (!email.ok) assert.equal(email.status, 400);
});

test('picks one server bid total and rejects an ambiguous charge', () => {
  const bids = [
    { service_provider_id: 'pro-1', bid: 80 },
    { service_provider_id: 'pro-2', bid: 120 },
  ];
  const matched = resolveCustomerChargeAmount({
    fillRequests: bids,
    servicePrice: 40,
    clientAmountCents: bookingChargeCents(120),
    status: 'select_service_provider',
  });
  assert.deepEqual(matched, {
    ok: true,
    amountCents: bookingChargeCents(120),
    source: 'fill_request',
  });

  const ambiguous = resolveCustomerChargeAmount({
    fillRequests: bids,
    clientAmountCents: null,
    status: 'finding_pros',
  });
  assert.deepEqual(ambiguous, { ok: false, reason: 'ambiguous' });

  const requested = resolveCustomerChargeAmount({
    fillRequests: bids,
    requestedProviderId: 'pro-1',
    clientAmountCents: bookingChargeCents(80),
    status: 'select_service_provider',
  });
  assert.equal(requested.ok, true);
  if (requested.ok) assert.equal(requested.amountCents, bookingChargeCents(80));

  const wrongProviderAmount = resolveCustomerChargeAmount({
    fillRequests: bids,
    requestedProviderId: 'pro-1',
    clientAmountCents: bookingChargeCents(120),
    status: 'select_service_provider',
  });
  assert.deepEqual(wrongProviderAmount, { ok: false, reason: 'amount_mismatch' });
});

test('uses service.price only after accept, when the bid has been copied', () => {
  const open = resolveCustomerChargeAmount({
    fillRequests: [],
    servicePrice: 90,
    clientAmountCents: bookingChargeCents(90),
    status: 'finding_pros',
  });
  assert.deepEqual(open, { ok: false, reason: 'no_authoritative_amount' });

  const retry = evaluateCustomerCharge(chargeInput({
    fillRequests: [],
    service: {
      price: 90,
      status: 'confirmed',
      service_provider_id: 'pro-1',
      payment_intent_id: 'pi_stored',
    },
    body: { amount: bookingChargeCents(90) },
  }));
  assert.equal(retry.ok, true);
  if (retry.ok) {
    assert.equal(retry.amountCents, bookingChargeCents(90));
    assert.equal(retry.reuseOnly, true);
    assert.equal(retry.storedPaymentIntentId, 'pi_stored');
  }
});

test('a closed booking is not open for a new charge', () => {
  assert.equal(isOpenCustomerCharge('select_service_provider', null), true);
  assert.equal(isOpenCustomerCharge('finding_pros', ''), true);
  assert.equal(isOpenCustomerCharge('confirmed', null), false);
  assert.equal(isOpenCustomerCharge('select_service_provider', 'pro-1'), false);
});

test('currency and stripe customer binding fail closed', () => {
  assert.equal(currencyAccepted(undefined), true);
  assert.equal(currencyAccepted('USD'), true);
  assert.equal(currencyAccepted('eur'), false);

  const currency = evaluateCustomerCharge(chargeInput({ body: { currency: 'eur' } }));
  assert.equal(currency.ok, false);

  assert.equal(stripePaymentMethodCustomerAllowed(null, 'cus_owner'), true);
  assert.equal(stripePaymentMethodCustomerAllowed('cus_owner', 'cus_owner'), true);
  assert.equal(stripePaymentMethodCustomerAllowed('cus_victim', 'cus_owner'), false);
  assert.equal(stripePaymentMethodCustomerAllowed(null, ''), false);
});

test('AutoFill rejects a client amount or payment method that is not the server value', () => {
  assert.equal(rejectedClientOverride({
    clientAmount: undefined,
    serverAmountCents: 10400,
    clientPaymentMethodId: undefined,
    serverPaymentMethodId: 'pm_saved',
  }), null);

  assert.deepEqual(rejectedClientOverride({
    clientAmount: 1,
    serverAmountCents: 10400,
    clientPaymentMethodId: undefined,
    serverPaymentMethodId: 'pm_saved',
  }), { status: 400, error: CHARGE_AMOUNT_MISMATCH });

  assert.deepEqual(rejectedClientOverride({
    clientAmount: 10400,
    serverAmountCents: 10400,
    clientPaymentMethodId: 'pm_foreign',
    serverPaymentMethodId: 'pm_saved',
  }), { status: 403, error: CHARGE_PAYMENT_METHOD_FORBIDDEN });
});
