import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const { serviceId, platformFeePercent, skipCustomerCharge } = await req.json();

    if (!serviceId) {
      throw new Error('Missing required parameter: serviceId');
    }

    console.log('Processing service completion:', { serviceId, platformFeePercent, skipCustomerCharge });

    // Get service details
    const { data: service, error: serviceError } = await supabaseClient
      .from('service')
      .select('service_id, customer_id, service_provider_id, price, status, payment_intent_id, payment_status')
      .eq('service_id', serviceId)
      .single();

    if (serviceError || !service) {
      throw new Error('Service not found');
    }

    if (!service.customer_id || !service.service_provider_id || !service.price) {
      throw new Error('Service is missing required fields (customer_id, service_provider_id, or price)');
    }

    // Check if customer already paid
    const hasPaymentIntent = service.payment_intent_id && service.payment_status === 'paid';
    
    if (hasPaymentIntent) {
      console.log('Payment Intent found:', service.payment_intent_id, '- Status:', service.payment_status);
    } else if (service.payment_intent_id) {
      console.log('Payment Intent exists but not marked as paid:', service.payment_intent_id, '- Status:', service.payment_status);
    }

    if (service.status === 'completed') {
      // Check if payment already processed
      const { data: existingTransaction } = await supabaseClient
        .from('platform_transactions')
        .select('transaction_id')
        .eq('service_id', serviceId)
        .maybeSingle();

      if (existingTransaction) {
        console.log('Payment already processed for this service');
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Payment already processed',
            already_processed: true,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
    }

    // Get provider's Stripe Connect account
    const { data: provider, error: providerError } = await supabaseClient
      .from('service_provider')
      .select('stripe_account_id, first_name, last_name, balance')
      .eq('service_provider_id', service.service_provider_id)
      .single();

    if (providerError || !provider) {
      throw new Error('Provider not found');
    }

    if (!provider.stripe_account_id) {
      throw new Error('Provider has not completed payment setup');
    }

    // Calculate fees
    const baseServiceAmount = Math.round(service.price * 100); // Service price in cents
    
    // Calculate the fees based on new formula: processing fee = 2.9% of (service + platform fee) + $0.30
    const servicePriceForCalc = service.price;
    const platformFeeAmount = servicePriceForCalc * 0.01; // 1% platform fee
    const processingFeeAmount = (servicePriceForCalc + platformFeeAmount) * 0.029 + 0.30; // 2.9% of (service + platform fee) + $0.30
    const totalAmountPaid = Math.round((servicePriceForCalc + platformFeeAmount + processingFeeAmount) * 100);
    
    // With direct charges, provider receives: total - application_fee (platform fee + processing fee)
    // Provider gets the base service amount
    const providerAmount = baseServiceAmount;
    
    // Platform keeps platform fee + processing fee (collected as application_fee)
    const platformFeeInCents = Math.round(platformFeeAmount * 100);
    const processingFeeInCents = Math.round(processingFeeAmount * 100);
    const applicationFeeInCents = platformFeeInCents + processingFeeInCents;

    console.log('Fee breakdown:', {
      totalAmountPaid: totalAmountPaid / 100,
      baseServiceAmount: baseServiceAmount / 100,
      platformFeeInCents: platformFeeInCents / 100,
      processingFeeInCents: processingFeeInCents / 100,
      applicationFeeInCents: applicationFeeInCents / 100,
      providerReceives: providerAmount / 100,
    });

    let chargeId = 'manual_payment';
    let transferId: string | null = null;

    // Check if customer already paid (via customer app's create-payment-intent)
    if (hasPaymentIntent && service.payment_intent_id) {
      console.log('Customer payment authorized. Retrieving Payment Intent:', service.payment_intent_id);
      
      // Get the Payment Intent
      let paymentIntent = await stripe.paymentIntents.retrieve(service.payment_intent_id, {
        expand: ['charges'],
      });
      
      console.log('Payment Intent status:', paymentIntent.status);
      
      // If payment is authorized (requires_capture), capture it now to YOUR platform balance
      if (paymentIntent.status === 'requires_capture') {
        console.log('Capturing authorized payment to platform balance...');
        paymentIntent = await stripe.paymentIntents.capture(service.payment_intent_id);
        console.log('Payment captured to platform balance. Status:', paymentIntent.status);
        console.log('Platform balance will show +$', totalAmountPaid / 100);
        
        // Retrieve again with expanded charges
        paymentIntent = await stripe.paymentIntents.retrieve(service.payment_intent_id, {
          expand: ['charges'],
        });
      } else if (paymentIntent.status === 'succeeded') {
        console.log('Payment already captured');
      } else {
        console.log('Payment not authorized, status:', paymentIntent.status);
        
        if (paymentIntent.status === 'requires_payment_method' || 
            paymentIntent.status === 'requires_confirmation' ||
            paymentIntent.status === 'requires_action') {
          throw new Error(`Payment requires customer action. Please complete payment in the customer app first. Status: ${paymentIntent.status}`);
        }
        
        throw new Error(`Payment not authorized. Status: ${paymentIntent.status}`);
      }

      // Get the charge ID
      let chargeIdFromIntent: string | null = null;
      
      if (paymentIntent.charges?.data && paymentIntent.charges.data.length > 0) {
        chargeIdFromIntent = paymentIntent.charges.data[0].id;
        console.log('Found charge ID from charges array:', chargeIdFromIntent);
      } else if (paymentIntent.latest_charge) {
        chargeIdFromIntent = typeof paymentIntent.latest_charge === 'string' 
          ? paymentIntent.latest_charge 
          : paymentIntent.latest_charge.id;
        console.log('Found charge ID from latest_charge:', chargeIdFromIntent);
      }
      
      if (!chargeIdFromIntent) {
        console.error('No charge ID found. Payment Intent:', JSON.stringify(paymentIntent, null, 2));
        throw new Error('Payment captured but no charge ID found. Please contact support.');
      }

      chargeId = chargeIdFromIntent;

      // Transfer provider's portion from YOUR platform balance to their Connect account
      console.log('Transferring', providerAmount / 100, 'to provider from platform balance...');
      const transfer = await stripe.transfers.create({
        amount: providerAmount, // Provider gets base service amount only
        currency: 'usd',
        destination: provider.stripe_account_id,
        source_transaction: chargeId,
        transfer_group: `service_${serviceId}`, // Group related transfers
        description: `Payment for completed service`,
        metadata: {
          charge_id: chargeId,
          payment_intent_id: service.payment_intent_id,
          service_id: serviceId,
          customer_id: service.customer_id,
          provider_id: service.service_provider_id,
          platform_fee: platformFeeInCents.toString(),
        },
      });

      transferId = transfer.id;
      console.log('✅ Transfer complete:', transferId);
      console.log('   → Customer paid:', totalAmountPaid / 100);
      console.log('   → Platform balance:', '+$', totalAmountPaid / 100, '(captured)');
      console.log('   → Transferred to provider:', '-$', providerAmount / 100);
      console.log('   → Platform keeps:', platformFeeInCents / 100 + processingFeeInCents / 100);
      console.log('   → Final platform balance:', '$', (platformFeeInCents + processingFeeInCents) / 100);
      
    } else {
      throw new Error('Payment must be authorized through customer app first. No payment intent found.');
    }

    // Step 3: Update provider balance in database
    const providerAmountDollars = providerAmount / 100;
    const newBalance = (provider.balance || 0) + providerAmountDollars;

    const { error: balanceError } = await supabaseClient
      .from('service_provider')
      .update({ balance: newBalance })
      .eq('service_provider_id', service.service_provider_id);

    if (balanceError) {
      console.error('Failed to update provider balance:', balanceError);
      // Don't throw - payment already processed
    }

    // Record transaction in platform_transactions table
    const { error: transactionError } = await supabaseClient
      .from('platform_transactions')
      .insert({
        customer_id: service.customer_id,
        provider_id: service.service_provider_id,
        service_id: serviceId,
        total_amount: totalAmountPaid / 100, // Total amount charged to customer
        platform_fee: platformFeeInCents / 100,
        provider_amount: providerAmount / 100,
        stripe_fee: processingFeeInCents / 100, // Processing fee
        net_platform_fee: platformFeeInCents / 100, // Platform keeps full platform fee
        stripe_charge_id: chargeId,
        stripe_transfer_id: transferId,
        stripe_payment_intent_id: service.payment_intent_id,
        status: 'completed',
      });

    if (transactionError) {
      console.error('Failed to record transaction:', transactionError);
      // Don't throw - payment already processed
    }

    // Step 5: Update service status to completed
    const { error: statusError } = await supabaseClient
      .from('service')
      .update({ status: 'completed' })
      .eq('service_id', serviceId);

    if (statusError) {
      console.error('Failed to update service status:', statusError);
      // Don't throw - payment already processed
    }

    return new Response(
      JSON.stringify({
        success: true,
        charge_id: chargeId,
        transfer_id: transferId,
        payment_intent_id: service.payment_intent_id,
        total_amount_charged: totalAmountPaid / 100,
        service_price: service.price,
        platform_fee: platformFeeInCents / 100,
        processing_fee: processingFeeInCents / 100,
        provider_amount: providerAmount / 100,
        new_balance: newBalance,
        message: 'Service completed - payment captured to platform, then transferred to provider',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Service completion error:', error);
    
    let userMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      userMessage = error.message;
    } else if (typeof error === 'string') {
      userMessage = error;
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: userMessage,
        details: error instanceof Error ? error.stack : String(error),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Return 200 so client can read the error
      }
    );
  }
});
