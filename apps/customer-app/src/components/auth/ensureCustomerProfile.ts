import type { User } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';
import { normalizeE164 } from './phone';

type EnsureCustomerProfileResult = { ok: true } | { ok: false; error: string };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function namesFromUser(user: User): { first: string; last: string } {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const first = text(meta.given_name || meta.first_name);
  const last = text(meta.family_name || meta.last_name);
  if (first || last) return { first, last };

  const full = text(meta.full_name || meta.name);
  if (!full) return { first: '', last: '' };
  const [given, ...rest] = full.split(/\s+/);
  return { first: given ?? '', last: rest.join(' ') };
}

function phoneFromUser(user: User, explicitPhone?: string | null): string | null {
  const explicit = explicitPhone ? normalizeE164(explicitPhone) : null;
  if (explicit) return explicit;
  if (user.phone && normalizeE164(user.phone)) return normalizeE164(user.phone);
  const metaPhone = text((user.user_metadata as Record<string, unknown> | undefined)?.phone);
  return metaPhone ? normalizeE164(metaPhone) : null;
}

/**
 * Find or insert a customer row the same way email signup and the account screen do:
 * match by email, then by E.164 phone, otherwise insert first/last/email/phone.
 */
export async function ensureCustomerProfile(explicitPhone?: string | null): Promise<EnsureCustomerProfileResult> {
  const { data: userResponse, error: userError } = await supabase.auth.getUser();
  const user = userResponse.user;
  if (userError || !user) {
    return { ok: false, error: userError?.message || 'No authenticated user.' };
  }

  const email = user.email?.trim() || null;
  const phone = phoneFromUser(user, explicitPhone);
  const names = namesFromUser(user);

  if (email) {
    const { data: byEmail, error: emailError } = await supabase
      .from('customer')
      .select('customer_id, phone_number')
      .eq('email', email)
      .maybeSingle();

    if (emailError) return { ok: false, error: emailError.message };
    if (byEmail) {
      if (phone && !byEmail.phone_number) {
        await supabase.from('customer').update({ phone_number: phone }).eq('customer_id', byEmail.customer_id);
      }
      return { ok: true };
    }
  }

  if (phone) {
    const { data: byPhone, error: phoneError } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('phone_number', phone)
      .maybeSingle();

    if (phoneError) return { ok: false, error: phoneError.message };
    if (byPhone) return { ok: true };
  }

  const { error: insertError } = await supabase.from('customer').insert({
    first_name: names.first,
    last_name: names.last,
    email,
    phone_number: phone,
  });

  if (insertError) {
    if (insertError.code === '23505') return { ok: true };
    return { ok: false, error: insertError.message };
  }

  return { ok: true };
}
