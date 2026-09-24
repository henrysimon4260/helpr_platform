import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { completionFailure } from './failureResponse.ts';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');

function thrownMessages(file: string): string[] {
  const messages: string[] = [];
  const pattern = /throw new Error\((?:'([^']*)'|"([^"]*)"|`([^`]*)`)\)/g;
  for (const match of file.matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? '';
    messages.push(raw.replace(/\$\{[^}]+\}/g, 'requires_payment_method'));
  }
  return messages;
}

function assertSafeBody(error: unknown, status: number) {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const failure = completionFailure(error);
    assert.notEqual(failure.status, 200);
    assert.ok(failure.status >= 400 && failure.status < 600);
    assert.equal(failure.status, status);
    assert.deepEqual(Object.keys(failure.body).sort(), ['error', 'success']);
    assert.equal(failure.body.success, false);
    assert.equal(typeof failure.body.error, 'string');
    assert.ok(failure.body.error.length > 0);

    const serialized = JSON.stringify(failure.body);
    assert.equal(Object.hasOwn(failure.body, 'stack'), false);
    assert.equal(Object.hasOwn(failure.body, 'details'), false);
    assert.equal(serialized.includes('"stack"'), false);
    assert.equal(serialized.includes('"details"'), false);
    assert.equal(logged.length, 1);
    assert.equal(logged[0]?.[1], error);
    return failure;
  } finally {
    console.error = original;
  }
}

test('every complete-service throw is a non-200 response without a stack', () => {
  const messages = thrownMessages(source);
  assert.ok(messages.length >= 8, `expected thrown errors in index.ts, saw ${messages.length}`);

  for (const message of messages) {
    const error = new Error(message);
    error.stack = `Error: ${message}\n    at leakFrame (/var/task/complete-service/index.ts:1:1)`;
    const failure = assertSafeBody(error, expectedStatus(message));
    assert.equal(failure.body.error, message);
    assert.equal(JSON.stringify(failure.body).includes('leakFrame'), false);
    assert.equal(JSON.stringify(failure.body).includes('/var/task'), false);
  }
});

test('stripe failures are 502 and omit raw objects and stacks', () => {
  const error = new Error('No such payment_intent: pi_secret');
  error.name = 'StripeInvalidRequestError';
  Object.assign(error, {
    type: 'StripeInvalidRequestError',
    rawType: 'invalid_request_error',
    statusCode: 404,
    raw: {
      message: 'No such payment_intent: pi_secret',
      client_secret: 'pi_secret_client_secret',
      request_log_url: 'https://dashboard.stripe.com/logs/secret',
    },
    stack: 'StripeInvalidRequestError: No such payment_intent\n    at Stripe.paymentIntents.retrieve',
  });

  const failure = assertSafeBody(error, 502);
  const serialized = JSON.stringify(failure.body);
  assert.equal(failure.body.error, 'Payment provider request failed');
  assert.equal(serialized.includes('pi_secret'), false);
  assert.equal(serialized.includes('client_secret'), false);
  assert.equal(serialized.includes('dashboard.stripe.com'), false);
  assert.equal(serialized.includes('Stripe.paymentIntents'), false);
  assert.equal(serialized.includes('raw'), false);
});

test('card_error type is treated as a stripe failure', () => {
  const error = new Error('Your card was declined.');
  Object.assign(error, { type: 'card_error', raw: { decline_code: 'stolen_card' } });
  const failure = assertSafeBody(error, 502);
  assert.equal(JSON.stringify(failure.body).includes('stolen_card'), false);
  assert.equal(JSON.stringify(failure.body).includes('declined'), false);
});

test('unexpected errors and invalid JSON do not leak internals', () => {
  const crash = new Error('relation "platform_transactions" does not exist\n    at postgres');
  crash.stack = 'Error: relation\n    at Client.query (/opt/pg/client.js:10:1)';
  const server = assertSafeBody(crash, 500);
  assert.equal(server.body.error, 'Failed to complete service');
  assert.equal(JSON.stringify(server.body).includes('platform_transactions'), false);
  assert.equal(JSON.stringify(server.body).includes('Client.query'), false);

  const invalid = new SyntaxError('Unexpected token } in JSON at position 12');
  invalid.stack = 'SyntaxError: Unexpected token\n    at parseJson (/opt/deno/body.ts:4:2)';
  const badJson = assertSafeBody(invalid, 400);
  assert.equal(badJson.body.error, 'Invalid request body');
  assert.equal(JSON.stringify(badJson.body).includes('position 12'), false);
  assert.equal(JSON.stringify(badJson.body).includes('parseJson'), false);
});

test('index.ts catch path returns the helper status and does not attach error.stack', () => {
  assert.equal(source.includes('error.stack'), false);
  assert.match(source, /completionFailure\(error\)/);
  const catchBlock = source.slice(source.lastIndexOf('} catch (error)'));
  assert.equal(catchBlock.includes('status: 200'), false);
  assert.match(catchBlock, /status: failure\.status/);
  assert.equal(catchBlock.includes('details'), false);
});

function expectedStatus(message: string): number {
  if (message === 'Service not found' || message === 'Provider not found') return 404;
  if (message.startsWith('Payment requires customer action.') || message.startsWith('Payment not authorized.')) {
    return 409;
  }
  if (message.startsWith('Payment captured but no charge ID found.')) return 500;
  return 400;
}
