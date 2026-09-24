/**
 * Provider profile aggregates shown on select-a-pro.
 *
 * jobs_completed: number of `service` rows for this provider with status `completed`.
 * rating: mean of `service_provider_ratings.rating` values from 1 to 5, rounded to
 * 2 decimal places. Null when the provider has no valid ratings.
 *
 * Signup seeds `jobs_completed: 0` and `rating: null`. This recompute overwrites
 * those columns from source rows. It does not touch balance or payment fields.
 *
 * Keep the formula in sync with
 * supabase/migrations/20260924120000_refresh_provider_aggregates.sql.
 */

const MIN_RATING = 1;
const MAX_RATING = 5;

export function coerceRating(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function computeProviderAggregates({ completedJobCount, ratings }) {
  const jobs = Number(completedJobCount);
  const jobsCompleted = Number.isFinite(jobs) && jobs > 0 ? Math.floor(jobs) : 0;

  const validRatings = [];
  for (const raw of ratings ?? []) {
    const rating = coerceRating(raw);
    if (rating === null || rating < MIN_RATING || rating > MAX_RATING) {
      continue;
    }
    validRatings.push(rating);
  }

  if (validRatings.length === 0) {
    return { jobsCompleted, rating: null };
  }

  const sum = validRatings.reduce((total, rating) => total + rating, 0);
  return {
    jobsCompleted,
    rating: Number((sum / validRatings.length).toFixed(2)),
  };
}

/**
 * Recompute `service_provider.jobs_completed` and `rating` for one provider.
 * Uses whatever rows are already committed. Safe to run more than once.
 */
export async function recomputeProviderAggregates(supabaseClient, providerId) {
  if (!providerId) {
    return { ok: false, error: 'Missing service provider id' };
  }

  try {
    const { count, error: countError } = await supabaseClient
      .from('service')
      .select('service_id', { count: 'exact', head: true })
      .eq('service_provider_id', providerId)
      .eq('status', 'completed');

    if (countError) {
      return { ok: false, error: countError.message || 'Failed to count completed jobs' };
    }

    const { data: ratingRows, error: ratingError } = await supabaseClient
      .from('service_provider_ratings')
      .select('rating')
      .eq('service_provider_id', providerId);

    if (ratingError) {
      return { ok: false, error: ratingError.message || 'Failed to load provider ratings' };
    }

    const aggregate = computeProviderAggregates({
      completedJobCount: count ?? 0,
      ratings: (ratingRows ?? []).map((row) => row?.rating),
    });

    const { error: updateError } = await supabaseClient
      .from('service_provider')
      .update({
        jobs_completed: aggregate.jobsCompleted,
        rating: aggregate.rating,
      })
      .eq('service_provider_id', providerId);

    if (updateError) {
      return { ok: false, error: updateError.message || 'Failed to update provider aggregates' };
    }

    return { ok: true, via: 'recompute', ...aggregate };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

function coerceCount(value) {
  const jobs = Number(value);
  return Number.isFinite(jobs) && jobs > 0 ? Math.floor(jobs) : 0;
}

function coerceStoredRating(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const rating = coerceRating(value);
  if (rating === null) {
    return null;
  }
  return Number(rating.toFixed(2));
}

/**
 * Prefer the database function so the read and write happen in one statement.
 * If that function is not installed yet, recompute from the service-role client.
 */
export async function refreshProviderAggregates(supabaseClient, providerId) {
  if (!providerId) {
    return { ok: false, error: 'Missing service provider id' };
  }

  try {
    const { error: rpcError } = await supabaseClient.rpc('refresh_service_provider_aggregates', {
      p_provider_id: providerId,
    });

    if (!rpcError) {
      const { data, error: readError } = await supabaseClient
        .from('service_provider')
        .select('jobs_completed, rating')
        .eq('service_provider_id', providerId)
        .maybeSingle();

      if (readError) {
        return { ok: true, via: 'rpc', jobsCompleted: null, rating: null };
      }

      return {
        ok: true,
        via: 'rpc',
        jobsCompleted: coerceCount(data?.jobs_completed),
        rating: coerceStoredRating(data?.rating),
      };
    }
  } catch (error) {
    console.error('Provider aggregate function failed, recomputing directly:', error);
  }

  return recomputeProviderAggregates(supabaseClient, providerId);
}
