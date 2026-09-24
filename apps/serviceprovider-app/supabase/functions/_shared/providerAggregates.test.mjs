import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  computeProviderAggregates,
  recomputeProviderAggregates,
  refreshProviderAggregates,
} from './providerAggregates.mjs';

test('averages valid ratings and counts completed jobs', () => {
  const aggregate = computeProviderAggregates({
    completedJobCount: 3,
    ratings: [5, 4, 4],
  });

  assert.deepEqual(aggregate, { jobsCompleted: 3, rating: 4.33 });
});

test('ignores null, non-numeric, and out-of-range ratings', () => {
  const aggregate = computeProviderAggregates({
    completedJobCount: 2,
    ratings: [null, '5', 0, 6, 'nope', 4],
  });

  assert.deepEqual(aggregate, { jobsCompleted: 2, rating: 4.5 });
});

test('leaves rating null when the provider has no valid ratings', () => {
  const aggregate = computeProviderAggregates({
    completedJobCount: 0,
    ratings: [null, 0],
  });

  assert.deepEqual(aggregate, { jobsCompleted: 0, rating: null });
});

test('recompute writes jobs_completed and rating from source rows', async () => {
  const updates = [];
  const client = fakeSupabase({
    service: { count: 2 },
    service_provider_ratings: { data: [{ rating: 5 }, { rating: '3' }] },
    onUpdate: (table, payload, providerId) => {
      updates.push({ table, payload, providerId });
    },
  });

  const result = await recomputeProviderAggregates(client, 'provider-1');

  assert.equal(result.ok, true);
  assert.equal(result.jobsCompleted, 2);
  assert.equal(result.rating, 4);
  assert.deepEqual(updates, [
    {
      table: 'service_provider',
      providerId: 'provider-1',
      payload: { jobs_completed: 2, rating: 4 },
    },
  ]);
});

test('recompute does not write the profile when the count query fails', async () => {
  const updates = [];
  const client = fakeSupabase({
    service: { error: { message: 'count failed' } },
    onUpdate: (table, payload, providerId) => {
      updates.push({ table, payload, providerId });
    },
  });

  const result = await recomputeProviderAggregates(client, 'provider-1');

  assert.equal(result.ok, false);
  assert.equal(updates.length, 0);
});

test('refresh uses the sql function when it is installed', async () => {
  const updates = [];
  const client = fakeSupabase({
    rpcError: null,
    providerRow: { jobs_completed: 4, rating: '4.50' },
    onUpdate: () => updates.push('update'),
  });

  const result = await refreshProviderAggregates(client, 'provider-1');

  assert.equal(result.ok, true);
  assert.equal(result.via, 'rpc');
  assert.equal(result.jobsCompleted, 4);
  assert.equal(result.rating, 4.5);
  assert.deepEqual(updates, []);
});

test('refresh recomputes directly when the sql function is missing', async () => {
  const updates = [];
  const client = fakeSupabase({
    rpcError: { message: 'function not found' },
    service: { count: 1 },
    service_provider_ratings: { data: [{ rating: 5 }] },
    onUpdate: (_table, payload) => updates.push(payload),
  });

  const result = await refreshProviderAggregates(client, 'provider-1');

  assert.equal(result.ok, true);
  assert.equal(result.via, 'recompute');
  assert.equal(result.jobsCompleted, 1);
  assert.equal(result.rating, 5);
  assert.deepEqual(updates, [{ jobs_completed: 1, rating: 5 }]);
});

test('sql rollup matches the same completed-job and rating rules', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../migrations/20260924120000_refresh_provider_aggregates.sql',
  );
  const sql = readFileSync(sqlPath, 'utf8');

  assert.match(sql, /status = 'completed'/);
  assert.match(sql, /rating >= 1/);
  assert.match(sql, /rating <= 5/);
  assert.match(sql, /ROUND\(AVG\(rating\)::numeric, 2\)/);
  assert.match(sql, /service_provider_ratings/);
  assert.match(sql, /jobs_completed = v_jobs/);
  assert.match(sql, /rating = v_rating/);
});

function fakeSupabase({
  service,
  service_provider_ratings,
  providerRow,
  rpcError = null,
  onUpdate,
}) {
  return {
    rpc() {
      return Promise.resolve({ error: rpcError });
    },
    from(table) {
      const state = { table, filters: {} };
      const api = {
        select(_columns, options) {
          state.options = options;
          return api;
        },
        update(payload) {
          state.payload = payload;
          return api;
        },
        eq(column, value) {
          state.filters[column] = value;
          return api;
        },
        maybeSingle() {
          return Promise.resolve(respond(state));
        },
        then(resolve, reject) {
          try {
            resolve(respond(state));
          } catch (error) {
            reject(error);
          }
        },
      };
      return api;
    },
  };

  function respond(state) {
    if (state.table === 'service') {
      return { count: service?.count ?? null, error: service?.error ?? null, data: null };
    }
    if (state.table === 'service_provider_ratings') {
      return {
        data: service_provider_ratings?.data ?? [],
        error: service_provider_ratings?.error ?? null,
      };
    }
    if (state.table === 'service_provider' && state.payload) {
      onUpdate?.(state.table, state.payload, state.filters.service_provider_id);
      return { error: null };
    }
    if (state.table === 'service_provider') {
      return { data: providerRow ?? null, error: null };
    }
    return { error: { message: `unexpected query on ${state.table}` } };
  }
}
