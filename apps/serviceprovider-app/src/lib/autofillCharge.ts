import { supabase } from './supabase';
import {
  buildAutoFillConfirmUpdate,
  readPaymentIntentId,
  readPaymentStatus,
} from '../../supabase/functions/_shared/autofillPayment';

export { buildAutoFillConfirmUpdate };

const CHARGE_FAILED = 'This AutoFill job was not confirmed because the customer could not be charged.';

function readErrorString(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return null;
}

export async function readFunctionErrorMessage(error: unknown, data: unknown): Promise<string> {
  const fromData = readErrorString(data);
  if (fromData) {
    return fromData;
  }

  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      const fromBody = readErrorString(body);
      if (fromBody) {
        return fromBody;
      }
    } catch (parseError) {
      console.error('Failed to read payment function error:', parseError);
    }
  }

  return CHARGE_FAILED;
}

export async function chargeAutoFillJob(input: {
  serviceId: string;
  customerId: string;
}): Promise<{ ok: true; paymentIntentId: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: {
      currency: 'usd',
      service_id: input.serviceId,
      customer_id: input.customerId,
      use_saved_payment_method: true,
    },
  });

  if (error) {
    console.error('AutoFill create-payment-intent failed:', error);
    return { ok: false, message: await readFunctionErrorMessage(error, data) };
  }

  const status = readPaymentStatus(data);
  const paymentIntentId = readPaymentIntentId(data);
  if (status !== 'succeeded' || !paymentIntentId) {
    console.error('AutoFill charge did not succeed:', data);
    return { ok: false, message: await readFunctionErrorMessage(error, data) };
  }

  return { ok: true, paymentIntentId };
}

export async function voidUnclaimedAutoFillCharge(input: {
  serviceId: string;
  paymentIntentId: string;
}): Promise<{ ok: boolean }> {
  const { data, error } = await supabase.functions.invoke('void-unclaimed-payment', {
    body: {
      paymentIntentId: input.paymentIntentId,
      service_id: input.serviceId,
    },
  });

  if (error || data?.voided !== true) {
    console.error('Failed to void unclaimed AutoFill charge:', error, data);
    return { ok: false };
  }

  return { ok: true };
}
