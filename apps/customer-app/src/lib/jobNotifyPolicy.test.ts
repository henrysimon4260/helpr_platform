import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  cancelConfirmPrompt,
  decidePushAttempt,
  describeAlertOutcome,
  expoTicketList,
  interpretExpoTickets,
  isExpoPushToken,
  isJobChatUnlocked,
  statusAlertCopy,
} from './jobNotifyPolicy.ts';

test('chat stays locked until a provider is assigned and the job is confirmed or later', () => {
  for (const status of ['finding_pros', 'pending', 'scheduled', 'select_service_provider', '', null]) {
    assert.equal(isJobChatUnlocked(status, 'provider-1'), false);
  }
  assert.equal(isJobChatUnlocked('confirmed', null), false);
  assert.equal(isJobChatUnlocked('confirmed', ''), false);
  for (const status of ['confirmed', 'helpr_otw', 'in_progress', 'completed']) {
    assert.equal(isJobChatUnlocked(status, 'provider-1'), true);
  }
  assert.equal(isJobChatUnlocked('CONFIRMED', 'provider-1'), true);
});

test('status alerts cover on the way, arrived/start, and complete only', () => {
  assert.equal(statusAlertCopy('helpr_otw')?.title, 'Your Helpr is on the way');
  assert.match(statusAlertCopy('in_progress')?.title ?? '', /arrived/i);
  assert.match(statusAlertCopy('completed')?.title ?? '', /complete/i);
  assert.equal(statusAlertCopy('arrived'), null);
  assert.equal(statusAlertCopy('finding_pros'), null);
});

test('notify copy claims a notification only after a real push ticket', () => {
  const prompt = cancelConfirmPrompt();
  assert.doesNotMatch(prompt, /will be notified/i);
  assert.match(prompt, /in the app/i);

  const degraded = describeAlertOutcome('cancel', {
    inApp: true,
    pushDelivered: false,
    reason: 'expo_access_token_missing',
  });
  assert.match(degraded, /in-app alert/i);
  assert.match(degraded, /Push was not delivered/);
  assert.doesNotMatch(degraded, /was notified/);

  const missed = describeAlertOutcome('cancel', {
    inApp: false,
    pushDelivered: false,
    reason: 'alert_not_saved',
  });
  assert.match(missed, /not alerted/);

  const sent = describeAlertOutcome('status', {
    inApp: true,
    pushDelivered: true,
    reason: null,
  });
  assert.match(sent, /notified/);
});

test('push is not treated as delivered without credentials or an ok ticket', () => {
  const missingSecret = decidePushAttempt({
    expoAccessToken: '',
    tokens: ['ExponentPushToken[abc]'],
  });
  assert.equal(missingSecret.attempt, false);
  assert.equal(missingSecret.reason, 'expo_access_token_missing');

  const missingDevice = decidePushAttempt({
    expoAccessToken: 'secret',
    tokens: ['not-a-token', ''],
  });
  assert.equal(missingDevice.attempt, false);
  assert.equal(missingDevice.reason, 'no_push_token');

  const ready = decidePushAttempt({
    expoAccessToken: 'secret',
    tokens: ['ExpoPushToken[abc]'],
  });
  assert.equal(ready.attempt, true);
  assert.deepEqual(ready.deliverableTokens, ['ExpoPushToken[abc]']);
  assert.equal(isExpoPushToken('ExponentPushToken[abc]'), true);
  assert.equal(isExpoPushToken('plain'), false);

  assert.equal(interpretExpoTickets([{ status: 'error', message: 'DeviceNotRegistered' }]).pushDelivered, false);
  assert.equal(interpretExpoTickets([]).pushDelivered, false);
  assert.equal(interpretExpoTickets(expoTicketList({ data: { status: 'ok', id: '1' } })).pushDelivered, true);
  assert.equal(interpretExpoTickets(expoTicketList({ data: [{ status: 'ok' }] })).pushDelivered, true);
});

test('customer, provider, and edge copies of the notify policy match', () => {
  const customer = readFileSync(new URL('./jobNotifyPolicy.ts', import.meta.url), 'utf8');
  const provider = readFileSync(new URL('../../../serviceprovider-app/src/lib/jobNotifyPolicy.ts', import.meta.url), 'utf8');
  const edge = readFileSync(new URL('../../../serviceprovider-app/supabase/functions/notify-job/policy.ts', import.meta.url), 'utf8');
  assert.equal(customer, provider);
  assert.equal(customer, edge);
});
