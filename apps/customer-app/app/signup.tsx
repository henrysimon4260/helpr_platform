import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { useModal } from '../src/contexts/ModalContext';
import { supabase } from '../src/lib/supabase';

export default function Signup() {
  console.log('Signup screen rendered');

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    console.log('Signup screen loaded - creating beautiful user experience');
  }, []);

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
    router.replace('/landing');
  }, [clearReturnTo, getReturnTo]);

  const validateSignupInputs = () => {
    if (!firstName.trim()) {
      showModal({
        title: 'Validation Error',
        message: 'Please enter your first name.',
      });
      return false;
    }
    if (!lastName.trim()) {
      showModal({
        title: 'Validation Error',
        message: 'Please enter your last name.',
      });
      return false;
    }
    if (!email.trim()) {
      showModal({
        title: 'Validation Error',
        message: 'Please enter your email address.',
      });
      return false;
    }
    if (!password.trim()) {
      showModal({
        title: 'Validation Error',
        message: 'Please enter a password.',
      });
      return false;
    }
    if (password.length < 6) {
      showModal({
        title: 'Validation Error',
        message: 'Password must be at least 6 characters long.',
      });
      return false;
    }
    if (password !== confirmPassword) {
      showModal({
        title: 'Validation Error',
        message: 'Passwords do not match.',
      });
      return false;
    }
    return true;
  };

  const signUpWithEmail = async () => {
    if (!validateSignupInputs()) return;

    setAuthLoading(true);
    console.log('🔄 Attempting signup for:', email);

    try {
      // Create auth account with email/password
      const payload = {
        email: email.trim(),
        password: password.trim(),
      } as const;

      const { data: authData, error: authError } = await supabase.auth.signUp(payload);

      if (authError) {
        console.error('❌ Auth signup error:', authError);

        const errorFragments = [
          authError.message,
          (authError as any)?.error_description,
          (authError as any)?.code,
          (authError as any)?.error,
        ]
          .filter((value): value is string => typeof value === 'string')
          .map(fragment => fragment.toLowerCase());

        const combinedError = errorFragments.join(' ');
        const isDuplicateAccount =
          combinedError.includes('already registered') ||
          combinedError.includes('already exist') ||
          combinedError.includes('already in use') ||
          combinedError.includes('user_already_exists');

  const duplicateViaAuthData = Boolean(authData?.user) && Boolean((authData.user as any)?.identities?.length);
  const duplicateViaMfa = authData?.session === null && authData?.user === null;

        if (isDuplicateAccount || duplicateViaAuthData || duplicateViaMfa) {
          showModal({
            title: 'Account Already Exists',
            message: 'Looks like that email is already registered. Try signing in instead.',
            buttons: [
              {
                text: 'Go to Sign In',
                onPress: () => router.replace('/login'),
                style: 'default',
              },
              {
                text: 'Use a different email',
                style: 'cancel',
              },
            ],
            allowBackdropDismiss: false,
          });
        } else {
          showModal({
            title: 'Signup Failed',
            message: authError.message,
          });
        }

        setAuthLoading(false);
        return;
      }

      if (!authData.user) {
        console.error('❌ No user data returned from signup');
        showModal({
          title: 'Signup Failed',
          message: 'Account creation failed. Please try again.',
        });
        setAuthLoading(false);
        return;
      }

      const identityCount = Array.isArray(authData.user.identities) ? authData.user.identities.length : 0;
      if (identityCount === 0) {
        console.warn('⚠️ Signup attempted for existing account:', email.trim());
        showModal({
          title: 'Account Already Exists',
          message: 'Looks like that email is already registered. Try signing in instead.',
          buttons: [
            {
              text: 'Go to Sign In',
              onPress: () => router.replace('/login'),
              style: 'default',
            },
            {
              text: 'Use a different email',
              style: 'cancel',
            },
          ],
          allowBackdropDismiss: false,
        });
        setAuthLoading(false);
        return;
      }

      console.log('✅ Auth account created, user ID:', authData.user.id);

      // Create customer record in database
      const insertionResult = await supabase
        .from('customer')
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone_number: phone.trim() || null,
        })
        .select()
        .single();

      const customerData = insertionResult.data;
      const customerError = insertionResult.error;
      const requestStatus = (insertionResult as any)?.status ?? (insertionResult as any)?.statusText ?? null;

      if (customerError && requestStatus !== 409) {
        console.error('❌ Customer record creation error:', customerError);
        showModal({
          title: 'Signup Failed',
          message: `Account created but profile setup failed: ${customerError.message}`,
        });
        setAuthLoading(false);
        return;
      }

      if (customerError && requestStatus === 409) {
        console.warn('⚠️ Customer profile already exists, continuing signup flow');
      } else {
        console.log('✅ Customer record created successfully, customer ID:', customerData?.customer_id);
      }

      // Show OTP verification modal - Supabase should have sent confirmation email
      setShowOTPVerification(true);
      hideModal();
      showModal({
        title: 'Account Created!',
        message: 'Check your email for a 6-digit verification code to complete signup!',
      });

    } catch (error) {
      console.error('❌ Unexpected signup error:', error);
      showModal({
        title: 'Signup Failed',
        message: 'An unexpected error occurred. Please try again.',
      });
    }

    setAuthLoading(false);
  };

  const verifyOTP = async () => {
    setAuthLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode,
      type: 'signup'
    });

    if (error) {
      console.error('❌ OTP verification error:', error);
      showModal({
        title: 'Verification Failed',
        message: error.message,
      });
    } else {
    console.log('✅ Email verified successfully');
    setShowOTPVerification(false);
    hideModal();
    redirectAfterAuth();
    }

    setAuthLoading(false);
  };

  const resendOTP = async () => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    });

    if (error) {
      showModal({
        title: 'Error',
        message: 'Failed to resend code',
      });
    } else {
      showModal({
        title: 'Code Sent',
        message: 'A new verification code has been sent to your email',
      });
    }
  };

  const goToSignIn = () => {
    router.replace('/login');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.signInDivider}>
            <Text style={styles.title}>Sign Up</Text>
          </View>

          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="First Name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              placeholderTextColor="#49454F"
            />

            <TextInput
              style={styles.input}
              placeholder="Last Name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              placeholderTextColor="#49454F"
            />

            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#49454F"
            />

            <TextInput
              style={styles.input}
              placeholder="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#49454F"
            />

            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholderTextColor="#49454F"
              />
              <TouchableOpacity
                style={styles.showPasswordButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.showPasswordText}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                placeholderTextColor="#49454F"
              />
              <TouchableOpacity
                style={styles.showPasswordButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Text style={styles.showPasswordText}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>

            <Pressable style={styles.button} onPress={signUpWithEmail} disabled={authLoading}>
              <Text style={styles.buttonText}>{authLoading ? 'Creating Account...' : 'Create Account'}</Text>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={goToSignIn}>
              <Text style={styles.secondaryButtonText}>Already have an account? Sign In</Text>
            </Pressable>
          </View>

          {/* Invisible overlay to block dev menu button */}
          <View style={styles.devMenuBlocker} pointerEvents="none" />
        </ScrollView>
      </TouchableWithoutFeedback>

      {/* OTP Verification Modal */}
      <Modal
        visible={showOTPVerification}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Verify Your Email</Text>
            <Text style={styles.modalSubtitle}>
              We sent a 6-digit code to {email}
            </Text>

            <TextInput
              style={styles.otpInput}
              placeholder="Enter 6-digit code"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus={true}
            />

            <TouchableOpacity
              style={[styles.modalButton, otpCode.length === 6 ? styles.buttonActive : styles.buttonInactive]}
              onPress={verifyOTP}
              disabled={otpCode.length !== 6 || authLoading}
            >
              {authLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.modalButtonText}>Verify Email</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={resendOTP}
            >
              <Text style={styles.resendButtonText}>Didn't receive code? Resend</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                hideModal();
                setShowOTPVerification(false);
                setOtpCode('');
                setAuthLoading(false);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  signInDivider: {
    marginVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4309',
    letterSpacing: 0.5,
  },
  formContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: '#E5DCC9',
    borderRadius: 30,
    padding: 15,
    marginBottom: 12,
    paddingLeft: 20,
    fontSize: 16,
    color: '#49454F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5DCC9',
    borderRadius: 30,
    marginBottom: 12,
    paddingLeft: 20,
    paddingRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 15,
    paddingRight: 15,
    paddingLeft: 0,
    fontSize: 16,
    color: '#49454F',
  },
  showPasswordButton: {
    padding: 10,
  },
  showPasswordText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#0c4309',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#cfbf9dff',
  },
  secondaryButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: 'bold',
  },
  devMenuBlocker: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: 'transparent',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF8E8',
    borderRadius: 25,
    padding: 30,
    width: '90%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 15,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#49454F',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  otpInput: {
    backgroundColor: '#E5DCC9',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '700',
    color: '#0c4309',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalButton: {
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    marginBottom: 15,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonActive: {
    backgroundColor: '#0c4309',
  },
  buttonInactive: {
    backgroundColor: '#0c430995',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resendButton: {
    backgroundColor: 'transparent',
    padding: 12,
    marginBottom: 10,
  },
  resendButtonText: {
    color: '#0c4309',
    fontSize: 16,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  cancelButton: {
    backgroundColor: '#cfbf9dff',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
    width: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
