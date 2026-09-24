import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { applyPostAuthNavigation, GuestFormDraft, LOGGED_IN_HOME } from './guestFormDraft';
import { loadGuestFormDraft } from './guestFormDraftStorage';

function replaceWithDraft(draft: GuestFormDraft | null) {
  applyPostAuthNavigation(draft, {
    replacePath: path => {
      router.replace(path as any);
    },
    replaceParams: (pathname, params) => {
      router.replace({ pathname: pathname as any, params });
    },
    replaceFallback: () => {
      router.replace(LOGGED_IN_HOME as any);
    },
  });
}

/**
 * OAuth returns through a deep link. Honor a saved composer draft instead of
 * always dropping the guest on the catalog.
 */
export function AuthCallbackHandler() {
  const { getReturnTo } = useAuth();
  const getReturnToRef = useRef(getReturnTo);
  getReturnToRef.current = getReturnTo;

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      if (!url.includes('customerapp://auth/callback')) {
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Auth callback error:', error);
          return;
        }
        if (!data.session) {
          return;
        }

        const memory = getReturnToRef.current();
        const draft = memory?.path ? memory : await loadGuestFormDraft();
        replaceWithDraft(draft);
      } catch (err) {
        console.error('Error handling auth callback:', err);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then(url => {
      if (url) {
        void handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}
