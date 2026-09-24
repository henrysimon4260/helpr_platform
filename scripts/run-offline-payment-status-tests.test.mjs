import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EXTRA_OFFLINE_TESTS,
  EXPECTED_SUITES,
  discoverOfflineTests,
  isOfflinePaymentStatusTest,
} from './run-offline-payment-status-tests.mjs';

test('classifies the HLP-32 payment and status suites as offline', () => {
  for (const rel of EXPECTED_SUITES) {
    assert.equal(isOfflinePaymentStatusTest(rel), true, rel);
  }
  assert.equal(
    isOfflinePaymentStatusTest(
      'apps/serviceprovider-app/supabase/functions/_shared/paymentIntentIdempotency.test.mjs',
    ),
    true,
  );
  assert.equal(
    isOfflinePaymentStatusTest(
      'apps/serviceprovider-app/supabase/functions/_shared/payoutTransferIdempotency.test.mjs',
    ),
    true,
  );
  assert.equal(
    isOfflinePaymentStatusTest(
      'apps/serviceprovider-app/supabase/functions/_shared/cancelledRefund.test.mjs',
    ),
    true,
  );
  assert.equal(
    isOfflinePaymentStatusTest(
      'apps/serviceprovider-app/supabase/functions/_shared/bookingFees.test.mjs',
    ),
    true,
  );
  assert.equal(
    isOfflinePaymentStatusTest('apps/customer-app/supabase/functions/quote/quote.test.ts'),
    true,
  );
  for (const rel of EXTRA_OFFLINE_TESTS) {
    assert.equal(isOfflinePaymentStatusTest(rel), true, rel);
  }
});

test('does not select live Stripe or hosted Supabase scripts', () => {
  const excluded = [
    'apps/serviceprovider-app/scripts/test-edge-function.js',
    'apps/serviceprovider-app/scripts/test-id-document-parameters.js',
    'apps/serviceprovider-app/scripts/test-signup-flow.js',
    'apps/serviceprovider-app/scripts/test-ssn-parameter.js',
    'apps/serviceprovider-app/scripts/test-stripe-redirect-flow.js',
    'apps/serviceprovider-app/scripts/delete-stripe-account.js',
    'apps/serviceprovider-app/scripts/delete-all-stripe-accounts.js',
    'apps/serviceprovider-app/scripts/list-stripe-accounts.js',
    'apps/serviceprovider-app/supabase/functions/complete-service/index.ts',
    'website/app/page.test.tsx',
    'apps/customer-app/src/app/(services)/moving/moving.edit.test.ts',
  ];
  for (const rel of excluded) {
    assert.equal(isOfflinePaymentStatusTest(rel), false, rel);
  }
});

test('discovery finds function and shared tests and skips provider scripts', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'helpr-ci-'));
  try {
    const files = [
      'shared/helpr-core/helpr-core.test.mjs',
      'apps/serviceprovider-app/supabase/functions/_shared/salesTax.test.mjs',
      'apps/serviceprovider-app/supabase/functions/complete-service/failureResponse.test.ts',
      'apps/customer-app/supabase/functions/quote/quote.test.ts',
      'apps/customer-app/src/lib/readPaymentIntentId.test.mjs',
      'apps/serviceprovider-app/scripts/test-edge-function.js',
      'apps/serviceprovider-app/supabase/functions/complete-service/index.ts',
    ];
    for (const rel of files) {
      const abs = path.join(dir, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, '');
    }

    assert.deepEqual(discoverOfflineTests(dir), [
      'apps/customer-app/src/lib/readPaymentIntentId.test.mjs',
      'apps/customer-app/supabase/functions/quote/quote.test.ts',
      'apps/serviceprovider-app/supabase/functions/_shared/salesTax.test.mjs',
      'apps/serviceprovider-app/supabase/functions/complete-service/failureResponse.test.ts',
      'shared/helpr-core/helpr-core.test.mjs',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('discovery on this checkout does not include provider scripts', () => {
  const found = discoverOfflineTests();
  for (const rel of found) {
    assert.equal(rel.startsWith('apps/serviceprovider-app/scripts/'), false, rel);
    assert.equal(isOfflinePaymentStatusTest(rel), true, rel);
  }
});
