import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { syncHelprCore } from '../../scripts/sync-helpr-core.mjs';
import {
  PLATFORM_FEE_RATE,
  PROCESSING_FEE_RATE,
  bookingChargeCents,
  quoteBookingFees,
} from './fees.ts';
import {
  IN_PROGRESS_FEED_STATUSES,
  OPEN_FEED_STATUSES,
  SERVICE_STATUSES,
  STATUS_ANIMATION_FRAMES,
  VISIBLE_FEED_STATUSES,
  animationFrameForStatus,
  isServiceStatus,
  nextProviderCheckpointStatus,
} from './status.ts';
import { ALLOWED_SERVICE_ZONES, isWithinServiceArea, isWithinServiceZone } from './zones.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('synced copies match the canonical sources', () => {
  const result = syncHelprCore({ check: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('status spellings match the job contract and reject aliases', () => {
  assert.deepEqual(SERVICE_STATUSES, [
    'finding_pros',
    'pending',
    'scheduled',
    'select_service_provider',
    'confirmed',
    'helpr_otw',
    'in_progress',
    'completed',
  ]);
  assert.equal(isServiceStatus('helpr_otw'), true);
  assert.equal(isServiceStatus('on_the_way'), false);
  assert.equal(isServiceStatus('Helpr_Otw'), false);
  assert.equal(isServiceStatus('cancelled'), false);
  assert.equal(SERVICE_STATUSES.includes('cancelled'), false);
});

test('feed sets are the provider landing sets', () => {
  assert.deepEqual(OPEN_FEED_STATUSES, [
    'finding_pros',
    'pending',
    'scheduled',
    'select_service_provider',
  ]);
  assert.deepEqual(IN_PROGRESS_FEED_STATUSES, ['confirmed', 'helpr_otw', 'in_progress']);
  assert.equal(VISIBLE_FEED_STATUSES.includes('completed'), false);
  assert.equal(VISIBLE_FEED_STATUSES.includes('finding_pros'), true);
  assert.equal(VISIBLE_FEED_STATUSES.includes('in_progress'), true);
});

test('provider checkpoint order and shared animation frames', () => {
  assert.equal(nextProviderCheckpointStatus('confirmed'), 'helpr_otw');
  assert.equal(nextProviderCheckpointStatus('helpr_otw'), 'in_progress');
  assert.equal(nextProviderCheckpointStatus('in_progress'), 'completed');
  assert.equal(nextProviderCheckpointStatus('completed'), null);
  assert.equal(nextProviderCheckpointStatus('finding_pros'), null);
  assert.equal(nextProviderCheckpointStatus('CONFIRMED'), 'helpr_otw');

  assert.deepEqual(STATUS_ANIMATION_FRAMES, {
    confirmed: 0,
    helpr_otw: 20,
    in_progress: 50,
    completed: 70,
  });
  assert.equal(animationFrameForStatus('helpr_otw'), 20);
  assert.equal(animationFrameForStatus('HELPR_OTW'), 20);
  assert.equal(animationFrameForStatus('finding_pros'), 0);
  assert.equal(animationFrameForStatus(null), 0);
});

test('checkout quote stays 3% processing plus 1% platform', () => {
  assert.equal(PROCESSING_FEE_RATE, 0.03);
  assert.equal(PLATFORM_FEE_RATE, 0.01);

  const quote = quoteBookingFees(100);
  assert.deepEqual(quote, {
    baseCents: 10000,
    processingFeeCents: 300,
    platformFeeCents: 100,
    chargeCents: 10400,
  });
  assert.equal(bookingChargeCents(100), 10400);
  assert.equal(quoteBookingFees(10.1).chargeCents, 1050);
  assert.equal(quoteBookingFees(0), null);
  assert.equal(quoteBookingFees(-5), null);
  assert.equal(quoteBookingFees(Number.NaN), null);

  const prices = [0.5, 1, 10, 10.1, 10.116, 25, 30.49, 40, 99.99, 100, 250.75];
  for (const price of prices) {
    const processingFee = Math.round(price * 0.03 * 100) / 100;
    const platformFee = Math.round(price * 0.01 * 100) / 100;
    const totalAmount = Math.round((price + processingFee + platformFee) * 100) / 100;
    assert.equal(bookingChargeCents(price), Math.round(totalAmount * 100));
  }
});

test('core sources do not invent stripe percentage fees or sales tax', () => {
  for (const name of ['fees.ts', 'status.ts', 'zones.ts']) {
    const source = fs.readFileSync(path.join(root, 'shared/helpr-core', name), 'utf8');
    assert.equal(source.includes('0.029'), false, name);
    assert.equal(source.includes('0.15'), false, name);
    assert.equal(source.includes('salesTax'), false, name);
  }
});

test('inlined customer fee screens still use 3% and 1%', () => {
  const screens = [
    'apps/customer-app/src/app/(booking-flow)/select-helpr.tsx',
    'apps/customer-app/src/components/services/PaymentSummaryModal/PaymentSummaryModal.tsx',
  ];
  for (const relativePath of screens) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const usesHelper = source.includes('helpr-core/fees') || source.includes('quoteBookingFees');
    const usesInline = source.includes('0.03') && source.includes('0.01');
    assert.equal(usesHelper || usesInline, true, relativePath);
    assert.equal(source.includes('0.029'), false, relativePath);
  }
});

function zoneByName(name) {
  const zone = ALLOWED_SERVICE_ZONES.find((entry) => entry.name === name);
  assert.ok(zone, name);
  return zone;
}

test('service area boxes match the historical eight zones', () => {
  assert.deepEqual(
    ALLOWED_SERVICE_ZONES.map((zone) => zone.name),
    [
      'Manhattan',
      'Brooklyn',
      'Queens',
      'Bronx',
      'Staten Island',
      'Westchester County',
      'Hudson County',
      'Bergen County',
    ],
  );
});

test('point-in-zone accepts a known interior of each box and inclusive edges', () => {
  const interiors = [
    ['Manhattan', 40.7484, -73.9857],
    ['Brooklyn', 40.6782, -73.9442],
    ['Queens', 40.7675, -73.833],
    ['Bronx', 40.8296, -73.9262],
    ['Staten Island', 40.6437, -74.0776],
    ['Westchester County', 41.034, -73.7629],
    ['Hudson County', 40.7178, -74.0431],
    ['Bergen County', 40.8859, -74.0435],
  ];

  for (const [name, latitude, longitude] of interiors) {
    const coordinate = { latitude, longitude };
    assert.equal(isWithinServiceZone(coordinate, zoneByName(name)), true, name);
    assert.equal(isWithinServiceArea(coordinate), true, name);
  }

  const manhattan = zoneByName('Manhattan');
  assert.equal(
    isWithinServiceZone({ latitude: manhattan.minLat, longitude: manhattan.minLng }, manhattan),
    true,
  );
  assert.equal(
    isWithinServiceZone({ latitude: manhattan.maxLat, longitude: manhattan.maxLng }, manhattan),
    true,
  );

  const statenIsland = zoneByName('Staten Island');
  assert.equal(isWithinServiceArea({ latitude: statenIsland.minLat, longitude: -74.15 }), true);
  assert.equal(isWithinServiceArea({ latitude: statenIsland.minLat - 0.0001, longitude: -74.15 }), false);

  const westchester = zoneByName('Westchester County');
  assert.equal(
    isWithinServiceArea({ latitude: westchester.maxLat, longitude: westchester.maxLng }),
    true,
  );
  assert.equal(
    isWithinServiceArea({ latitude: westchester.maxLat, longitude: westchester.maxLng + 0.0001 }),
    false,
  );
});

test('point-in-zone rejects points outside every box', () => {
  const outside = [
    ['Boston', 42.3601, -71.0589],
    ['Philadelphia', 39.9526, -75.1652],
    ['west of Staten Island', 40.55, -74.26],
    ['north of Westchester', 41.358, -73.8],
    ['Montauk', 41.0359, -71.9545],
  ];
  for (const [name, latitude, longitude] of outside) {
    assert.equal(isWithinServiceArea({ latitude, longitude }), false, name);
  }
  assert.equal(isWithinServiceArea(null), false);
  assert.equal(isWithinServiceArea(undefined), false);
});

test('current boxes still over-include harbor water', () => {
  // New York Harbor near Governors Island is inside the Manhattan rectangle.
  // This locks the historical box. It is not a desired shoreline.
  const harbor = { latitude: 40.6895, longitude: -74.016 };
  assert.equal(isWithinServiceZone(harbor, zoneByName('Manhattan')), true);
  assert.equal(isWithinServiceArea(harbor), true);
});

test('composers import shared zones instead of local boxes', () => {
  const composers = [
    'apps/customer-app/src/app/(services)/cleaning.tsx',
    'apps/customer-app/src/app/(services)/furniture-assembly.tsx',
    'apps/customer-app/src/app/(services)/home-improvement.tsx',
    'apps/customer-app/src/app/(services)/wall-mounting.tsx',
    'apps/customer-app/src/app/(services)/custom-service.tsx',
  ];
  for (const relativePath of composers) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.equal(source.includes("from '../../lib/helpr-core/zones'"), true, relativePath);
    assert.equal(source.includes('minLat'), false, relativePath);
    assert.equal(source.includes('ALLOWED_SERVICE_ZONES'), false, relativePath);
  }

  const movingUtils = fs.readFileSync(
    path.join(root, 'apps/customer-app/src/app/(services)/moving/moving.utils.ts'),
    'utf8',
  );
  assert.equal(movingUtils.includes("from '../../../lib/helpr-core/zones'"), true);
  assert.equal(movingUtils.includes('minLat'), false);

  const movingTypes = fs.readFileSync(
    path.join(root, 'apps/customer-app/src/app/(services)/moving/moving.types.ts'),
    'utf8',
  );
  assert.equal(movingTypes.includes('ServiceZoneBoundingBox'), false);
});

test('zone coordinates live only in synced helpr-core copies', () => {
  const allowed = new Set([
    'shared/helpr-core/zones.ts',
    'apps/customer-app/src/lib/helpr-core/zones.ts',
    'apps/serviceprovider-app/src/lib/helpr-core/zones.ts',
    'apps/serviceprovider-app/supabase/functions/_shared/helpr-core/zones.ts',
  ]);
  // Split so this file does not itself contain the coordinate literal.
  const needle = 'minLat: ' + '40.6808';
  const hits = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|md)$/.test(entry.name)) continue;
      const relativePath = path.relative(root, full);
      const source = fs.readFileSync(full, 'utf8');
      if (source.includes(needle) && !allowed.has(relativePath)) {
        hits.push(relativePath);
      }
    }
  }

  walk(root);
  assert.deepEqual(hits, []);
});
