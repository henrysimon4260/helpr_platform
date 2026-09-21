import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMPLETE_FORBIDDEN,
  COMPLETE_UNAVAILABLE,
  authorizeAssignedProvider,
} from './completeServiceAuthorization.ts';

const assigned = {
  authUserId: 'provider-auth-1',
  authEmail: 'Pro@Example.com',
  assignedProviderId: 'provider-auth-1',
};

test('the assigned auth user may complete without an email match', () => {
  const decision = authorizeAssignedProvider({
    ...assigned,
    authEmail: 'someone-else@example.com',
    assignedAccount: { service_provider_id: 'provider-auth-1', email: 'stored@example.com' },
  });
  assert.equal(decision.ok, true);
});

test('a signed-in caller who is not the assigned provider is forbidden', () => {
  const customer = authorizeAssignedProvider({
    authUserId: 'customer-1',
    authEmail: 'customer@example.com',
    assignedProviderId: 'provider-auth-1',
    accountForAuthId: null,
    assignedAccount: { service_provider_id: 'provider-auth-1', email: 'pro@example.com' },
  });
  assert.equal(customer.ok, false);
  if (!customer.ok) {
    assert.equal(customer.status, 403);
    assert.equal(customer.error, COMPLETE_FORBIDDEN);
  }

  const otherProvider = authorizeAssignedProvider({
    authUserId: 'provider-auth-2',
    authEmail: 'other@example.com',
    assignedProviderId: 'provider-auth-1',
    accountForAuthId: { service_provider_id: 'provider-auth-2', email: 'other@example.com' },
    assignedAccount: { service_provider_id: 'provider-auth-1', email: 'pro@example.com' },
  });
  assert.equal(otherProvider.ok, false);
  if (!otherProvider.ok) assert.equal(otherProvider.status, 403);
});

test('an unassigned job is forbidden for every caller', () => {
  for (const assignedProviderId of [null, '', '   ']) {
    const decision = authorizeAssignedProvider({
      authUserId: 'provider-auth-1',
      authEmail: 'pro@example.com',
      assignedProviderId,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.status, 403);
  }
});

test('legacy profile maps by getUser email only when this auth user has no provider row', () => {
  const legacy = authorizeAssignedProvider({
    authUserId: 'new-auth-id',
    authEmail: ' Pro@Example.com ',
    assignedProviderId: 'legacy-provider-id',
    accountForAuthId: null,
    assignedAccount: { service_provider_id: 'legacy-provider-id', email: 'pro@example.com' },
  });
  assert.equal(legacy.ok, true);

  const ownAccountWins = authorizeAssignedProvider({
    authUserId: 'provider-auth-2',
    authEmail: 'pro@example.com',
    assignedProviderId: 'legacy-provider-id',
    accountForAuthId: { service_provider_id: 'provider-auth-2', email: 'pro@example.com' },
    assignedAccount: { service_provider_id: 'legacy-provider-id', email: 'pro@example.com' },
  });
  assert.equal(ownAccountWins.ok, false);

  const blankEmail = authorizeAssignedProvider({
    authUserId: 'new-auth-id',
    authEmail: null,
    assignedProviderId: 'legacy-provider-id',
    accountForAuthId: null,
    assignedAccount: { service_provider_id: 'legacy-provider-id', email: 'pro@example.com' },
  });
  assert.equal(blankEmail.ok, false);
});

test('a failed provider lookup does not authorize a different caller', () => {
  const ownLookup = authorizeAssignedProvider({
    authUserId: 'provider-auth-2',
    authEmail: 'pro@example.com',
    assignedProviderId: 'provider-auth-1',
    accountLookupFailed: true,
    assignedAccount: { service_provider_id: 'provider-auth-1', email: 'pro@example.com' },
  });
  assert.equal(ownLookup.ok, false);
  if (!ownLookup.ok) {
    assert.equal(ownLookup.status, 500);
    assert.equal(ownLookup.error, COMPLETE_UNAVAILABLE);
  }

  const assignedLookup = authorizeAssignedProvider({
    authUserId: 'new-auth-id',
    authEmail: 'pro@example.com',
    assignedProviderId: 'legacy-provider-id',
    accountForAuthId: null,
    assignedLookupFailed: true,
  });
  assert.equal(assignedLookup.ok, false);
  if (!assignedLookup.ok) assert.equal(assignedLookup.status, 500);
});
