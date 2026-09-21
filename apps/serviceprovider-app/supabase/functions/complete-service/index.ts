import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';
import { parseBearerToken } from '../_shared/chargeAuthorization.ts';
import {
  COMPLETE_NOT_CONFIGURED,
  COMPLETE_SIGN_IN,
  authorizeAssignedProvider,
  type ProviderAccountRef,
} from '../_shared/completeServiceAuthorization.ts';
import {
  PAYOUT_LEDGER_COMPLETED,
  PAYOUT_LEDGER_PENDING,
  PAYOUT_LEDGER_TRANSFER_RECORDED,
  choosePayoutLedger,
  isUniqueViolation,
  nextLedgerStatus,
  payoutTransferGroup,
  resolveServicePayout,
  type PayoutLedger,
} from '../_shared/payoutTransferIdempotency.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROVIDER_PAYOUT_COLUMNS = 'service_provider_id, email, stripe_account_id, first_name, last_name, balance';

type ProviderPayoutRow = ProviderAccountRef & {
  stripe_account_id?: string | null;
  balance?: number | null;
};

function completionResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let callerVerified = false;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Cannot authorize complete-service: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
      return completionResponse({ success: false, error: COMPLETE_NOT_CONFIGURED }, 500);
    }

    const jwt = parseBearerToken(req.headers.get('Authorization'));
    if (!jwt) {
      return completionResponse({ success: false, error: COMPLETE_SIGN_IN }, 401);
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError || !userData.user?.id) {
      console.error('complete-service rejected: caller is not signed in', userError);
      return completionResponse({ success: false, error: COMPLETE_SIGN_IN }, 401);
    }
    callerVerified = true;
    const authUserId = userData.user.id;
    const authEmail = typeof userData.user.email === 'string' ? userData.user.email : null;

    const { serviceId, platformFeePercent, skipCustomerCharge } = await req.json();

    if (!serviceId || typeof serviceId !== 'string') {
      throw new Error('Missing required parameter: serviceId');
    }

    console.log('Processing service completion:', { serviceId, platformFeePercent, skipCustomerCharge });

    const { data: service, error: serviceError } = await supabaseClient
      .from('service')
      .select('service_id, customer_id, service_provider_id, price, status, payment_intent_id, payment_status')
      .eq('service_id', serviceId)
      .single();

    if (serviceError || !service) {
      throw new Error('Service not found');
    }

    const assignedProviderId = typeof service.service_provider_id === 'string'
      ? service.service_provider_id
      : null;
    const providerAccess = await loadAssignedProviderAccess(supabaseClient, {
      authUserId,
      assignedProviderId,
    });
    const decision = authorizeAssignedProvider({
      authUserId,
      authEmail,
      assignedProviderId,
      accountForAuthId: providerAccess.accountForAuthId,
      assignedAccount: providerAccess.assignedAccount,
      accountLookupFailed: providerAccess.accountLookupFailed,
      assignedLookupFailed: providerAccess.assignedLookupFailed,
    });
    if (!decision.ok) {
      console.error('complete-service rejected before payout', {
        serviceId,
        authUserId,
        status: decision.status,
      });
      return completionResponse({ success: false, error: decision.error }, decision.status);
    }

    if (!service.customer_id || !service.service_provider_id || !service.price) {
      throw new Error('Service is missing required fields (customer_id, service_provider_id, or price)');
    }

    const hasPaymentIntent = service.payment_intent_id && service.payment_status === 'paid';
    if (!hasPaymentIntent || !service.payment_intent_id) {
      throw new Error('Payment must be authorized through customer app first. No payment intent found.');
    }

    let provider: ProviderPayoutRow | null = providerAccess.assignedAccount;
    if (!provider) {
      const { data, error: providerError } = await supabaseClient
        .from('service_provider')
        .select(PROVIDER_PAYOUT_COLUMNS)
        .eq('service_provider_id', service.service_provider_id)
        .single();
      if (providerError || !data) {
        throw new Error('Provider not found');
      }
      provider = data as ProviderPayoutRow;
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const baseServiceAmount = Math.round(service.price * 100);
    const servicePriceForCalc = service.price;
    const platformFeeAmount = servicePriceForCalc * 0.01;
    const processingFeeAmount = (servicePriceForCalc + platformFeeAmount) * 0.029 + 0.30;
    const totalAmountPaid = Math.round((servicePriceForCalc + platformFeeAmount + processingFeeAmount) * 100);
    const providerAmount = baseServiceAmount;
    const platformFeeInCents = Math.round(platformFeeAmount * 100);
    const processingFeeInCents = Math.round(processingFeeAmount * 100);
    const applicationFeeInCents = platformFeeInCents + processingFeeInCents;
    const providerAmountDollars = providerAmount / 100;

    console.log('Fee breakdown:', {
      totalAmountPaid: totalAmountPaid / 100,
      baseServiceAmount: baseServiceAmount / 100,
      platformFeeInCents: platformFeeInCents / 100,
      processingFeeInCents: processingFeeInCents / 100,
      applicationFeeInCents: applicationFeeInCents / 100,
      providerReceives: providerAmount / 100,
    });

    let chargeId: string | null = null;

    const payout = await resolveServicePayout({
      serviceId,
      deps: {
        readLedger: async () => readPayoutLedger(supabaseClient, serviceId),
        listTransfers: async () => {
          const listed = await stripe.transfers.list({
            transfer_group: payoutTransferGroup(serviceId),
            limit: 10,
          });
          return listed.data.map((transfer) => ({
            id: transfer.id,
            created: transfer.created,
            reversed: transfer.reversed,
          }));
        },
        prepareCharge: async () => {
          if (!provider.stripe_account_id) {
            throw new Error('Provider has not completed payment setup');
          }
          chargeId = await capturePaidCharge(stripe, service.payment_intent_id);
        },
        insertClaim: async () => {
          const { error } = await supabaseClient.from('platform_transactions').insert({
            customer_id: service.customer_id,
            provider_id: service.service_provider_id,
            service_id: serviceId,
            total_amount: totalAmountPaid / 100,
            platform_fee: platformFeeInCents / 100,
            provider_amount: providerAmountDollars,
            stripe_fee: processingFeeInCents / 100,
            net_platform_fee: platformFeeInCents / 100,
            stripe_charge_id: chargeId,
            stripe_payment_intent_id: service.payment_intent_id,
            status: PAYOUT_LEDGER_PENDING,
          });
          if (!error) return 'inserted';
          if (isUniqueViolation(error)) return 'conflict';
          throw new Error(`Failed to record payout before transfer: ${error.message}`);
        },
        createTransfer: async (idempotencyKey) => {
          if (!provider.stripe_account_id || !chargeId) {
            throw new Error('Provider payout is missing the charge or Connect account');
          }
          console.log('Transferring', providerAmountDollars, 'to provider', { serviceId, idempotencyKey });
          const transfer = await stripe.transfers.create({
            amount: providerAmount,
            currency: 'usd',
            destination: provider.stripe_account_id,
            source_transaction: chargeId,
            transfer_group: payoutTransferGroup(serviceId),
            description: 'Payment for completed service',
            metadata: {
              charge_id: chargeId,
              payment_intent_id: service.payment_intent_id,
              service_id: serviceId,
              customer_id: service.customer_id,
              provider_id: service.service_provider_id,
              platform_fee: platformFeeInCents.toString(),
            },
          }, {
            idempotencyKey,
          });
          return { id: transfer.id };
        },
        saveTransfer: async (transferId, status) => {
          await persistTransferId(supabaseClient, {
            service,
            serviceId,
            transferId,
            status,
            chargeId,
            totalAmountPaid,
            platformFeeInCents,
            processingFeeInCents,
            providerAmountDollars,
          });
        },
        creditBalanceIfRecorded: async () => {
          return creditRecordedPayout(supabaseClient, {
            serviceId,
            providerId: service.service_provider_id,
            providerAmountDollars,
          });
        },
        markServiceCompleted: async () => {
          const { error } = await supabaseClient
            .from('service')
            .update({ status: 'completed' })
            .eq('service_id', serviceId);
          if (error) {
            throw new Error(`Payout ${serviceId} was recorded, but the service status did not update. Retry to finish completion.`);
          }
        },
      },
    });

    const { data: freshProvider } = await supabaseClient
      .from('service_provider')
      .select('balance')
      .eq('service_provider_id', service.service_provider_id)
      .maybeSingle();

    const ledger = await readPayoutLedger(supabaseClient, serviceId);

    return completionResponse({
      success: true,
      already_processed: !payout.created,
      charge_id: chargeId ?? ledger?.stripe_charge_id ?? null,
      transfer_id: payout.transferId,
      payment_intent_id: service.payment_intent_id,
      total_amount_charged: totalAmountPaid / 100,
      service_price: service.price,
      platform_fee: platformFeeInCents / 100,
      processing_fee: processingFeeInCents / 100,
      provider_amount: providerAmountDollars,
      new_balance: freshProvider?.balance ?? provider.balance ?? 0,
      message: payout.created
        ? 'Service completed - payment captured to platform, then transferred to provider'
        : 'Payment already processed',
    }, 200);
  } catch (error) {
    if (!callerVerified) {
      console.error('complete-service rejected before the caller was verified', error);
      return completionResponse({ success: false, error: COMPLETE_SIGN_IN }, 401);
    }
    console.error('Service completion error:', error);

    let userMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      userMessage = error.message;
    } else if (typeof error === 'string') {
      userMessage = error;
    }

    return completionResponse({
      success: false,
      error: userMessage,
    }, 200);
  }
});

