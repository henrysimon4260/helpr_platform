import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Asset, ImageLibraryOptions, ImagePickerResponse, launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '../src/lib/supabase';
import { useModal } from '../src/contexts/ModalContext';

// Key for storing pending signup data during Stripe onboarding
const PENDING_SIGNUP_KEY = 'pending_stripe_signup';

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
  const [stripeOnboardingInProgress, setStripeOnboardingInProgress] = useState(false);
  const [signupCompleting, setSignupCompleting] = useState(false);
  const { showModal, hideModal } = useModal();

  useEffect(() => {
    console.log('Signup screen loaded - creating beautiful user experience');

    // Check if there's pending signup data from Stripe onboarding
    const checkPendingSignup = async () => {
      if (signupCompleting) {
        console.log('Signup completion already in progress, skipping...');
        return;
      }

      try {
        console.log('🔍 Checking for pending signup data...');
        const pendingDataStr = await SecureStore.getItemAsync(PENDING_SIGNUP_KEY);
        if (pendingDataStr) {
          console.log('🎉 Found pending signup data - completing signup after Stripe onboarding...');
          setSignupCompleting(true);
          const pendingData = JSON.parse(pendingDataStr);
          console.log('📋 Pending data keys:', Object.keys(pendingData));

          // Complete the signup process automatically
          await completeSignupAfterStripe(pendingData.stripeAccountId);
          setSignupCompleting(false);
        } else {
          console.log('No pending signup data found');
        }
      } catch (error) {
        console.error('Error checking pending signup:', error);
        setSignupCompleting(false);
      }
    };

    checkPendingSignup();
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


  // Complete signup after successful Stripe onboarding
  const completeSignupAfterStripe = async (stripeAccountId: string) => {
    console.log('🎉 Completing signup after Stripe onboarding, accountId:', stripeAccountId);
    
    try {
      // Retrieve pending signup data
      const pendingDataStr = await SecureStore.getItemAsync(PENDING_SIGNUP_KEY);
      if (!pendingDataStr) {
        console.error('No pending signup data found');
        showModal({
          title: 'Error',
          message: 'Signup data was lost. Please try again.',
        });
        return;
      }

      const pendingData = JSON.parse(pendingDataStr);
      console.log('📋 Retrieved pending signup data:', { ...pendingData, password: '[REDACTED]' });

      // NOW create the auth account
      console.log('📧 Creating auth account...');
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: pendingData.email,
        password: pendingData.password,
        options: {
          data: {
            first_name: pendingData.firstName,
            last_name: pendingData.lastName,
            phone: pendingData.phone,
            role: 'service_provider',
          },
        },
      });

      if (authError) {
        console.error('❌ Auth signup error:', authError);
        showModal({
          title: 'Account Creation Failed',
          message: authError.message,
        });
        return;
      }

      if (!authData.user) {
        console.error('❌ No user data returned from signup');
        showModal({
          title: 'Account Creation Failed',
          message: 'Could not create your account. Please try again.',
        });
        return;
      }

      const userId = authData.user.id;
      console.log('✅ Auth account created, user ID:', userId);

      // NOW create the service_provider record with Stripe account ID
      console.log('📝 Creating service provider profile...');
      const { error: insertError } = await supabase
        .from('service_provider')
        .insert({
          service_provider_id: userId,
          first_name: pendingData.firstName,
          last_name: pendingData.lastName,
          email: pendingData.email,
          phone: pendingData.phone ? Number(pendingData.phone.replace(/[^0-9]/g, '')) : null,
          jobs_completed: 0,
          rating: null,
          profile_picture_url: null,
          balance: 0,
          stripe_account_id: stripeAccountId,
        });

      if (insertError) {
        console.error('❌ Failed to create service provider profile:', insertError);
        // Don't block - account is created, profile can be fixed later
      } else {
        console.log('✅ Service provider profile created');
      }

      // Upload profile picture if we have one stored
      if (pendingData.profileImageUri) {
        console.log('📸 Uploading profile picture...');
        try {
          const response = await fetch(pendingData.profileImageUri);
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          const fileExtension = pendingData.profileImageFileName?.split('.').pop()?.toLowerCase() || 'jpg';
          const fileName = `profile-${Date.now()}.${fileExtension}`;
          const objectPath = `providers/${userId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('profile-pictures')
            .upload(objectPath, bytes, {
              cacheControl: '3600',
              upsert: true,
              contentType: pendingData.profileImageType || 'image/jpeg',
            });

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage
              .from('profile-pictures')
              .getPublicUrl(objectPath);

            if (publicUrlData?.publicUrl) {
              await supabase
                .from('service_provider')
                .update({ profile_picture_url: publicUrlData.publicUrl })
                .eq('service_provider_id', userId);
              console.log('✅ Profile picture uploaded');
            }
          }
        } catch (photoError) {
          console.warn('⚠️ Profile picture upload failed:', photoError);
        }
      }

      // Clear pending data
      await SecureStore.deleteItemAsync(PENDING_SIGNUP_KEY);

      // Success! Navigate to landing
      showModal({
        title: 'Account Ready!',
        message: 'Your account is set up and ready to accept jobs. Welcome aboard!',
        buttons: [{
          text: 'Get Started',
          onPress: () => {
            hideModal();
            router.replace('/landing');
          },
        }],
      });

    } catch (error) {
      console.error('❌ Error completing signup:', error);
      showModal({
        title: 'Error',
        message: 'Something went wrong. Please try signing up again.',
      });
    }
  };

  const proceedWithSignup = async () => {
    console.log('🔄 Starting actual signup process...');

    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      const sanitizedPhone = sanitizePhoneValue();

      // STEP 1: Create Stripe account FIRST (before auth account)
      console.log('🏦 Step 1: Creating Stripe Connect account...');

      const stripeReturnUrl = Linking.createURL('stripe-complete');
      const stripeRefreshUrl = Linking.createURL('signup');

      // Use supabase.functions.invoke instead of direct fetch to handle auth properly
      // This will automatically include the proper auth headers if a session exists
      const { data: stripeData, error: stripeError } = await supabase.functions.invoke('create-connect-account', {
        body: {
          email: trimmedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          refreshUrl: stripeRefreshUrl,
          returnUrl: stripeReturnUrl,
          refresh_url: stripeRefreshUrl,
          return_url: stripeReturnUrl,
          // SSN, DOB, address will be collected by Stripe during onboarding
        },
      });
      console.log('📥 Stripe response received');
      console.log('📥 Stripe data:', stripeData ? 'present' : 'null', 'error:', stripeError ? 'present' : 'null');

      if (stripeError || !stripeData?.success) {
        console.error('❌ Stripe account creation failed:', stripeError?.message || stripeData?.error);
        console.error('Full stripeError:', stripeError);
        console.error('Full stripeData:', stripeData);
        showModal({
          title: 'Setup Failed',
          message: 'Could not set up payment processing. Please try again.',
        });
        setAuthLoading(false);
        return;
      }

      console.log('✅ Stripe account creation successful');

      const stripeAccountId = stripeData.accountId || stripeData.account_id;
      const stripeOnboardingUrl = stripeData.onboardingUrl || stripeData.onboarding_url;

      if (!stripeOnboardingUrl) {
        console.error('❌ No onboarding URL received');
        showModal({
          title: 'Setup Failed',
          message: 'Could not get payment setup link. Please try again.',
        });
        setAuthLoading(false);
        return;
      }

      console.log('✅ Stripe account created:', stripeAccountId);

      // STEP 2: Store pending signup data (we'll complete signup after Stripe returns)
      console.log('💾 Step 2: Storing pending signup data...');
      const pendingData = {
        email: trimmedEmail,
        password: trimmedPassword,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: sanitizedPhone,
        stripeAccountId: stripeAccountId,
        profileImageUri: profileImage?.uri || null,
        profileImageFileName: profileImage?.fileName || null,
        profileImageType: profileImage?.type || null,
        createdAt: new Date().toISOString(),
      };

      await SecureStore.setItemAsync(PENDING_SIGNUP_KEY, JSON.stringify(pendingData));
      console.log('✅ Pending signup data stored');

      setAuthLoading(false);

      // STEP 3: Open Stripe onboarding in-app browser
      console.log('🌐 Step 3: Opening Stripe onboarding in-app...');
      showModal({
        title: 'Set Up Payments',
        message: 'Next, you\'ll set up your payment account to receive earnings.\n\nAfter completing the setup, tap the "Return to Helpr" button to finish creating your account.',
        allowBackdropDismiss: false,
        buttons: [
          {
            text: 'Continue to Setup',
            onPress: async () => {
              hideModal();
              setStripeOnboardingInProgress(true);

              try {
                // Use expo-web-browser's openAuthSessionAsync for in-app browser
                // This opens Safari View Controller (iOS) or Chrome Custom Tabs (Android)
                // and automatically detects when the return URL is reached
                console.log('🌐 Opening Stripe URL in in-app browser:', stripeOnboardingUrl);
                
                // The redirect URL that the browser will watch for
                const redirectUrl = stripeReturnUrl;
                
                const result = await WebBrowser.openAuthSessionAsync(
                  stripeOnboardingUrl,
                  redirectUrl,
                  {
                    showInRecents: true,
                    preferEphemeralSession: false, // Keep session for autofill
                  }
                );

                console.log('🌐 WebBrowser result:', result);
                
                setStripeOnboardingInProgress(false);

                if (result.type === 'success') {
                  // User completed the flow and was redirected back
                  console.log('✅ Stripe onboarding completed, redirected to:', result.url);
                  
                  // Complete the signup process
                  await completeSignupAfterStripe(stripeAccountId);
                  
                } else if (result.type === 'cancel' || result.type === 'dismiss') {
                  // Browser was closed - user either:
                  // 1. Tapped "Return to Helpr" button (completed Stripe)
                  // 2. Manually closed the browser
                  // Either way, check for pending data and complete signup
                  console.log('🔄 Browser closed, type:', result.type);
                  
                  // Check if pending signup data still exists
                  const pendingDataStr = await SecureStore.getItemAsync(PENDING_SIGNUP_KEY);
                  
                  if (pendingDataStr) {
                    // Pending data exists - complete the signup automatically
                    // The Stripe account was created, so we can proceed
                    console.log('✅ Completing signup after browser close...');
                    await completeSignupAfterStripe(stripeAccountId);
                  } else {
                    // No pending data - signup might have already completed via deep link
                    console.log('📋 No pending data after browser close - signup may have completed');
                  }
                }
              } catch (browserError) {
                console.error('Browser error:', browserError);
                setStripeOnboardingInProgress(false);
                await SecureStore.deleteItemAsync(PENDING_SIGNUP_KEY);
                showModal({
                  title: 'Error',
                  message: 'Could not open payment setup. Please try again.',
                });
              }
            },
          },
        ],
      });

    } catch (error) {
      console.error('❌ Unexpected signup error:', error);
      showModal({
        title: 'Signup Failed',
        message: 'An unexpected error occurred. Please try again.',
      });
      setAuthLoading(false);
    }
  };

  // EMAIL VERIFICATION DISABLED - OTP functions commented out
  // const verifyOTP = async () => {
  //   console.log('Starting OTP verification with code:', otpCode);
  //   setAuthLoading(true);

  //   try {
  //     const { data, error } = await supabase.auth.verifyOtp({
  //       email: email.trim(),
  //       token: otpCode,
  //       type: 'signup'
  //     });

  //     console.log('OTP verification response:', { data: !!data, error: error?.message });

  //     if (error) {
  //       console.error('❌ OTP verification error:', error);
  //       setAuthLoading(false); // Reset loading state on error
  //       showModal({
  //         title: 'Verification Failed',
  //         message: error.message,
  //       });
  //       return; // Exit early on error
  //     }

  //     // Success path
  //     console.log('✅ Email verified successfully');
  //     const verifiedProviderId = data?.session?.user?.id ?? pendingProviderId;
  //     const ensureResult = await ensureServiceProviderProfile({
  //       userId: verifiedProviderId,
  //       firstName,
  //       lastName,
  //       email: email.trim(),
  //       phone: sanitizePhoneValue(),
  //     });

  //     console.log('Provider profile ensure result:', JSON.stringify(ensureResult, null, 2));
      
  //     let hasWarnings = false;
  //     let warningMessage = '';

  //     if (!ensureResult.success) {
  //       console.error('⚠️ Failed to ensure provider profile:', ensureResult.error);
  //       hasWarnings = true;
  //       warningMessage += 'Profile setup had issues. ';
  //     }

  //     if (verifiedProviderId && profileImage?.uri) {
  //       console.log('Starting profile picture upload for provider:', verifiedProviderId);
  //       const uploadResult = await uploadProviderProfilePhoto(verifiedProviderId);
  //       console.log('Profile picture upload result:', uploadResult);
  //       if (!uploadResult.success) {
  //         hasWarnings = true;
  //         warningMessage += 'Profile picture could not be saved. ';
  //       }
  //     }

  //     // Clear all signup state and navigate after interaction is complete
  //     console.log('Signup completed successfully, preparing to navigate to landing screen');
      
  //     // Show any warnings as console logs
  //     if (hasWarnings) {
  //       console.warn('Signup completed with warnings:', warningMessage);
  //     }
      
  //     // Dismiss keyboard first
  //     Keyboard.dismiss();
      
  //     // Clear any residual modal state
  //     hideModal();
      
  //     // Clear critical state immediately
  //     setPendingProviderId(null);
  //     setShowOTPVerification(false);
  //     setAuthLoading(false);
      
  //     // Use InteractionManager to ensure all UI interactions are complete
  //     InteractionManager.runAfterInteractions(() => {
  //       // Clear all form data
  //       setFirstName('');
  //       setLastName('');
  //       setEmail('');
  //       setPhone('');
  //       setPassword('');
  //       setConfirmPassword('');
  //       setOtpCode('');
  //       setProfileImage(null);
  //       setPhotoError(null);
        
  //       // Navigate after a longer delay to ensure all React state updates are complete
  //       setTimeout(() => {
  //         console.log('All state cleared, navigating to landing screen');
  //         router.replace('/landing');
  //       }, 500);
  //     });
  //   } catch (unexpectedError) {
  //     console.error('❌ Unexpected error during OTP verification:', unexpectedError);
  //     setAuthLoading(false);
  //     showModal({
  //       title: 'Verification Failed',
  //       message: 'An unexpected error occurred. Please try again.',
  //     });
  //   }
  // };

  // const handleOTPCancel = useCallback(() => {
  //   console.log('OTP verification cancelled by user - resetting all states');
    
  //   // Reset all states that might be blocking the UI
  //   setAuthLoading(false);
  //   setShowOTPVerification(false);
    
  //   // Clear OTP input
  //   setOtpCode('');
    
  //   // Dismiss keyboard if active
  //   Keyboard.dismiss();
    
  //   // Clear any modal state
  //   hideModal();
    
  //   console.log('All states reset after OTP cancel - form should be responsive now');
  // }, [hideModal]);

  // const resendOTP = async () => {
  //   const { error } = await supabase.auth.resend({
  //     type: 'signup',
  //     email: email.trim(),
  //   });

  //   if (error) {
  //     showModal({
  //       title: 'Error',
  //       message: 'Failed to resend code',
  //     });
  //   } else {
  //     showModal({
  //       title: 'Code Sent',
  //       message: 'A new verification code has been sent to your email',
  //     });
  //   }
  // };

  const goToSignIn = () => {
    router.replace('/login');
  };

  const signUpWithEmail = async () => {
    console.log('🔄 Starting signup validation...');
    if (!validateSignupInputs()) {
      console.log('❌ Signup validation failed');
      return;
    }

    setAuthLoading(true);
    console.log('✅ Validation passed, starting signup flow for:', email);

    // Dismiss keyboard
    Keyboard.dismiss();
    console.log('✅ Keyboard dismissed, proceeding with signup...');

    // Continue with the actual signup process
    proceedWithSignup();
  };


  // Show loading screen while Stripe onboarding is in progress
  if (stripeOnboardingInProgress) {
    return (
      <View style={styles.stripeLoadingContainer}>
        <ActivityIndicator size="large" color="#0c4309" />
        <Text style={styles.stripeLoadingTitle}>Setting Up Payments...</Text>
        <Text style={styles.stripeLoadingMessage}>
          Complete the Stripe setup in your browser to start accepting payments.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.innerContainer}>
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

          </View>

          {/* Invisible overlay to block dev menu button */}
          <View style={styles.devMenuBlocker} pointerEvents="none" />
        </ScrollView>

          {/* Fixed bottom buttons */}
          <View style={styles.bottomButtonsContainer}>
            <Pressable style={styles.button} onPress={signUpWithEmail} disabled={authLoading}>
              <Text style={styles.buttonText}>{authLoading ? 'Creating Account...' : 'Create Account'}</Text>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={goToSignIn}>
              <Text style={styles.secondaryButtonText}>Already have an account? Sign In</Text>
            </Pressable>
          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* OTP Verification Modal - DISABLED (email verification commented out)
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
      */}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  stripeLoadingContainer: {
    flex: 1,
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  stripeLoadingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4309',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  stripeLoadingMessage: {
    fontSize: 16,
    color: '#49454F',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  innerContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 20,
  },
  bottomButtonsContainer: {
    backgroundColor: '#FFF8E8',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    borderTopWidth: 1,
    borderTopColor: '#E5DCC9',
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
  sectionLabel: {
    fontSize: 14,
    color: '#49454F',
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '500',
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
