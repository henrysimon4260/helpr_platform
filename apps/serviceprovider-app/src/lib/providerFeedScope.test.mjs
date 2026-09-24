import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IN_PROGRESS_FEED_STATUS_QUERY,
  OPEN_FEED_STATUS_QUERY,
  resolveProviderFeedScope,
  SERVICE_FEED_COLUMNS,
} from './providerFeedScope.ts';

const openScope = (row) => {
  const scope = resolveProviderFeedScope(row);
  assert.equal(scope.queryOpen, true, scope.notice ?? scope.reason);
  return scope;
};

test('open feed statuses stay finding_pros and select_service_provider', () => {
  const lowered = OPEN_FEED_STATUS_QUERY.map(status => status.toLowerCase());
  assert.deepEqual([...new Set(lowered)].sort(), ['finding_pros', 'select_service_provider']);
  assert.equal(lowered.includes('pending'), false);
  assert.equal(lowered.includes('scheduled'), false);

  const inProgress = IN_PROGRESS_FEED_STATUS_QUERY.map(status => status.toLowerCase());
  assert.deepEqual(
    [...new Set(inProgress)].sort(),
    ['confirmed', 'helpr_otw', 'in_progress'],
  );
});

test('feed column list is explicit', () => {
  assert.equal(SERVICE_FEED_COLUMNS.includes('*'), false);
  assert.equal(SERVICE_FEED_COLUMNS.includes('service_type'), true);
  assert.equal(SERVICE_FEED_COLUMNS.includes('start_location'), true);
  assert.equal(SERVICE_FEED_COLUMNS.includes('location'), true);
});

test('borough on the profile scopes location columns to that zone', () => {
  const scope = openScope({ borough: 'Brooklyn', first_name: 'Ada' });
  assert.equal(scope.geoSource, 'profile');
  assert.deepEqual(scope.zoneNames, ['Brooklyn']);
  assert.match(scope.locationOr, /start_location\.ilike\.\*Brooklyn\*/);
  assert.match(scope.locationOr, /location\.ilike\."\*NY 112\*"/);
  assert.match(scope.locationOr, /end_location\.ilike\.\*Brooklyn\*/);
  assert.equal(scope.locationOr.includes('Queens'), false);
  assert.equal(scope.skillOr, null);
});

test('profile coordinates use the Helpr zone boxes, including overlap', () => {
  const queens = openScope({ latitude: 40.7282, longitude: -73.7949 });
  assert.equal(queens.geoSource, 'coordinates');
  assert.deepEqual(queens.zoneNames, ['Queens']);

  // North of Brooklyn's box, still inside both Hudson County and Manhattan.
  const overlap = openScope({ lat: 40.76, lng: -74.03 });
  assert.deepEqual(overlap.zoneNames, ['Manhattan', 'Hudson County']);
  assert.match(overlap.locationOr, /Manhattan/);
  assert.match(overlap.locationOr, /Jersey City/);
});

test('a point outside the service area fails closed', () => {
  const scope = resolveProviderFeedScope({ latitude: 42.3601, longitude: -71.0589 });
  assert.equal(scope.queryOpen, false);
  assert.equal(scope.reason, 'empty-geo');
});

test('an empty geo field fails closed', () => {
  const scope = resolveProviderFeedScope({ borough: '', skills: ['cleaning'] });
  assert.equal(scope.queryOpen, false);
  assert.equal(scope.reason, 'empty-geo');
});

test('an unmapped geo value fails closed', () => {
  const scope = resolveProviderFeedScope({ city: 'Boston' });
  assert.equal(scope.queryOpen, false);
  assert.equal(scope.reason, 'empty-geo');
});

test('no geo column falls back to every Helpr zone', () => {
  const scope = openScope({ first_name: 'Ada', email: 'ada@example.com', phone: null });
  assert.equal(scope.geoSource, 'service-area-fallback');
  assert.equal(scope.zoneNames.length, 8);
  assert.equal(scope.zoneNames.includes('Bergen County'), true);
  assert.equal(scope.skillOr, null);
  assert.equal(scope.notice, null);
});

test('missing provider row fails closed', () => {
  const scope = resolveProviderFeedScope(null);
  assert.equal(scope.queryOpen, false);
  assert.equal(scope.reason, 'missing-profile');
});

test('skills on the profile become a service_type predicate', () => {
  const scope = openScope({
    borough: 'Queens',
    skills: ['Cleaning', 'Furniture Assembly'],
  });
  assert.equal(scope.skillOr, 'service_type.ilike.*cleaning*,service_type.ilike.*furniture*');
});

test('a present but empty skills field fails closed', () => {
  const scope = resolveProviderFeedScope({ borough: 'Bronx', skills: [] });
  assert.equal(scope.queryOpen, false);
  assert.equal(scope.reason, 'empty-skills');
});

test('whole-value New York maps to Manhattan only', () => {
  const scope = openScope({ city: 'New York' });
  assert.deepEqual(scope.zoneNames, ['Manhattan']);
});