async function loadAssignedProviderAccess(supabaseClient, input: {
  authUserId: string;
  assignedProviderId: string | null;
}): Promise<{
  accountForAuthId: ProviderAccountRef | null;
  assignedAccount: ProviderPayoutRow | null;
  accountLookupFailed: boolean;
  assignedLookupFailed: boolean;
}> {
  if (!input.assignedProviderId || input.authUserId === input.assignedProviderId) {
    return {
      accountForAuthId: null,
      assignedAccount: null,
      accountLookupFailed: false,
      assignedLookupFailed: false,
    };
  }

  const own = await supabaseClient
    .from('service_provider')
    .select('service_provider_id, email')
    .eq('service_provider_id', input.authUserId)
    .maybeSingle();

  if (own.error || own.data?.service_provider_id) {
    return {
      accountForAuthId: own.data ?? null,
      assignedAccount: null,
      accountLookupFailed: Boolean(own.error),
      assignedLookupFailed: false,
    };
  }

  const assigned = await supabaseClient
    .from('service_provider')
    .select(PROVIDER_PAYOUT_COLUMNS)
    .eq('service_provider_id', input.assignedProviderId)
    .maybeSingle();

  return {
    accountForAuthId: null,
    assignedAccount: (assigned.data ?? null) as ProviderPayoutRow | null,
    accountLookupFailed: false,
    assignedLookupFailed: Boolean(assigned.error),
  };
}

