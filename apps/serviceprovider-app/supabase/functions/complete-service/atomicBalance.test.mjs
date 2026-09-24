import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..', '..', '..')
const indexSource = readFileSync(join(here, 'index.ts'), 'utf8')
const migrationPath = join(
  repoRoot,
  'supabase/migrations/20260924023000_increment_provider_balance.sql',
)
const migrationSource = readFileSync(migrationPath, 'utf8')
const sqlTestPath = join(repoRoot, 'supabase/tests/increment_provider_balance.sql')

test('complete-service credits balance with one atomic RPC', () => {
  assert.match(indexSource, /supabaseClient\.rpc\(\s*'increment_provider_balance'/)
  assert.match(indexSource, /p_service_provider_id:\s*service\.service_provider_id/)
  assert.match(indexSource, /p_amount:\s*providerAmountDollars/)
  assert.match(indexSource, /const providerAmountDollars = providerAmount \/ 100/)
  assert.doesNotMatch(indexSource, /\.update\(\{\s*balance:/)
  assert.match(indexSource, /if \(paymentIntent\.status === 'requires_capture'\)/)
  assert.match(indexSource, /paymentIntents\.capture\(/)
})

test('migration adds dollars with SET balance = balance + amount', () => {
  assert.match(
    migrationSource,
    /SET balance = coalesce\(balance, 0\) \+ p_amount/,
  )
  assert.match(migrationSource, /SECURITY INVOKER/)
  assert.doesNotMatch(migrationSource, /SECURITY DEFINER/)
  assert.match(
    migrationSource,
    /REVOKE ALL ON FUNCTION public\.increment_provider_balance\(uuid, numeric\) FROM PUBLIC/,
  )
  assert.match(
    migrationSource,
    /REVOKE ALL ON FUNCTION public\.increment_provider_balance\(uuid, numeric\) FROM anon, authenticated/,
  )
  assert.match(
    migrationSource,
    /GRANT EXECUTE ON FUNCTION public\.increment_provider_balance\(uuid, numeric\) TO service_role/,
  )
})

test('concurrent credits sum when Postgres is running', (t) => {
  const psql = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'postgres', '-c', 'SELECT 1'], {
    encoding: 'utf8',
  })
  if (psql.status !== 0) {
    t.skip('sudo -u postgres psql is not available; run supabase/tests/increment_provider_balance.sql')
    return
  }

  const sudo = (args) => {
    const result = spawnSync('sudo', ['-u', 'postgres', 'psql', ...args], {
      encoding: 'utf8',
    })
    assert.equal(
      result.status,
      0,
      `psql ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`,
    )
    return result
  }

  sudo(['-d', 'postgres', '-c', 'DROP DATABASE IF EXISTS helpr_balance_test'])
  sudo(['-d', 'postgres', '-c', 'CREATE DATABASE helpr_balance_test'])
  const proof = sudo([
    '-d',
    'helpr_balance_test',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    sqlTestPath,
  ])
  assert.match(proof.stdout, /COMMIT/)
})
