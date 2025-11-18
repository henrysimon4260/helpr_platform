import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  setReturnTo: (path: string, data?: any) => void;
  getReturnTo: () => { path: string; data?: any } | null;
  clearReturnTo: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
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
  const [returnTo, setReturnToState] = useState<{ path: string; data?: any } | null>(null);

  const setReturnTo = (path: string, data?: any) => {
    setReturnToState({ path, data });
  };

  const getReturnTo = () => {
    return returnTo;
  };

  const clearReturnTo = () => {
    setReturnToState(null);
  };

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
    <AuthContext.Provider value={{ user, session, loading, setReturnTo, getReturnTo, clearReturnTo }}>
      {children}
    </AuthContext.Provider>
  );
};
