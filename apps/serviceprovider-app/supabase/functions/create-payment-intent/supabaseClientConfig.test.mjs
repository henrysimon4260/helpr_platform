import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  MissingSupabaseEnvError,
  createConfiguredSupabaseClient,
  readSupabaseClientConfig,
} from './supabaseClientConfig.ts'

const PRODUCTION_PROJECT_REF = 'hecikcopbdhhiilhgmrd'

function envFrom(values) {
  return {
    get(name) {
      const value = values[name]
      return value === undefined ? undefined : value
    },
  }
}

test('refuses to construct a client when SUPABASE_URL is missing', () => {
  let factoryCalls = 0
  assert.throws(
    () => createConfiguredSupabaseClient(
      envFrom({ SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }),
      () => {
        factoryCalls += 1
        return { client: true }
      },
    ),
    (err) => {
      assert.ok(err instanceof MissingSupabaseEnvError)
      assert.deepEqual(err.missing, ['SUPABASE_URL'])
      assert.match(err.message, /SUPABASE_URL/)
      assert.equal(err.message.includes(PRODUCTION_PROJECT_REF), false)
      assert.equal(err.message.includes('supabase.co'), false)
      return true
    },
  )
  assert.equal(factoryCalls, 0)
})

test('refuses to construct a client when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
  let factoryCalls = 0
  assert.throws(
    () => createConfiguredSupabaseClient(
      envFrom({ SUPABASE_URL: 'https://example.supabase.co' }),
      () => {
        factoryCalls += 1
        return { client: true }
      },
    ),
    (err) => {
      assert.ok(err instanceof MissingSupabaseEnvError)
      assert.deepEqual(err.missing, ['SUPABASE_SERVICE_ROLE_KEY'])
      return true
    },
  )
  assert.equal(factoryCalls, 0)
})

test('treats blank env values as missing and does not invent a project URL', () => {
  assert.throws(
    () => readSupabaseClientConfig(envFrom({
      SUPABASE_URL: '   ',
      SUPABASE_SERVICE_ROLE_KEY: '',
    })),
    (err) => {
      assert.ok(err instanceof MissingSupabaseEnvError)
      assert.deepEqual(err.missing, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
      assert.equal(Object.hasOwn(err, 'url'), false)
      return true
    },
  )
})

test('returns only the env values that were provided', () => {
  const config = readSupabaseClientConfig(envFrom({
    SUPABASE_URL: ' https://staging.supabase.co ',
    SUPABASE_SERVICE_ROLE_KEY: ' service-role-key ',
  }))
  assert.deepEqual(config, {
    url: 'https://staging.supabase.co',
    serviceRoleKey: 'service-role-key',
  })

  const client = createConfiguredSupabaseClient(
    envFrom({
      SUPABASE_URL: 'https://staging.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    }),
    (url, serviceRoleKey) => ({ url, serviceRoleKey }),
  )
  assert.deepEqual(client, {
    url: 'https://staging.supabase.co',
    serviceRoleKey: 'service-role-key',
  })
})

test('charge and sibling payment functions do not hardcode the production project', () => {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const files = [
    `${here}/index.ts`,
    `${here}/../complete-service/index.ts`,
    `${here}/../stripe-redirect/index.ts`,
  ]
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    assert.equal(
      source.includes(PRODUCTION_PROJECT_REF),
      false,
      `${file} still contains the production project ref`,
    )
  }

  const chargeSource = readFileSync(`${here}/index.ts`, 'utf8')
  assert.match(chargeSource, /readSupabaseClientConfig/)
  assert.doesNotMatch(chargeSource, /\|\|\s*['"]https?:/)
  assert.equal(chargeSource.includes('supabase.co'), false)
})
