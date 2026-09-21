import { supabase } from '../../lib/supabase';

export type ServiceQuoteInput = {
  serviceType: string;
  description: string;
  startLocation?: string | null;
  endLocation?: string | null;
  location?: string | null;
  needsTruck?: boolean;
};

export type ServiceQuoteResult =
  | {
      ok: true;
      kind: 'price';
      price: number;
      note: string | null;
      processingFee: number;
      platformFee: number;
      customerTotal: number;
    }
  | { ok: true; kind: 'safety'; message: string }
  | { ok: true; kind: 'clarification'; prompt: string }
  | { ok: false; message: string };

function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Ask quote-service-price for the amount to show and to store.
 * The request has no price field. The returned price is the only amount
 * composers may write, and the database accepts it only when it matches
 * the stored quote.
 */
export async function requestServiceQuote(input: ServiceQuoteInput): Promise<ServiceQuoteResult> {
  const description = text(input.description);
  if (!description) {
    return { ok: false, message: 'Add a brief task description to see a price.' };
  }

  const { data, error } = await supabase.functions.invoke('quote-service-price', {
    body: {
      service_type: input.serviceType,
      description,
      start_location: text(input.startLocation),
      end_location: text(input.endLocation),
      location: text(input.location),
      needs_truck: input.needsTruck === true,
    },
  });

  if (error || !data || typeof data !== 'object') {
    return { ok: false, message: 'Unable to estimate price right now.' };
  }

  const payload = data as Record<string, unknown>;
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return { ok: false, message: 'Unable to estimate price right now.' };
  }
  if (payload.safety_concern === true) {
    const message = typeof payload.safety_message === 'string' ? payload.safety_message.trim() : '';
    return { ok: true, kind: 'safety', message: message || 'This request may not be suitable for our platform.' };
  }
  if (payload.needs_clarification === true) {
    const prompt = typeof payload.clarification_prompt === 'string' ? payload.clarification_prompt.trim() : '';
    if (prompt) {
      return { ok: true, kind: 'clarification', prompt };
    }
  }

  const price = typeof payload.price === 'number' ? payload.price : Number(payload.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, message: 'Unable to estimate price right now.' };
  }

  return {
    ok: true,
    kind: 'price',
    price,
    note: typeof payload.note === 'string' ? payload.note : null,
    processingFee: Number(payload.processing_fee) || 0,
    platformFee: Number(payload.platform_fee) || 0,
    customerTotal: Number(payload.customer_total) || price,
  };
}
