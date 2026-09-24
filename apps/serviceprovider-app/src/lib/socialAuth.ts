import * as AppleAuthentication from 'expo-apple-authentication';
import { AuthRequest, exchangeCodeAsync, makeRedirectUri, ResponseType } from 'expo-auth-session';
import { discovery as googleDiscovery } from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { parseAuthRedirect } from './authRedirect';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialSignInResult =
  | { cancelled: true }
  | { cancelled: false; session: Session };

const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

function describeAuthError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return undefined;
  const record = error as { message?: unknown; description?: unknown; error?: unknown };
  if (typeof record.message === 'string' && record.message) return record.message;
  if (typeof record.description === 'string' && record.description) return record.description;
  if (typeof record.error === 'string' && record.error) return record.error;
  return undefined;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Sign-in failed.';
}

export function socialSignInErrorMessage(error: unknown): string {
  return messageFrom(error);
}

function isAppleCancel(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = String((error as { code?: string }).code);
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED';
}

async function createNoncePair(): Promise<{ rawNonce: string; hashedNonce: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const rawNonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  return { rawNonce, hashedNonce };
}

export async function establishSessionFromRedirect(url: string): Promise<Session> {
  const parsed = parseAuthRedirect(url);
  if (parsed.error) {
    throw new Error(decodeURIComponent(parsed.error_description || parsed.error));
  }

  if (parsed.access_token && parsed.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    if (error) throw error;
    if (!data.session) throw new Error('Supabase did not return a session.');
    return data.session;
  }

  if (parsed.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) throw error;
    if (!data.session) {
      throw new Error('Supabase did not return a session for the authorization code.');
    }
    return data.session;
  }

  throw new Error(
    'The sign-in redirect did not include a session. Add this app redirect URL in Supabase Auth settings and confirm the provider is enabled.',
  );
}

async function signInWithSupabaseOAuth(
  provider: 'google' | 'apple',
  redirectTo: string,
): Promise<SocialSignInResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) {
    throw new Error(
      `Supabase did not return a ${provider} sign-in URL. Enable the ${provider} provider in the Supabase dashboard.`,
    );
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { cancelled: true };
  }
  if (result.type !== 'success') {
    throw new Error('The sign-in browser closed before a session was created.');
  }

  const session = await establishSessionFromRedirect(result.url);
  return { cancelled: false, session };
}

function reversedGoogleScheme(clientId: string): string {
  const bare = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${bare}`;
}

async function signInWithGoogleIdToken(
  platformClientId: string,
  androidPackage: string,
): Promise<SocialSignInResult> {
  const { rawNonce, hashedNonce } = await createNoncePair();
  const redirectUri = Platform.OS === 'ios'
    ? `${reversedGoogleScheme(platformClientId)}:/oauthredirect`
    : makeRedirectUri({ native: `${androidPackage}:/oauthredirect` });

  const request = new AuthRequest({
    clientId: platformClientId,
    redirectUri,
    scopes: GOOGLE_SCOPES,
    responseType: ResponseType.Code,
    usePKCE: true,
    extraParams: { nonce: hashedNonce },
  });

  await request.makeAuthUrlAsync(googleDiscovery);
  const result = await request.promptAsync(googleDiscovery);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { cancelled: true };
  }
  if (result.type !== 'success') {
    const description = result.type === 'error' ? describeAuthError(result.error) : undefined;
    throw new Error(description || 'Google sign-in did not complete.');
  }

  const code = result.params.code;
  if (!code) {
    throw new Error('Google did not return an authorization code.');
  }

  const tokenResponse = await exchangeCodeAsync(
    {
      clientId: platformClientId,
      code,
      redirectUri,
      extraParams: {
        code_verifier: request.codeVerifier ?? '',
      },
    },
    googleDiscovery,
  );

  if (!tokenResponse.idToken) {
    throw new Error(
      'Google did not return an ID token. Check the OAuth client type, redirect URI, and that openid is included in the scopes.',
    );
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: tokenResponse.idToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  if (!data.session) throw new Error('Supabase did not create a session from the Google ID token.');
  return { cancelled: false, session: data.session };
}

export async function signInWithGoogle(options: {
  redirectTo: string;
  androidPackage: string;
}): Promise<SocialSignInResult> {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const platformClientId = Platform.select({
    ios: iosClientId,
    android: androidClientId,
    default: webClientId,
  });

  if (platformClientId) {
    return signInWithGoogleIdToken(platformClientId, options.androidPackage);
  }

  return signInWithSupabaseOAuth('google', options.redirectTo);
}

async function saveAppleName(credential: AppleAuthentication.AppleAuthenticationCredential) {
  const given = credential.fullName?.givenName ?? '';
  const family = credential.fullName?.familyName ?? '';
  if (!given && !family) return;

  await supabase.auth.updateUser({
    data: {
      first_name: given,
      last_name: family,
      given_name: given,
      family_name: family,
      full_name: [given, family].filter(Boolean).join(' '),
    },
  });
}

export async function signInWithApple(redirectTo: string): Promise<SocialSignInResult> {
  if (Platform.OS !== 'ios') {
    return signInWithSupabaseOAuth('apple', redirectTo);
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error(
      'Sign in with Apple is not available on this device. Use an iPhone signed into an Apple ID, and enable the Sign in with Apple capability for this app.',
    );
  }

  const { rawNonce, hashedNonce } = await createNoncePair();

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('Apple did not return an identity token.');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;
    if (!data.session) throw new Error('Supabase did not create a session from the Apple identity token.');

    try {
      await saveAppleName(credential);
    } catch (nameError) {
      console.warn('Could not save Apple name', nameError);
    }
    return { cancelled: false, session: data.session };
  } catch (error) {
    if (isAppleCancel(error)) return { cancelled: true };
    throw error;
  }
}
