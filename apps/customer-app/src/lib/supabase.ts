import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = 'https://hecikcopbdhhiilhgmrd.supabase.co'; // Replace with your Supabase project URL
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlY2lrY29wYmRoaGlpbGhnbXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NDMwNDksImV4cCI6MjA3NDMxOTA0OX0.bns9CFQEU-OtL9jRVqcqqKWN5xaFkEqgWn0UzLaO8Oo'; // Replace with your Supabase anon key

// Custom storage adapter for Expo SecureStore
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
