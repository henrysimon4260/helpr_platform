import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useState } from 'react';
import { Keyboard, Text, TouchableWithoutFeedback, View } from 'react-native';

import { AuthButton, EmailInput, OTPModal, PasswordInput } from '../../../components/auth';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { supabase } from '../../../lib/supabase';
import { Divider } from './Divider';
import { useLoginStyles } from './login.styles';
import { SkipLink } from './SkipLink';
import { SocialButton } from './SocialButton';

export default function Login() {

  const styles = useLoginStyles();
  
  const { getReturnTo, clearReturnTo } = useAuth();
  const { showModal } = useModal();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');

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
    if (error) {
      showModal({ title: 'Sign In Failed', message: 'Invalid email or password. Please check your credentials and try again.' });
    } else {
      redirectAfterAuth();
    }
    setAuthLoading(false);
  };

  const handleSignUp = () => router.replace('/(auth)/signup' as any);

  const handleVerifyOTP = async () => {
    setAuthLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' });
    if (error) {
      showModal({ title: 'Verification Failed', message: error.message });
    } else {
      setShowOTPVerification(false);
      redirectAfterAuth();
    }
    setAuthLoading(false);
  };

  const handleResendOTP = async () => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    showModal(error
      ? { title: 'Error', message: 'Failed to resend code' }
      : { title: 'Code Sent', message: 'A new verification code has been sent to your email' }
    );
  };

  const handleGoogleSignIn = async () => {
    try {
      const redirectUrl = Linking.createURL('/auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (data?.url) await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    } catch (error) {
      showModal({ title: 'Error', message: error instanceof Error ? error.message : 'An error occurred' });
    }
  };

  const handleAppleSignIn = () => {
    showModal({ title: 'Coming Soon', message: 'Apple Sign In is not yet implemented.' });
  };

  const handleCloseOTP = () => {
    setShowOTPVerification(false);
    setOtpCode('');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Sign In</Text>
        </View>
        <View style={styles.formContainer}>
          <EmailInput value={email} onChange={setEmail} />
          <PasswordInput value={password} onChange={setPassword} />
          <AuthButton title={authLoading ? 'Loading...' : 'Sign In'} onPress={handleSignIn} loading={authLoading} />
          <AuthButton title="Sign Up" onPress={handleSignUp} secondary />
          <Divider text="or" />
          <SocialButton provider="google" onPress={handleGoogleSignIn} />
          <SocialButton provider="apple" onPress={handleAppleSignIn} />
          <SkipLink />
        </View>
        <OTPModal
          visible={showOTPVerification}
          email={email}
          otpCode={otpCode}
          onChangeOTP={setOtpCode}
          onVerify={handleVerifyOTP}
          onResend={handleResendOTP}
          onClose={handleCloseOTP}
          loading={authLoading}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}