async function readPayoutLedger(supabaseClient, serviceId: string): Promise<PayoutLedger | null> {
  const { data, error } = await supabaseClient
    .from('platform_transactions')
    .select('transaction_id, service_id, stripe_transfer_id, stripe_payment_intent_id, stripe_charge_id, status')
    .eq('service_id', serviceId)
    .limit(10);

  if (error) {
    throw new Error(`Could not read the payout ledger: ${error.message}`);
  }

  return choosePayoutLedger(data ?? []);
}

async function capturePaidCharge(stripe, paymentIntentId: string): Promise<string> {
  console.log('Customer payment authorized. Retrieving Payment Intent:', paymentIntentId);

  let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['charges'],
  });

  console.log('Payment Intent status:', paymentIntent.status);

  if (paymentIntent.status === 'requires_capture') {
    console.log('Capturing authorized payment to platform balance...');
    paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    console.log('Payment captured to platform balance. Status:', paymentIntent.status);
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['charges'],
    });
  } else if (paymentIntent.status === 'succeeded') {
    console.log('Payment already captured');
  } else if (
    paymentIntent.status === 'requires_payment_method'
    || paymentIntent.status === 'requires_confirmation'
    || paymentIntent.status === 'requires_action'
  ) {
    throw new Error(`Payment requires customer action. Please complete payment in the customer app first. Status: ${paymentIntent.status}`);
  } else {
    throw new Error(`Payment not authorized. Status: ${paymentIntent.status}`);
  }

  const chargeId = readChargeId(paymentIntent);
  if (!chargeId) {
    console.error('No charge ID found for Payment Intent', paymentIntentId, paymentIntent.status);
    throw new Error('Payment captured but no charge ID found. Please contact support.');
  }

  return chargeId;
}

