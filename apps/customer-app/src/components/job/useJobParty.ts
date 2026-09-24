import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export const JOB_ALERTS_PATH = '/(home)/job-alerts';
export const JOB_CHAT_PATH = '/(home)/job-chat';
export const JOB_PARTY_ROLE = 'customer' as const;

export function useJobParty() {
  const { user, loading } = useAuth();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user?.email) {
      setOwnerId(null);
      setReady(true);
      return;
    }

    let cancelled = false;
    supabase
      .from('customer')
      .select('customer_id')
      .eq('email', user.email)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) {
          return;
        }
        setOwnerId(data?.customer_id ? String(data.customer_id) : null);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setOwnerId(null);
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user?.email]);

  return { ownerId, ready, role: JOB_PARTY_ROLE };
}
