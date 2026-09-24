import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { GuestFormDraft } from './guestFormDraft';
import { loadGuestFormDraft, saveGuestFormDraft } from './guestFormDraftStorage';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  returnToHydrated: boolean;
  returnTo: GuestFormDraft | null;
  setReturnTo: (path: string, data?: any) => void;
  getReturnTo: () => GuestFormDraft | null;
  clearReturnTo: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  returnToHydrated: true,
  returnTo: null,
  setReturnTo: () => {},
  getReturnTo: () => null,
  clearReturnTo: () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [returnTo, setReturnToState] = useState<GuestFormDraft | null>(null);
  const [returnToHydrated, setReturnToHydrated] = useState(false);
  const returnToRef = useRef<GuestFormDraft | null>(null);
  const writeGeneration = useRef(0);

  const setReturnTo = useCallback((path: string, data?: any) => {
    writeGeneration.current += 1;
    const next: GuestFormDraft = { path, data };
    returnToRef.current = next;
    setReturnToState(next);
    void saveGuestFormDraft(next).catch(error => {
      console.warn('Failed to persist guest form draft', error);
    });
  }, []);

  const getReturnTo = useCallback(() => returnToRef.current, [returnTo]);

  const clearReturnTo = useCallback(() => {
    writeGeneration.current += 1;
    returnToRef.current = null;
    setReturnToState(null);
    void saveGuestFormDraft(null).catch(error => {
      console.warn('Failed to clear guest form draft', error);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        setReturnToHydrated(true);
      }
    }, 2000);

    loadGuestFormDraft()
      .then(draft => {
        if (cancelled || writeGeneration.current > 0) {
          return;
        }
        returnToRef.current = draft;
        setReturnToState(draft);
      })
      .catch(error => {
        console.warn('Failed to load guest form draft', error);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        clearTimeout(timer);
        setReturnToHydrated(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    console.log('AuthContext: Getting initial session');
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('AuthContext: Initial session:', session?.user?.email || 'no user');
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AuthContext: Auth state change:', event, session?.user?.email || 'no user');
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, returnToHydrated, returnTo, setReturnTo, getReturnTo, clearReturnTo }}>
      {children}
    </AuthContext.Provider>
  );
};
