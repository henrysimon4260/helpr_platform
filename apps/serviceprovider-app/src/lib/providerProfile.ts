import { PostgrestError, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type EnsureServiceProviderProfileOptions = {
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

type EnsureServiceProviderProfileResult = {
  success: true;
} | {
  success: false;
  error: PostgrestError | Error;
};

const sanitizeText = (value?: string | null) => {
  if (!value) {
    return '';
  }
  return value.trim();
};

const sanitizePhone = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const cleaned = value.toString().replace(/[^0-9]/g, '').trim();
  if (cleaned.length === 0) {
    return null;
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

export const ensureServiceProviderProfile = async (
  options: EnsureServiceProviderProfileOptions = {},
): Promise<EnsureServiceProviderProfileResult> => {
  try {
    let providerId = options.userId ?? null;
    let authUser: User | null = null;

    if (!providerId || !options.firstName || !options.lastName || !options.email || !options.phone) {
      const { data: userResponse, error: userError } = await supabase.auth.getUser();
      if (!userError) {
        authUser = userResponse.user;
        providerId = providerId ?? authUser?.id ?? null;
      } else if (!providerId) {
        return { success: false, error: userError };
      }
    }

    if (!providerId) {
      return { success: false, error: new Error('Missing authenticated user ID') };
    }

    const preferredFirstName = sanitizeText(options.firstName ?? (authUser?.user_metadata?.first_name as string | null) ?? null);
    const preferredLastName = sanitizeText(options.lastName ?? (authUser?.user_metadata?.last_name as string | null) ?? null);
    const preferredEmail = sanitizeText(options.email ?? authUser?.email ?? (authUser?.user_metadata?.email as string | null) ?? null);
    const preferredPhone = sanitizePhone(options.phone ?? (authUser?.user_metadata?.phone as string | null) ?? null);

    const { data: existing, error: existingError } = await supabase
      .from('service_provider')
      .select('service_provider_id')
      .eq('service_provider_id', providerId)
      .maybeSingle();

    if (existingError) {
      return { success: false, error: existingError };
    }

    if (existing) {
      // Profile already exists, nothing more to do.
      return { success: true };
    }

    const insertPayload: Record<string, unknown> = {
      service_provider_id: providerId,
      first_name: preferredFirstName || null,
      last_name: preferredLastName || null,
      email: preferredEmail || null,
      phone: preferredPhone,
      jobs_completed: 0,
      rating: null,
      profile_picture_url: null,
    };

    const { error: insertError } = await supabase
      .from('service_provider')
      .insert(insertPayload);

    if (insertError) {
      return { success: false, error: insertError };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error as Error };
  }
};