function readChargeId(paymentIntent): string | null {
  if (paymentIntent.charges?.data && paymentIntent.charges.data.length > 0) {
    return paymentIntent.charges.data[0].id ?? null;
  }
  if (!paymentIntent.latest_charge) return null;
  if (typeof paymentIntent.latest_charge === 'string') return paymentIntent.latest_charge;
  return paymentIntent.latest_charge.id ?? null;
}

async function persistTransferId(supabaseClient, input: {
  service: { customer_id: string; service_provider_id: string; payment_intent_id: string };
  serviceId: string;
  transferId: string;
  status: string;
  chargeId: string | null;
  totalAmountPaid: number;
  platformFeeInCents: number;
  processingFeeInCents: number;
  providerAmountDollars: number;
}) {
  const current = await readPayoutLedger(supabaseClient, input.serviceId);
  const status = nextLedgerStatus(current, input.status);
  if (!status) {
    console.log('Payout ledger already completed', { serviceId: input.serviceId, transferId: input.transferId });
    return;
  }

  const patch: Record<string, unknown> = {
    stripe_transfer_id: input.transferId,
    stripe_payment_intent_id: input.service.payment_intent_id,
    status,
  };
  if (input.chargeId) patch.stripe_charge_id = input.chargeId;

  const { data, error } = await supabaseClient
    .from('platform_transactions')
    .update(patch)
    .eq('service_id', input.serviceId)
    .select('transaction_id');

  if (error) {
    throw new Error(`Failed to record transfer ${input.transferId}: ${error.message}`);
  }
  if (data && data.length > 0) return;

  const { error: insertError } = await supabaseClient.from('platform_transactions').insert({
    customer_id: input.service.customer_id,
    provider_id: input.service.service_provider_id,
    service_id: input.serviceId,
    total_amount: input.totalAmountPaid / 100,
    platform_fee: input.platformFeeInCents / 100,
    provider_amount: input.providerAmountDollars,
    stripe_fee: input.processingFeeInCents / 100,
    net_platform_fee: input.platformFeeInCents / 100,
    ...(input.chargeId ? { stripe_charge_id: input.chargeId } : {}),
    stripe_transfer_id: input.transferId,
    stripe_payment_intent_id: input.service.payment_intent_id,
    status,
  });

  if (insertError && !isUniqueViolation(insertError)) {
    throw new Error(`Failed to record transfer ${input.transferId}: ${insertError.message}`);
  }
}

async function creditRecordedPayout(supabaseClient, input: {
  serviceId: string;
  providerId: string;
  providerAmountDollars: number;
}): Promise<'credited' | 'already'> {
  const { data: won, error: winError } = await supabaseClient
    .from('platform_transactions')
    .update({ status: PAYOUT_LEDGER_COMPLETED })
    .eq('service_id', input.serviceId)
    .eq('status', PAYOUT_LEDGER_TRANSFER_RECORDED)
    .select('transaction_id');

  if (winError) {
    throw new Error(`Failed to record payout before crediting balance: ${winError.message}`);
  }
  if (!won || won.length === 0) return 'already';

  const { data: latest, error: readError } = await supabaseClient
    .from('service_provider')
    .select('balance')
    .eq('service_provider_id', input.providerId)
    .single();

  if (readError) {
    await reopenPayoutLedger(supabaseClient, input.serviceId);
    throw new Error(`Failed to update provider balance: ${readError.message}`);
  }

  const newBalance = (latest?.balance || 0) + input.providerAmountDollars;
  const { error: balanceError } = await supabaseClient
    .from('service_provider')
    .update({ balance: newBalance })
    .eq('service_provider_id', input.providerId);

  if (balanceError) {
    await reopenPayoutLedger(supabaseClient, input.serviceId);
    throw new Error(`Failed to update provider balance: ${balanceError.message}`);
  }

  return 'credited';
}

async function reopenPayoutLedger(supabaseClient, serviceId: string) {
  const { error } = await supabaseClient
    .from('platform_transactions')
    .update({ status: PAYOUT_LEDGER_TRANSFER_RECORDED })
    .eq('service_id', serviceId)
    .eq('status', PAYOUT_LEDGER_COMPLETED);

  if (error) {
    console.error('Failed to reopen payout ledger after balance error:', error);
  }
}
