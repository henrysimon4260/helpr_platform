import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { supabase } from '../../lib/supabase';

export default function Login() {
  console.log('Login screen rendered');
  
  const { getReturnTo, clearReturnTo } = useAuth();
  const { showModal } = useModal();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const searchParams = useLocalSearchParams();
  const showSplash = searchParams.splash === 'true';

  const splashFadeAnim = useRef(new Animated.Value(1)).current;
  const splashScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Listen for auth state changes to handle deleted accounts
    console.log('Login screen loaded - dev menu should be hidden via app.json');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Auth state changed:', event, session?.user?.email);

      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        // Session became invalid (e.g., user deleted from Supabase)
        console.log('🚨 Session invalidated - user may have been deleted');
        showModal({
          title: 'Session Expired',
          message: 'Your account session has expired. Please sign in again.',
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [showModal]);

  useEffect(() => {
    // Attempt to minimize dev menu visibility
    console.log('Login screen loaded - dev menu should be hidden via app.json');
  }, []);

  useEffect(() => {
    if (showSplash) {
      const dissolveAnimation = Animated.parallel([
        Animated.timing(splashFadeAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(splashScaleAnim, {
          toValue: 0.95,
          duration: 1400,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
      ]);
      dissolveAnimation.start();
    }
  }, [splashFadeAnim, splashScaleAnim, showSplash]);

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
      
      // For security and simplicity, don't distinguish between account existence and wrong password
      // This prevents email enumeration attacks
      showModal({
        title: 'Sign In Failed',
        message: 'Invalid email or password. Please check your credentials and try again.',
      });
    } else {
      console.log('✅ Password sign in successful, user:', passwordData.user?.email);
      redirectAfterAuth();
    }
    setAuthLoading(false);
  };

  const signUpWithEmail = async () => {
    // Navigate to dedicated signup page
    router.replace('/signup' as any);
  };

  const verifyOTP = async () => {
    setAuthLoading(true);

    // Try both 'email' (for sign-in OTP) and 'signup' (for registration OTP)
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'email' // Use 'email' for both sign-in and signup OTP verification
    });

    if (error) {
      console.error('❌ OTP verification error:', error);
      showModal({
        title: 'Verification Failed',
        message: error.message,
      });
    } else {
      console.log('✅ OTP verification successful');
      setShowOTPVerification(false);
      redirectAfterAuth();
    }

    setAuthLoading(false);
  };

  const resendOTP = async () => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
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

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });

    if (error) {
      showModal({
        title: 'Error',
        message: error.message,
      });
    }
  };

  const skipSignIn = () => {
    router.replace('/landing');
  };

  const checkAccountStatus = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.log('🔍 No valid session found:', error);
        showModal({
          title: 'Account Status',
          message: 'No user currently signed in',
        });
        return;
      }

      if (user) {
        // Validate the session by making an authenticated request
        const { error: validationError } = await supabase.auth.getSession();
        
        if (validationError) {
          console.log('🔍 Session validation failed:', validationError);
          showModal({
            title: 'Account Status',
            message: 'Session is invalid. Please log out and sign in again.',
          });
        } else {
          console.log('🔍 Current user status:', {
            email: user.email,
            verified: user.email_confirmed_at,
            lastSignIn: user.last_sign_in_at,
            userId: user.id
          });
          showModal({
            title: 'Account Status',
            message: `Email: ${user.email}\nVerified: ${user.email_confirmed_at ? 'Yes' : 'No'}\nUser ID: ${user.id}`,
          });
        }
      } else {
        showModal({
          title: 'Account Status',
          message: 'No user signed in',
        });
      }
    } catch (error) {
      console.error('❌ Error checking account status:', error);
      showModal({
        title: 'Error',
        message: 'Failed to check account status',
      });
    }
  };

  const forceLogout = async () => {
    try {
      // Clear all local auth state
      await supabase.auth.signOut({ scope: 'local' });
      // Also try global sign out to be thorough
      await supabase.auth.signOut({ scope: 'global' });
      
      // Clear any cached session data
      console.log('🔄 Force clearing auth session...');
      
      showModal({
        title: 'Logged out',
        message: 'All authentication data has been cleared. The app will restart authentication.',
      });
    } catch (error) {
      console.error('❌ Error during force logout:', error);
      showModal({
        title: 'Error',
        message: 'Failed to clear authentication data',
      });
    }
  };

  return (
    <View style={styles.container}>
        
      <View style={styles.signInDivider}>
          
          <Text style={styles.title}>Sign in</Text>
          
        </View>

      <View style={styles.formContainer}>
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

        <Pressable style={styles.secondaryButton} onPress={signUpWithEmail} disabled={authLoading}>
          <Text style={styles.secondaryButtonText}>Sign Up</Text>
        </Pressable>

        <View style={styles.orDivider}>
          <View style={styles.orDividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.orDividerLine} />
        </View>

        <Pressable style={styles.socialButton} onPress={signInWithGoogle}>
          <Image
            source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
            style={styles.socialIcon}
          />
          <Text style={styles.socialButtonText}>Continue with Google</Text>
        </Pressable>

        <Pressable style={styles.skipLink} onPress={skipSignIn}>
          <Text style={styles.skipLinkText}>skip this step</Text>
        </Pressable>
      </View>

      {/* Invisible overlay to block dev menu button */}
      <View style={styles.devMenuBlocker} pointerEvents="none" />

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
              onPress={() => setShowOTPVerification(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {showSplash && (
        <Animated.View style={[
          styles.splashOverlay,
          { 
            opacity: splashFadeAnim,
            transform: [{ scale: splashScaleAnim }]
          }
        ]}>
          <Image 
            source={require('../../assets/images/splash.png')}
            style={styles.splashImage}
            resizeMode="cover"
          />
        </Animated.View>
      )}
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
    fontSize: 16,
    fontWeight: '500',
    color: '#0c4309',
    marginTop: 90,
  },
  formContainer: {
    width: '100%',
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
    marginTop: 100,
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
  skipLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingVertical: 10,
  },

  skipLinkText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '500',
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
    backgroundColor: '#cfbf9dff', // Green background
    borderRadius: 25, // More rounded corners
    padding: 8, // Even smaller padding
    alignItems: 'center',
    marginBottom: 10,
    width: '60%',
  },
  cancelButtonText: {
    color: '#FFFFFF', // White text
    fontSize: 16,
    fontWeight: 'bold',
  },
  devMenuBlocker: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50, // Covers the typical dev menu button area
    backgroundColor: 'transparent',
  },
  splashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  splashImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
