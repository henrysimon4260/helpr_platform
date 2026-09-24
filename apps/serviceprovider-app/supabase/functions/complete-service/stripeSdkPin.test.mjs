import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { chargeIdFromLatestCharge } from './chargeId.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const STRIPE_PIN = 'https://esm.sh/stripe@14.21.0?target=deno'
const CONFIG_NAMES = new Set(['deno.json', 'deno.jsonc', 'import_map.json'])

const functionRoots = [
  'apps/serviceprovider-app/supabase/functions',
  'apps/customer-app/supabase/functions',
]

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.temp' || entry.name.startsWith('.')) {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, acc)
      continue
    }
    if (entry.name === 'index.ts' || CONFIG_NAMES.has(entry.name)) {
      acc.push({
        rel: relative(repoRoot, full),
        source: readFileSync(full, 'utf8'),
      })
    }
  }
  return acc
}

function edgeSources() {
  const files = []
  for (const relRoot of functionRoots) {
    const full = join(repoRoot, relRoot)
    if (!existsSync(full) || !statSync(full).isDirectory()) {
      continue
    }
    walk(full, files)
  }
  return files
}

test('payment edge functions construct Stripe from one major', () => {
  const files = edgeSources()
  const stripeFiles = files.filter((file) => file.source.includes('esm.sh/stripe'))

  assert.deepEqual(
    stripeFiles.map((file) => file.rel).sort(),
    [
      'apps/serviceprovider-app/supabase/functions/complete-service/index.ts',
      'apps/serviceprovider-app/supabase/functions/create-connect-account/index.ts',
      'apps/serviceprovider-app/supabase/functions/create-payment-intent/index.ts',
    ],
  )

  for (const file of stripeFiles) {
    assert.match(file.source, new RegExp(STRIPE_PIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(file.source.includes('stripe@12'), false, file.rel)
    assert.match(file.source, /apiVersion:\s*'2023-10-16'/, file.rel)
    assert.match(file.source, /httpClient:\s*Stripe\.createFetchHttpClient\(\)/, file.rel)
    assert.equal(/expand:\s*\[[^\]]*['"]charges['"]/.test(file.source), false, file.rel)
    assert.equal(/\.charges\b/.test(file.source), false, file.rel)
  }

  const configPins = files.filter((file) => CONFIG_NAMES.has(file.rel.split('/').pop()))
  for (const file of configPins) {
    assert.equal(file.source.includes('stripe@'), false, file.rel)
  }
})

test('latest_charge resolves the id stripe@14 returns', () => {
  assert.equal(chargeIdFromLatestCharge('ch_123'), 'ch_123')
  assert.equal(chargeIdFromLatestCharge({ id: 'ch_expanded' }), 'ch_expanded')
  assert.equal(chargeIdFromLatestCharge(null), null)
  assert.equal(chargeIdFromLatestCharge(undefined), null)
  assert.equal(chargeIdFromLatestCharge({ id: '' }), null)
})
