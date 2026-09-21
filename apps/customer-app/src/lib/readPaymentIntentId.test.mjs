import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPaymentIntentId } from './readPaymentIntentId.ts';

test('reads paymentIntentId from create-payment-intent', () => {
  assert.equal(readPaymentIntentId({ paymentIntentId: 'pi_server', status: 'succeeded' }), 'pi_server');
});

test('reads snake_case and nested ids', () => {
  assert.equal(readPaymentIntentId({ payment_intent_id: 'pi_snake' }), 'pi_snake');
  assert.equal(readPaymentIntentId({ data: { paymentIntentId: 'pi_nested' } }), 'pi_nested');
});

test('falls back to the confirmed PaymentIntent id', () => {
  assert.equal(readPaymentIntentId({}, 'pi_confirmed'), 'pi_confirmed');
  assert.equal(readPaymentIntentId(null, 'pi_confirmed'), 'pi_confirmed');
});

test('skips empty or non-string ids', () => {
  assert.equal(readPaymentIntentId({ paymentIntentId: '', payment_intent_id: 'pi_next' }), 'pi_next');
  assert.equal(readPaymentIntentId({ paymentIntentId: 12 }, 'pi_confirmed'), 'pi_confirmed');
  assert.equal(readPaymentIntentId({}), null);
  assert.equal(readPaymentIntentId(undefined, ''), null);
});
