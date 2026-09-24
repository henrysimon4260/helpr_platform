import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TouchableWithoutFeedback, View } from 'react-native';

import { AuthButton, EmailInput, OTPModal, PasswordInput, PhoneInput } from '../../../components/auth';
import { ensureCustomerProfile } from '../../../components/auth/ensureCustomerProfile';
import { normalizeE164 } from '../../../components/auth/phone';
import { establishSessionFromRedirect, signInWithApple, signInWithGoogle, socialSignInErrorMessage } from '../../../components/auth/socialAuth';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { supabase } from '../../../lib/supabase';
import { Divider } from './Divider';
import { useLoginStyles } from './login.styles';
import { SkipLink } from './SkipLink';
import { SocialButton } from './SocialButton';

type LoginMode = 'phone' | 'email' | 'password';
type OtpChannel = 'phone' | 'email';

const ANDROID_PACKAGE = 'com.helpr.customer_app';

export default function Login() {
  const styles = useLoginStyles();
  const { getReturnTo, clearReturnTo } = useAuth();
  const { showModal } = useModal();

  const [mode, setMode] = useState<LoginMode>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [socialProvider, setSocialProvider] = useState<'apple' | 'google' | null>(null);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpChannel, setOtpChannel] = useState<OtpChannel>('phone');
  const [otpDestination, setOtpDestination] = useState('');
  const completingRef = useRef(false);

  const redirectAfterAuth = useCallback(() => {
    const returnTo = getReturnTo();
    if (returnTo?.path && returnTo.data) {
      const data = returnTo.data as { params?: Record<string, string> };
      const params = data?.params;
      const hasParams = params && Object.keys(params).length > 0;
      const normalizedPath = returnTo.path.startsWith('/') ? returnTo.path.slice(1) : returnTo.path;
      if (hasParams) {
        router.replace({ pathname: normalizedPath as any, params });
      } else {
        router.replace(returnTo.path as any);
      }
      return;
    }
    clearReturnTo();
    router.replace('/(home)/landing' as any);
  }, [clearReturnTo, getReturnTo]);

  const finishSignIn = useCallback(async (explicitPhone?: string | null) => {
    if (completingRef.current) return;
    completingRef.current = true;
    try {
      const profile = await ensureCustomerProfile(explicitPhone);
      if (!profile.ok) {
        showModal({
          title: 'Profile setup',
          message: `You are signed in. We could not save your profile yet: ${profile.error}`,
        });
      }
      setShowOTPVerification(false);
      redirectAfterAuth();
    } catch (error) {
      completingRef.current = false;
      showModal({
        title: 'Sign in',
        message: socialSignInErrorMessage(error),
      });
    }
  }, [redirectAfterAuth, showModal]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        showModal({
          title: 'Session Expired',
          message: 'Your account session has expired. Please sign in again.',
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [showModal]);

  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (!url.includes('auth/callback')) return;
      try {
        await establishSessionFromRedirect(url);
        await finishSignIn();
      } catch (error) {
        showModal({ title: 'Sign in', message: socialSignInErrorMessage(error) });
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    return () => subscription.remove();
  }, [finishSignIn, showModal]);

  const handleSendPhoneCode = async () => {
    const normalized = normalizeE164(phone);
    if (!normalized) {
      showModal({
        title: 'Check your number',
        message: 'Enter a phone number with country code, or a 10-digit US number.',
      });
      return;
    }

    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setAuthLoading(false);
    if (error) {
      showModal({ title: 'Could not send code', message: error.message });
      return;
    }

    setOtpChannel('phone');
    setOtpDestination(normalized);
    setOtpCode('');
    setShowOTPVerification(true);
  };

  const handleSendEmailCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      showModal({ title: 'Validation Error', message: 'Please enter your email address.' });
      return;
    }

    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setAuthLoading(false);
    if (error) {
      showModal({ title: 'Could not send code', message: error.message });
      return;
    }

    setOtpChannel('email');
    setOtpDestination(trimmed);
    setOtpCode('');
    setShowOTPVerification(true);
  };

  const handleSignIn = async () => {
    if (!email.trim()) {
      showModal({ title: 'Validation Error', message: 'Please enter your email address.' });
      return;
    }
    if (!password.trim()) {
      showModal({ title: 'Validation Error', message: 'Please enter your password.' });
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });
    setAuthLoading(false);
    if (error) {
      showModal({ title: 'Sign In Failed', message: 'Invalid email or password. Please check your credentials and try again.' });
      return;
    }
    await finishSignIn();
  };

  const handleSignUp = () => router.replace('/(auth)/signup' as any);

  const handleVerifyOTP = async () => {
    setAuthLoading(true);
    const { error } = otpChannel === 'phone'
      ? await supabase.auth.verifyOtp({ phone: otpDestination, token: otpCode, type: 'sms' })
      : await supabase.auth.verifyOtp({ email: otpDestination, token: otpCode, type: 'email' });
    setAuthLoading(false);
    if (error) {
      showModal({ title: 'Verification Failed', message: error.message });
      return;
    }
    await finishSignIn(otpChannel === 'phone' ? otpDestination : null);
  };

  const handleResendOTP = async () => {
    const { error } = otpChannel === 'phone'
      ? await supabase.auth.signInWithOtp({ phone: otpDestination })
      : await supabase.auth.signInWithOtp({ email: otpDestination, options: { shouldCreateUser: true } });
    showModal(error
      ? { title: 'Error', message: error.message || 'Failed to resend code' }
      : { title: 'Code Sent', message: `A new verification code has been sent to ${otpDestination}` }
    );
  };

  const handleGoogleSignIn = async () => {
    try {
      setSocialProvider('google');
      const redirectUrl = Linking.createURL('auth/callback');
      const result = await signInWithGoogle({ redirectTo: redirectUrl, androidPackage: ANDROID_PACKAGE });
      if (!result.cancelled) await finishSignIn();
    } catch (error) {
      showModal({ title: 'Google sign-in', message: socialSignInErrorMessage(error) });
    } finally {
      setSocialProvider(null);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setSocialProvider('apple');
      const redirectUrl = Linking.createURL('auth/callback');
      const result = await signInWithApple(redirectUrl);
      if (!result.cancelled) await finishSignIn();
    } catch (error) {
      showModal({ title: 'Apple sign-in', message: socialSignInErrorMessage(error) });
    } finally {
      setSocialProvider(null);
    }
  };

  const handleCloseOTP = () => {
    setShowOTPVerification(false);
    setOtpCode('');
  };

  const subtitle = mode === 'phone'
    ? "We'll text you a code."
    : mode === 'email'
      ? "We'll email you a code."
      : 'Sign in with your email and password.';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Sign In</Text>
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.formContainer}>
            {mode === 'phone' && (
              <>
                <PhoneInput value={phone} onChange={setPhone} />
                <Text style={styles.hint}>Use +country code, or a 10-digit US number.</Text>
                <AuthButton title={authLoading ? 'Sending...' : 'Send code'} onPress={handleSendPhoneCode} loading={authLoading} />
              </>
            )}
            {mode === 'email' && (
              <>
                <EmailInput value={email} onChange={setEmail} />
                <AuthButton title={authLoading ? 'Sending...' : 'Send code'} onPress={handleSendEmailCode} loading={authLoading} />
              </>
            )}
            {mode === 'password' && (
              <>
                <EmailInput value={email} onChange={setEmail} />
                <PasswordInput value={password} onChange={setPassword} />
                <AuthButton title={authLoading ? 'Loading...' : 'Sign In'} onPress={handleSignIn} loading={authLoading} />
              </>
            )}
            <View style={styles.linkRow}>
              {mode !== 'phone' && (
                <Pressable onPress={() => setMode('phone')}>
                  <Text style={styles.link}>Use phone</Text>
                </Pressable>
              )}
              {mode !== 'email' && (
                <Pressable onPress={() => setMode('email')}>
                  <Text style={styles.link}>Use email code</Text>
                </Pressable>
              )}
              {mode !== 'password' && (
                <Pressable onPress={() => setMode('password')}>
                  <Text style={styles.link}>Use password</Text>
                </Pressable>
              )}
            </View>
            <AuthButton title="Sign Up" onPress={handleSignUp} secondary />
            <Divider text="or" />
            <SocialButton provider="apple" onPress={handleAppleSignIn} loading={socialProvider === 'apple'} disabled={socialProvider !== null} />
            <SocialButton provider="google" onPress={handleGoogleSignIn} loading={socialProvider === 'google'} disabled={socialProvider !== null} />
            <SkipLink />
          </View>
          <OTPModal
            visible={showOTPVerification}
            email={otpDestination}
            otpCode={otpCode}
            onChangeOTP={setOtpCode}
            onVerify={handleVerifyOTP}
            onResend={handleResendOTP}
            onClose={handleCloseOTP}
            loading={authLoading}
            title={otpChannel === 'phone' ? 'Verify your phone' : 'Verify your email'}
            subtitle={`We sent a 6-digit code to ${otpDestination}`}
            verifyLabel="Verify code"
          />
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
