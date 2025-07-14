import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, InteractionManager, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Asset, ImageLibraryOptions, ImagePickerResponse, launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '../src/lib/supabase';
import { ensureServiceProviderProfile } from '../src/lib/providerProfile';
import { useModal } from '../src/contexts/ModalContext';

export default function Signup() {
  console.log('Signup screen rendered');

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
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<Asset | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const { showModal, hideModal } = useModal();

  useEffect(() => {
    console.log('Signup screen loaded - creating beautiful user experience');
  }, []);

  const sanitizePhoneValue = useCallback(() => {
    const cleaned = phone.replace(/[^0-9]/g, '').trim();
    return cleaned.length > 0 ? cleaned : null;
  }, [phone]);

  const validateSignupInputs = () => {
    setPhotoError(null);
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
    if (!profileImage?.uri) {
      setPhotoError('Profile picture is required.');
      showModal({
        title: 'Profile Picture Required',
        message: 'Please upload a profile picture to continue.',
      });
      return false;
    }
    return true;
  };

  const handleSelectProfileImage = useCallback(() => {
    const options: ImageLibraryOptions = {
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
    };

    launchImageLibrary(
      options,
      (response: ImagePickerResponse) => {
        if (response.didCancel) {
          return;
        }

        if (response.errorCode) {
          console.error('Image picker error:', response.errorMessage ?? response.errorCode);
          showModal({
            title: 'Photo Selection Failed',
            message: response.errorMessage ?? 'Unable to access your photo library. Please try again.',
          });
          return;
        }

        const asset = response.assets?.[0];
        if (asset?.uri) {
          setProfileImage(asset);
          setPhotoError(null);
        } else {
          showModal({
            title: 'Photo Selection Failed',
            message: 'No image was selected. Please choose a photo to continue.',
          });
        }
      },
    );
  }, [showModal]);

  const uploadProviderProfilePhoto = useCallback(
    async (providerId: string) => {
      if (!profileImage?.uri) {
        return { success: false as const, url: null, error: null };
      }

      try {
        // Use the same upload approach as account.tsx (which works)
        const response = await fetch(profileImage.uri);
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        const fileExtension = profileImage.fileName?.split('.').pop()?.toLowerCase() ?? 
                              profileImage.type?.split('/').pop() ?? 'jpg';
        const fileName = `profile-${Date.now()}.${fileExtension}`;
        
        const objectPath = `providers/${providerId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('profile-pictures')
          .upload(objectPath, bytes, {
            cacheControl: '3600',
            upsert: true,
            contentType: profileImage.type ?? 'image/jpeg',
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from('profile-pictures')
          .getPublicUrl(objectPath);

        const publicUrl = publicUrlData?.publicUrl ?? null;

        if (publicUrl) {
          console.log('Generated public URL:', publicUrl);
          
          const { error: updateError } = await supabase
            .from('service_provider')
            .update({ profile_picture_url: publicUrl })
            .eq('service_provider_id', providerId);

          if (updateError) {
            console.error('Database update error:', updateError);
            throw updateError;
          }

          console.log('Profile picture uploaded successfully:', {
            providerId,
            publicUrl,
            objectPath,
            bytesLength: bytes.length
          });
        } else {
          console.error('Failed to get public URL for uploaded profile picture');
          throw new Error('Failed to get public URL');
        }

        return { success: true as const, url: publicUrl, error: null };
      } catch (error) {
        console.error('Failed to upload profile image:', error);
        return { success: false as const, url: null, error };
      }
    },
    [profileImage],
  );

  const signUpWithEmail = async () => {
    if (!validateSignupInputs()) return;

    setAuthLoading(true);
    console.log('🔄 Attempting signup for:', email);

    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      const sanitizedPhone = sanitizePhoneValue();

      // Create auth account with email/password
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: sanitizedPhone,
            role: 'service_provider',
          },
        },
      });

      if (authError) {
        console.error('❌ Auth signup error:', authError);
        showModal({
          title: 'Signup Failed',
          message: authError.message,
        });
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

  console.log('✅ Auth account created, user ID:', authData.user.id);
  setPendingProviderId(authData.user.id);

      // Show OTP verification modal - Supabase should have sent confirmation email
      setShowOTPVerification(true);
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
    console.log('Starting OTP verification with code:', otpCode);
    setAuthLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode,
        type: 'signup'
      });

      console.log('OTP verification response:', { data: !!data, error: error?.message });

      if (error) {
        console.error('❌ OTP verification error:', error);
        setAuthLoading(false); // Reset loading state on error
        showModal({
          title: 'Verification Failed',
          message: error.message,
        });
        return; // Exit early on error
      }

      // Success path
      console.log('✅ Email verified successfully');
      const verifiedProviderId = data?.session?.user?.id ?? pendingProviderId;
      const ensureResult = await ensureServiceProviderProfile({
        userId: verifiedProviderId,
        firstName,
        lastName,
        email: email.trim(),
        phone: sanitizePhoneValue(),
      });

      console.log('Provider profile ensure result:', JSON.stringify(ensureResult, null, 2));
      
      let hasWarnings = false;
      let warningMessage = '';

      if (!ensureResult.success) {
        console.error('⚠️ Failed to ensure provider profile:', ensureResult.error);
        hasWarnings = true;
        warningMessage += 'Profile setup had issues. ';
      }

      if (verifiedProviderId && profileImage?.uri) {
        console.log('Starting profile picture upload for provider:', verifiedProviderId);
        const uploadResult = await uploadProviderProfilePhoto(verifiedProviderId);
        console.log('Profile picture upload result:', uploadResult);
        if (!uploadResult.success) {
          hasWarnings = true;
          warningMessage += 'Profile picture could not be saved. ';
        }
      }

      // Clear all signup state and navigate after interaction is complete
      console.log('Signup completed successfully, preparing to navigate to landing screen');
      
      // Show any warnings as console logs
      if (hasWarnings) {
        console.warn('Signup completed with warnings:', warningMessage);
      }
      
      // Dismiss keyboard first
      Keyboard.dismiss();
      
      // Clear any residual modal state
      hideModal();
      
      // Clear critical state immediately
      setPendingProviderId(null);
      setShowOTPVerification(false);
      setAuthLoading(false);
      
      // Use InteractionManager to ensure all UI interactions are complete
      InteractionManager.runAfterInteractions(() => {
        // Clear all form data
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setPassword('');
        setConfirmPassword('');
        setOtpCode('');
        setProfileImage(null);
        setPhotoError(null);
        
        // Navigate after a longer delay to ensure all React state updates are complete
        setTimeout(() => {
          console.log('All state cleared, navigating to landing screen');
          router.replace('/landing');
        }, 500);
      });
    } catch (unexpectedError) {
      console.error('❌ Unexpected error during OTP verification:', unexpectedError);
      setAuthLoading(false);
      showModal({
        title: 'Verification Failed',
        message: 'An unexpected error occurred. Please try again.',
      });
    }
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
            <View style={styles.photoSection}>
              <Pressable style={styles.photoPicker} onPress={handleSelectProfileImage}>
                {profileImage?.uri ? (
                  <Image source={{ uri: profileImage.uri }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>Tap to upload photo</Text>
                  </View>
                )}
              </Pressable>
              {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
            </View>

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
        onRequestClose={handleOTPCancel}
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
    marginTop: 30,
    marginBottom: 30,
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
  photoSection: {
    marginBottom: 15,
  },
  photoPicker: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#686868ff',
    backgroundColor: '#E5DCC9',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreview: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3ead7',
  },
  photoPlaceholderText: {
    color: '#49454f',
    textAlign: 'center',
    fontWeight: '600',
  },
  photoHelperText: {
    marginTop: 8,
    color: '#49454f',
    fontSize: 13,
  },
  photoError: {
    marginTop: 6,
    color: '#a11313',
    fontWeight: '600',
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
