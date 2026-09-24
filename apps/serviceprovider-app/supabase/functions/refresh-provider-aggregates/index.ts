import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { refreshProviderAggregates } from '../_shared/providerAggregates.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const providerId = body?.serviceProviderId || body?.service_provider_id;

    if (!providerId || typeof providerId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing serviceProviderId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const aggregate = await refreshProviderAggregates(supabaseClient, providerId);
    if (!aggregate.ok) {
      return new Response(
        JSON.stringify({ success: false, error: aggregate.error ?? 'Failed to refresh provider aggregates' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobs_completed: aggregate.jobsCompleted,
        rating: aggregate.rating,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
