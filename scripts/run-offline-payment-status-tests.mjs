#!/usr/bin/env node
/**
 * HLP-32: run offline payment and status unit tests.
 *
 * Discovers node:test files that do not need live Stripe or production
 * Supabase, then runs them with type stripping so `.test.mjs` files can
 * import the `.ts` modules they already lock.
 *
 * Not included:
 * - apps/serviceprovider-app/scripts/test-*.js (hosted Supabase / Stripe)
 * - apps/serviceprovider-app/scripts/delete-*.js and list-stripe-accounts.js
 * - supabase/tests/increment_provider_balance.sql (manual Postgres proof)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DISCOVERY_ROOTS = [
  'shared',
  'apps/serviceprovider-app/supabase/functions',
  'apps/customer-app/supabase/functions',
];

/** Offline races that live outside supabase/functions and shared/. */
export const EXTRA_OFFLINE_TESTS = [
  'apps/customer-app/src/app/(booking-flow)/confirmOpenJob.test.mjs',
  'apps/customer-app/src/lib/readPaymentIntentId.test.mjs',
];

/** Suites called out by HLP-32. Absent files are logged, not failed, until those PRs land. */
export const EXPECTED_SUITES = [
  'shared/helpr-core/helpr-core.test.mjs',
  'apps/serviceprovider-app/supabase/functions/_shared/salesTax.test.mjs',
  'apps/serviceprovider-app/supabase/functions/create-payment-intent/supabaseClientConfig.test.mjs',
  'apps/serviceprovider-app/supabase/functions/complete-service/stripeSdkPin.test.mjs',
  'apps/serviceprovider-app/supabase/functions/complete-service/failureResponse.test.ts',
  'apps/serviceprovider-app/supabase/functions/complete-service/atomicBalance.test.mjs',
];

const SELF_TEST = 'scripts/run-offline-payment-status-tests.test.mjs';
const SYNC_CHECK = 'scripts/sync-helpr-core.mjs';

const SKIP_DIR_NAMES = new Set(['node_modules', '.temp']);

export function normalizeRel(relPath) {
  return relPath.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isOfflinePaymentStatusTest(relPath) {
  const norm = normalizeRel(relPath);
  if (!norm.endsWith('.test.mjs') && !norm.endsWith('.test.ts')) return false;
  if (norm.startsWith('apps/serviceprovider-app/scripts/')) return false;
  if (norm.includes('/scripts/test-')) return false;
  if (norm.startsWith('shared/')) return true;
  if (norm.includes('/supabase/functions/')) return true;
  return EXTRA_OFFLINE_TESTS.includes(norm);
}

function walk(dir, repoRoot, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, repoRoot, found);
      continue;
    }
    const rel = normalizeRel(path.relative(repoRoot, full));
    if (isOfflinePaymentStatusTest(rel)) found.push(rel);
  }
}

export function discoverOfflineTests(repoRoot = root) {
  const found = [];
  for (const rel of DISCOVERY_ROOTS) {
    const abs = path.join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    walk(abs, repoRoot, found);
  }
  for (const rel of EXTRA_OFFLINE_TESTS) {
    if (existsSync(path.join(repoRoot, rel))) found.push(rel);
  }
  return [...new Set(found)].sort();
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  if (result.signal) {
    console.error(`node exited from signal ${result.signal}`);
    return 1;
  }
  return result.status ?? 1;
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  let status = 0;

  if (existsSync(path.join(root, SYNC_CHECK))) {
    console.log('helpr-core sync --check');
    const code = runNode([SYNC_CHECK, '--check']);
    if (code !== 0) status = code;
  } else {
    console.log('helpr-core sync --check skipped (scripts/sync-helpr-core.mjs is not on this revision)');
  }

  const tests = discoverOfflineTests();
  console.log(`offline payment/status tests: ${tests.length}`);
  for (const file of tests) console.log(`  ${file}`);

  const missing = EXPECTED_SUITES.filter((file) => !tests.includes(file));
  if (missing.length > 0) {
    console.log('expected suites not on this revision (they run once the files are present):');
    for (const file of missing) console.log(`  ${file}`);
  }

  console.log(
    'manual Postgres proof (not run here): supabase/tests/increment_provider_balance.sql',
  );

  const code = runNode([
    '--experimental-strip-types',
    '--test',
    SELF_TEST,
    ...tests,
  ]);
  if (code !== 0) status = code;
  process.exit(status);
}
