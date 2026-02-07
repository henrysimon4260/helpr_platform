import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableWithoutFeedback, View } from 'react-native';
import { AuthButton, EmailInput, OTPModal, PasswordInput } from '../../../components/auth';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { supabase } from '../../../lib/supabase';
import { useSignupStyles } from './signup.styles';
import { TextInputField } from './TextInputField';

export default function Signup() {
  const styles = useSignupStyles();
  const { getReturnTo, clearReturnTo } = useAuth();
  const { showModal, hideModal } = useModal();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');

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

  const validateSignupInputs = () => {
    if (!firstName.trim()) {
      showModal({ title: 'Validation Error', message: 'Please enter your first name.' });
      return false;
    }
    if (!lastName.trim()) {
      showModal({ title: 'Validation Error', message: 'Please enter your last name.' });
      return false;
    }
    if (!email.trim()) {
      showModal({ title: 'Validation Error', message: 'Please enter your email address.' });
      return false;
    }
    if (!password.trim()) {
      showModal({ title: 'Validation Error', message: 'Please enter a password.' });
      return false;
    }
    if (password.length < 6) {
      showModal({ title: 'Validation Error', message: 'Password must be at least 6 characters long.' });
      return false;
    }
    if (password !== confirmPassword) {
      showModal({ title: 'Validation Error', message: 'Passwords do not match.' });
      return false;
    }
    return true;
  };

  const handleSignUp = async () => {
    if (!validateSignupInputs()) return;
    setAuthLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError) {
        const errorFragments = [
          authError.message,
          (authError as any)?.error_description,
          (authError as any)?.code,
          (authError as any)?.error,
        ].filter((v): v is string => typeof v === 'string').map(f => f.toLowerCase());

        const combinedError = errorFragments.join(' ');
        const isDuplicateAccount =
          combinedError.includes('already registered') ||
          combinedError.includes('already exist') ||
          combinedError.includes('already in use') ||
          combinedError.includes('user_already_exists');

        if (isDuplicateAccount) {
          showModal({
            title: 'Account Already Exists',
            message: 'Looks like that email is already registered. Try signing in instead.',
            buttons: [
              { text: 'Go to Sign In', onPress: () => router.replace('/(auth)/login' as any), style: 'default' },
              { text: 'Use a different email', style: 'cancel' },
            ],
            allowBackdropDismiss: false,
          });
        } else {
          showModal({ title: 'Signup Failed', message: authError.message });
        }
        setAuthLoading(false);
        return;
      }

      if (!authData.user) {
        showModal({ title: 'Signup Failed', message: 'Account creation failed. Please try again.' });
        setAuthLoading(false);
        return;
      }

      const identityCount = Array.isArray(authData.user.identities) ? authData.user.identities.length : 0;
      if (identityCount === 0) {
        showModal({
          title: 'Account Already Exists',
          message: 'Looks like that email is already registered. Try signing in instead.',
          buttons: [
            { text: 'Go to Sign In', onPress: () => router.replace('/(auth)/login' as any), style: 'default' },
            { text: 'Use a different email', style: 'cancel' },
          ],
          allowBackdropDismiss: false,
        });
        setAuthLoading(false);
        return;
      }

      const { error: customerError, status: requestStatus } = await supabase
        .from('customer')
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone_number: phone.trim() || null,
        })
        .select()
        .single();

      if (customerError && requestStatus !== 409) {
        showModal({ title: 'Signup Failed', message: `Account created but profile setup failed: ${customerError.message}` });
        setAuthLoading(false);
        return;
      }

      setShowOTPVerification(true);
      hideModal();
      showModal({ title: 'Account Created!', message: 'Check your email for a 6-digit verification code to complete signup!' });
    } catch (error) {
      showModal({ title: 'Signup Failed', message: 'An unexpected error occurred. Please try again.' });
    }
    setAuthLoading(false);
  };

  const handleVerifyOTP = async () => {
    setAuthLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: otpCode, type: 'signup' });
    if (error) {
      showModal({ title: 'Verification Failed', message: error.message });
    } else {
      setShowOTPVerification(false);
      hideModal();
      redirectAfterAuth();
    }
    setAuthLoading(false);
  };

  const handleResendOTP = async () => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    showModal(error
      ? { title: 'Error', message: 'Failed to resend code' }
      : { title: 'Code Sent', message: 'A new verification code has been sent to your email' }
    );
  };

  const handleCloseOTP = () => {
    hideModal();
    setShowOTPVerification(false);
    setOtpCode('');
    setAuthLoading(false);
  };

  const goToSignIn = () => router.replace('/(auth)/login' as any);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Sign Up</Text>
          </View>
          <View style={styles.formContainer}>
            <TextInputField value={firstName} onChange={setFirstName} placeholder="First Name" autoCapitalize="words" />
            <TextInputField value={lastName} onChange={setLastName} placeholder="Last Name" autoCapitalize="words" />
            <EmailInput value={email} onChange={setEmail} />
            <TextInputField value={phone} onChange={setPhone} placeholder="Phone (optional)" keyboardType="phone-pad" />
            <PasswordInput value={password} onChange={setPassword} placeholder="Password" showStrength />
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm Password" />
            <AuthButton title={authLoading ? 'Creating Account...' : 'Create Account'} onPress={handleSignUp} loading={authLoading} />
            <AuthButton title="Already have an account? Sign In" onPress={goToSignIn} secondary />
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
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
    </KeyboardAvoidingView>
  );
}
