import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { ensureServiceProviderProfile } from '../src/lib/providerProfile';
import { normalizeE164 } from '../src/lib/phone';
import { establishSessionFromRedirect, signInWithApple, signInWithGoogle, socialSignInErrorMessage } from '../src/lib/socialAuth';
import { useModal } from '../src/contexts/ModalContext';

type LoginMode = 'phone' | 'email' | 'password';
type OtpChannel = 'phone' | 'email';

const ANDROID_PACKAGE = 'com.helpr.serviceprovider_app';

export default function Login() {
  console.log('Login screen rendered');

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
  const [showPassword, setShowPassword] = useState(false);
  const completingRef = useRef(false);
  const { showModal, hideModal } = useModal();
  const params = useLocalSearchParams();

  useEffect(() => {
    // Log that login screen is loaded
    console.log('Login screen loaded - dev menu should be hidden via app.json');

    // Handle OAuth callback errors/warnings
    if (params.error) {
      const errorMessage = Array.isArray(params.message) ? params.message[0] : (params.message || 'Authentication failed');
      showModal({
        title: 'Authentication Error',
        message: errorMessage,
      });
    } else if (params.warning) {
      const warningType = Array.isArray(params.warning) ? params.warning[0] : params.warning;
      if (warningType === 'profile_creation_failed') {
        showModal({
          title: 'Account Setup Warning',
          message: 'Your account was created successfully, but there was an issue setting up your profile. You can complete this setup later from your account settings.',
        });
      } else if (warningType === 'stripe_setup_failed') {
        showModal({
          title: 'Payment Setup Warning',
          message: 'Your account was created successfully, but there was an issue setting up payment processing. You can complete this setup later from your account settings.',
        });
      }
    }
  }, [showModal, params.error, params.message, params.warning]);

  const finishSignIn = useCallback(async (explicitPhone?: string | null) => {
    if (completingRef.current) return;
    completingRef.current = true;
    try {
      const { data: userResponse } = await supabase.auth.getUser();
      const user = userResponse.user;
      const metadata = (user?.user_metadata ?? {}) as {
        first_name?: string;
        last_name?: string;
        given_name?: string;
        family_name?: string;
        phone?: string;
      };
      const ensureResult = await ensureServiceProviderProfile({
        userId: user?.id,
        email: user?.email ?? null,
        firstName: metadata.given_name || metadata.first_name,
        lastName: metadata.family_name || metadata.last_name,
        phone: explicitPhone || user?.phone || metadata.phone,
      });

      if (!ensureResult.success) {
        if (ensureResult.errorType === 'auth_missing') {
          completingRef.current = false;
          showModal({
            title: 'Authentication Error',
            message: 'Your session has expired. Please sign in again.',
          });
          return;
        }
        showModal({
          title: 'Profile setup',
          message: 'You are signed in. We could not save your provider profile yet. You can finish setup from account settings.',
        });
      } else if (ensureResult.stripeError) {
        showModal({
          title: 'Payment Setup Warning',
          message: 'Your account was created, but payment setup did not finish. You can complete it later from account settings.',
        });
      }

      setShowOTPVerification(false);
      router.replace('/landing');
    } catch (error) {
      completingRef.current = false;
      showModal({ title: 'Sign in', message: socialSignInErrorMessage(error) });
    }
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

  const signInWithEmail = async () => {
    // Validate inputs
    if (!email.trim()) {
      showModal({
        title: 'Validation Error',
        message: 'Please enter your email address.',
      });
      return;
    }
    if (!password.trim()) {
      showModal({
        title: 'Validation Error',
        message: 'Please enter your password.',
      });
      return;
    }

    setAuthLoading(true);
    console.log('🔐 Attempting sign in with:', email);
    
    // Try password sign-in
    const { data: passwordData, error: passwordError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    console.log('📧 Password sign in response:', { passwordData, passwordError });

    if (passwordError) {
      console.log('❌ Password sign-in failed');
      
      showModal({
        title: 'Sign In Failed',
        message: 'Invalid email or password. Please check your credentials and try again.',
      });
    } else {
      console.log('✅ Password sign in successful, user:', passwordData.user?.email);
      await finishSignIn(passwordData.user?.phone);
    }
    setAuthLoading(false);
  };

  const sendPhoneCode = async () => {
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

  const sendEmailCode = async () => {
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

  const signUpWithEmail = async () => {
    // Navigate to dedicated signup page
    router.replace('/signup' as any);
  };

  const verifyOTP = async () => {
    setAuthLoading(true);

    const { error } = otpChannel === 'phone'
      ? await supabase.auth.verifyOtp({ phone: otpDestination, token: otpCode, type: 'sms' })
      : await supabase.auth.verifyOtp({ email: otpDestination, token: otpCode, type: 'email' });

    setAuthLoading(false);
    if (error) {
      console.error('❌ OTP verification error:', error);
      showModal({
        title: 'Verification Failed',
        message: error.message,
      });
      return;
    }

    await finishSignIn(otpChannel === 'phone' ? otpDestination : null);
  };

  const handleOTPCancel = useCallback(() => {
    console.log('OTP verification cancelled by user - resetting all states');
    
    // Reset all states that might be blocking the UI
    setAuthLoading(false);
    setShowOTPVerification(false);
    
    // Clear OTP input
    setOtpCode('');
    
    // Dismiss keyboard if active
    Keyboard.dismiss();
    
    // Clear any modal state
    hideModal();
    
    console.log('All states reset after OTP cancel - form should be responsive now');
  }, [hideModal]);

  const resendOTP = async () => {
    const { error } = otpChannel === 'phone'
      ? await supabase.auth.signInWithOtp({ phone: otpDestination })
      : await supabase.auth.signInWithOtp({ email: otpDestination, options: { shouldCreateUser: true } });

    if (error) {
      showModal({
        title: 'Error',
        message: 'Failed to resend code',
      });
    } else {
      showModal({
        title: 'Code Sent',
        message: `A new verification code has been sent to ${otpDestination}`,
      });
    }
  };

  const signInWithGoogleAccount = async () => {
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

  const signInWithAppleAccount = async () => {
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


  return (
    <View style={styles.container}>
        
      <View style={styles.signInDivider}>
          
          <Text style={styles.title}>Get Started With Helpr.</Text>
          
        </View>

      <Text style={styles.subtitle}>
        {mode === 'phone'
          ? "We'll text you a code."
          : mode === 'email'
            ? "We'll email you a code."
            : 'Sign in with your email and password.'}
      </Text>

      <View style={styles.formContainer}>
        {mode === 'phone' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              placeholderTextColor="#49454F"
            />
            <Text style={styles.hint}>Use +country code, or a 10-digit US number.</Text>
            <Pressable style={styles.button} onPress={sendPhoneCode} disabled={authLoading}>
              <Text style={styles.buttonText}>{authLoading ? 'Sending...' : 'Send code'}</Text>
            </Pressable>
          </>
        )}

        {mode === 'email' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#49454F"
            />
            <Pressable style={styles.button} onPress={sendEmailCode} disabled={authLoading}>
              <Text style={styles.buttonText}>{authLoading ? 'Sending...' : 'Send code'}</Text>
            </Pressable>
          </>
        )}

        {mode === 'password' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
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

            <Pressable style={styles.button} onPress={signInWithEmail} disabled={authLoading}>
              <Text style={styles.buttonText}>{authLoading ? 'Loading...' : 'Sign In'}</Text>
            </Pressable>
          </>
        )}

        <View style={styles.linkRow}>
          {mode !== 'phone' && (
            <Pressable onPress={() => setMode('phone')}>
              <Text style={styles.linkText}>Use phone</Text>
            </Pressable>
          )}
          {mode !== 'email' && (
            <Pressable onPress={() => setMode('email')}>
              <Text style={styles.linkText}>Use email code</Text>
            </Pressable>
          )}
          {mode !== 'password' && (
            <Pressable onPress={() => setMode('password')}>
              <Text style={styles.linkText}>Use password</Text>
            </Pressable>
          )}
        </View>

        <Pressable style={styles.secondaryButton} onPress={signUpWithEmail} disabled={authLoading}>
          <Text style={styles.secondaryButtonText}>Sign Up</Text>
        </Pressable>

        <View style={styles.orDivider}>
          <View style={styles.orDividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.orDividerLine} />
        </View>

        <Pressable style={styles.socialButton} onPress={signInWithAppleAccount} disabled={socialProvider !== null}>
          <Text style={styles.appleMark}></Text>
          <Text style={styles.socialButtonText}>{socialProvider === 'apple' ? 'Loading...' : 'Continue with Apple'}</Text>
        </Pressable>

        <Pressable style={[styles.socialButton, styles.socialButtonSpacer]} onPress={signInWithGoogleAccount} disabled={socialProvider !== null}>
          <Image
            source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
            style={styles.socialIcon}
          />
          <Text style={styles.socialButtonText}>{socialProvider === 'google' ? 'Loading...' : 'Continue with Google'}</Text>
        </Pressable>

      </View>

      {/* Invisible overlay to block dev menu button */}
      <View style={styles.devMenuBlocker} pointerEvents="none" />

      {/* OTP Verification Modal */}
      <Modal
        visible={showOTPVerification}
        animationType="slide"
        transparent={true}
        onRequestClose={handleOTPCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{otpChannel === 'phone' ? 'Verify your phone' : 'Verify your email'}</Text>
            <Text style={styles.modalSubtitle}>
              We sent a 6-digit code to {otpDestination}
            </Text>
            
            <TextInput
              style={styles.otpInput}
              placeholder="Enter 6-digit code"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
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
                <Text style={styles.modalButtonText}>Verify code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={resendOTP}
            >
              <Text style={styles.resendButtonText}>{"Didn't receive code? Resend"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleOTPCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    padding: 20,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0c4309',
    marginTop: 80,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  subtitle: {
    textAlign: 'center',
    color: '#49454F',
    fontSize: 16,
    marginBottom: 16,
  },
  hint: {
    color: '#49454F',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 20,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  linkText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 8,
    marginBottom: 8,
  },
  appleMark: {
    fontSize: 18,
    marginRight: 10,
    color: '#49454F',
  },
  socialButtonSpacer: {
    marginTop: 10,
  },
  input: {
    backgroundColor: '#E5DCC9',
    borderRadius: 30,
    padding: 15,
    marginBottom: 15,
    paddingLeft: 20,
    fontSize: 16,
    color: '#49454F',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5DCC9',
    borderRadius: 30,
    marginBottom: 15,
    paddingLeft: 20,
    paddingRight: 10,
  },
  passwordInput: {
    flex: 1,
    padding: 15,
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
  signInDivider: {
    marginVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 15,
  },
  orDivider: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  signInDividerLine: {
    width: '40%',
    height: 1,
    backgroundColor: '#cfbf9dff',
    marginHorizontal: 10,
  },
  orDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#cfbf9dff',
  },
  dividerText: {
    marginVertical: 15,
    marginBottom: 15,
    textAlign: 'center',
    marginHorizontal: 10,
    color: '#49454F',
    fontSize: 12,
  },
  socialButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5DCC9',
  },
  socialIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  socialButtonText: {
    color: '#49454F',
    fontSize: 16,
    fontWeight: '500',
  },
  disclaimerText: {
    marginTop: 70,
    color: '#49454F',
    fontSize: 12,
    textAlign: 'center',
  },
  orText: {
    textAlign: 'center',
    color: '#49454F',
    fontSize: 14,
    marginTop: 30,
    marginBottom: 2,
  },
  verificationText: {
    textAlign: 'center',
    color: '#49454F',
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    padding: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0c4309',
    marginBottom: 10,
    textAlign: 'center',
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
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 3,
    fontWeight: 'bold',
    color: '#0c4309',
    width: '100%',
  },
  modalButton: {
    borderRadius: 15,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
    width: '100%',
  },
  buttonActive: {
    backgroundColor: '#0c4309',
  },
  buttonInactive: {
    backgroundColor: '#0c4309',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resendButton: {
    backgroundColor: 'transparent',
    padding: 10,
    marginBottom: 10,
  },
  resendButtonText: {
    color: '#0c4309',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  cancelButton: {
    backgroundColor: '#cfbf9dff',
    borderRadius: 25,
    padding: 8,
    alignItems: 'center',
    marginBottom: 10,
    width: '60%',
  },
  cancelButtonText: {
    color: '#FFFFFF',
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
});
