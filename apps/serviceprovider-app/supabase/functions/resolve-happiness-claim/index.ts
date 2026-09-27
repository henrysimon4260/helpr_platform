import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import {
  planHappinessResolution,
  type HappinessDecision,
  type HappinessPayoutMethod,
  type OpenClaim,
} from './decision.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-helpr-ops-key',
};

const DECISIONS: HappinessDecision[] = ['approve', 'partial', 'deny', 'needs_info'];

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function resolveOperator(req: Request, supabaseUrl: string): Promise<string | null> {
  const configured = Deno.env.get('HELPR_OPS_KEY') ?? '';
  const presented = req.headers.get('x-helpr-ops-key') ?? '';
  if (configured.length > 0 && presented.length > 0 && safeEqual(configured, presented)) {
    return 'ops_key';
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!authHeader.startsWith('Bearer ') || !anonKey) {
    return null;
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  if (data.user.app_metadata?.role !== 'ops') return null;
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Use POST.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return json({ success: false, error: 'The server is missing its database credentials.' }, 500);
  }

  const operator = await resolveOperator(req, supabaseUrl);
  if (!operator) {
    return json({ success: false, error: 'Operations credentials are required.' }, 401);
  }

  let body: {
    claimId?: string;
    decision?: string;
    amountApprovedCents?: number | null;
    payoutMethod?: string | null;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: 'The request body must be JSON.' }, 400);
  }

  const claimId = body.claimId?.trim() ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claimId)) {
    return json({ success: false, error: 'A valid claimId is required.' }, 400);
  }
  if (!DECISIONS.includes(body.decision as HappinessDecision)) {
    return json({ success: false, error: 'decision must be approve, partial, deny, or needs_info.' }, 400);
  }

  const payoutMethod = body.payoutMethod ?? null;
  if (payoutMethod != null && payoutMethod !== 'stripe_refund' && payoutMethod !== 'manual') {
    return json({ success: false, error: 'payoutMethod must be stripe_refund or manual.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: claim, error: claimError } = await admin
    .from('helpr_happiness_claim')
    .select('id, status, amount_requested_cents, service_id')
    .eq('id', claimId)
    .maybeSingle();

  if (claimError) {
    return json({ success: false, error: 'The request could not be loaded.' }, 500);
  }
  if (!claim) {
    return json({ success: false, error: 'That request was not found.' }, 404);
  }

  const openClaim: OpenClaim = {
    status: claim.status,
    amountRequestedCents: claim.amount_requested_cents,
  };

  let refundableCents: number | null = null;
  let paymentIntentId: string | null = null;

  if (payoutMethod === 'stripe_refund') {
    const { data: service, error: serviceError } = await admin
      .from('service')
      .select('payment_intent_id, payment_status')
      .eq('service_id', claim.service_id)
      .maybeSingle();

    if (serviceError || !service) {
      return json({ success: false, error: 'The booked job could not be loaded.' }, 500);
    }
    if (service.payment_status !== 'paid' || !service.payment_intent_id) {
      return json({
        success: false,
        error: 'This job has no paid card charge to refund. Record a manual payout instead.',
      }, 400);
    }

    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    if (!stripeSecret) {
      return json({ success: false, error: 'Stripe is not configured on the server.' }, 500);
    }

    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(service.payment_intent_id, {
        expand: ['latest_charge'],
      });
      const received = paymentIntent.amount_received ?? 0;
      const latest = paymentIntent.latest_charge;
      const alreadyRefunded = latest && typeof latest !== 'string' ? latest.amount_refunded ?? 0 : 0;
      refundableCents = Math.max(0, received - alreadyRefunded);
      paymentIntentId = paymentIntent.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stripe could not be reached.';
      return json({ success: false, error: message }, 502);
    }
  }

  const plan = planHappinessResolution(openClaim, {
    decision: body.decision as HappinessDecision,
    amountApprovedCents: body.amountApprovedCents,
    payoutMethod: payoutMethod as HappinessPayoutMethod | null,
    notes: body.notes,
    refundableCents,
  });

  if (!plan.ok) {
    const status = plan.error === 'This request is already resolved.' ? 409 : 400;
    return json({ success: false, error: plan.error }, status);
  }

  let stripeRefundId: string | null = null;
  if (plan.stripeRefundCents && paymentIntentId) {
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: plan.stripeRefundCents,
        metadata: {
          kind: 'helpr_happiness',
          claim_id: claimId,
        },
      }, {
        idempotencyKey: `helpr-happiness-${claimId}`,
      });
      stripeRefundId = refund.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The card refund failed.';
      return json({ success: false, error: message }, 502);
    }
  }

  const { error: updateError } = await admin
    .from('helpr_happiness_claim')
    .update({
      status: plan.nextStatus,
      outcome: plan.outcome,
      amount_approved_cents: plan.amountApprovedCents,
      payout_method: plan.payoutMethod,
      stripe_refund_id: stripeRefundId,
      decision_notes: body.notes?.trim() ?? '',
      resolved_at: new Date().toISOString(),
      resolved_by: operator,
    })
    .eq('id', claimId);

  if (updateError) {
    return json({
      success: false,
      error: stripeRefundId
        ? `The card refund ${stripeRefundId} was created, but the request row did not save. Retry the same body.`
        : 'The outcome could not be saved.',
      stripeRefundId,
    }, 500);
  }

  return json({
    success: true,
    status: plan.nextStatus,
    outcome: plan.outcome,
    amountApprovedCents: plan.amountApprovedCents,
    payoutMethod: plan.payoutMethod,
    stripeRefundId,
  }, 200);
});
