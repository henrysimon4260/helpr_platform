import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { supabase } from '../src/lib/supabase';

interface ProviderData {
  service_provider_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
}

export default function Account() {
  const [providerData, setProviderData] = useState<ProviderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Edit form state
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // OTP verification state
  const [showEmailOTPModal, setShowEmailOTPModal] = useState(false);
  const [showPasswordOTPModal, setShowPasswordOTPModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [pendingEmailChange, setPendingEmailChange] = useState('');
  const [pendingPasswordChange, setPendingPasswordChange] = useState('');

  // Payment method state
  const [paymentMethods, setPaymentMethods] = useState([
    { id: '1', type: 'card', last4: '4242', brand: 'Visa', isDefault: true },
  ]);
  const [showAddPayment, setShowAddPayment] = useState(false);

  useEffect(() => {
    fetchProviderData();
  }, []);

  const fetchProviderData = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user || !user.email) {
        Alert.alert('Error', 'Please sign in to view your account');
        router.replace('/login');
        return;
      }

      const {
        data: existingProvider,
        error: providerError,
      } = await supabase
        .from('service_provider')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (providerError) {
        console.error('Error fetching provider data:', providerError);
        Alert.alert('Error', 'Failed to load account data');
        return;
      }

      if (!existingProvider) {
        const profileDefaults = {
          service_provider_id: user.id,
          email: user.email,
          first_name: user.user_metadata?.first_name ?? '',
          last_name: user.user_metadata?.last_name ?? '',
          phone_number: (user.user_metadata?.phone_number as string | null) ?? null,
        };

        const {
          data: createdProvider,
          error: createError,
        } = await supabase
          .from('service_provider')
          .insert(profileDefaults)
          .select('*')
          .maybeSingle();

        if (createError) {
          console.error('Error creating provider profile:', createError);
          Alert.alert('Error', 'Failed to initialize your account profile');
          return;
        }

        const provider: ProviderData | null = createdProvider
          ? (createdProvider as ProviderData)
          : {
              service_provider_id: user.id,
              first_name: profileDefaults.first_name,
              last_name: profileDefaults.last_name,
              email: profileDefaults.email,
              phone_number: profileDefaults.phone_number,
            };
        setProviderData(provider);
        setEditFirstName(provider.first_name || '');
        setEditLastName(provider.last_name || '');
        setEditEmail(provider.email);
        setEditPhone(provider.phone_number || '');
        return;
      }

      const typedProvider = existingProvider as ProviderData;
      setProviderData(typedProvider);
      setEditFirstName(typedProvider.first_name || '');
      setEditLastName(typedProvider.last_name || '');
      setEditEmail(typedProvider.email || user.email);
      setEditPhone(typedProvider.phone_number || '');
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const saveProfileChanges = async () => {
    if (!providerData) return;

    try {
      setLoading(true);

      const emailChanged = editEmail.trim().toLowerCase() !== providerData.email.toLowerCase();

      if (emailChanged) {
        const { error: updateError } = await supabase.auth.updateUser({
          email: editEmail.trim(),
        });

        if (updateError) {
          console.error('Error updating email:', updateError);
          Alert.alert('Error', 'Failed to send verification email');
          return;
        }

        setPendingEmailChange(editEmail.trim());
        setEditing(false);
        setShowEmailOTPModal(true);
        return;
      }

      const { error } = await supabase
        .from('service_provider')
        .update({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          phone_number: editPhone.trim() || null,
        })
        .eq('service_provider_id', providerData.service_provider_id);

      if (error) {
        console.error('Error updating profile:', error);
        Alert.alert('Error', 'Failed to update profile');
        return;
      }

      setProviderData({
        ...providerData,
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone_number: editPhone.trim() || null,
      });

      setEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (!newPassword || !confirmNewPassword || !providerData) {
      Alert.alert('Error', 'Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    try {
      setPasswordLoading(true);

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: providerData.email,
      });

      if (otpError) {
        console.error('Error sending OTP:', otpError);
        Alert.alert('Error', 'Failed to send verification code');
        return;
      }

      setPendingPasswordChange(newPassword);
      setShowPasswordModal(false);
      setShowPasswordOTPModal(true);
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setPasswordLoading(false);
    }
  };

  const signOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
            router.replace('/login');
          } catch (error) {
            console.error('Error signing out:', error);
            Alert.alert('Error', 'Failed to sign out');
          }
        },
      },
    ]);
  };

  const verifyEmailOTP = async () => {
    if (!otpCode || !pendingEmailChange || !providerData) return;

    try {
      setOtpLoading(true);

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: pendingEmailChange,
        token: otpCode,
        type: 'email_change',
      });

      if (verifyError) {
        console.error('Error verifying OTP:', verifyError);
        Alert.alert('Error', 'Invalid verification code');
        return;
      }

      const { error: providerError } = await supabase
        .from('service_provider')
        .update({
          email: pendingEmailChange,
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          phone_number: editPhone.trim() || null,
        })
        .eq('service_provider_id', providerData.service_provider_id);

      if (providerError) {
        console.error('Error updating provider record:', providerError);
        Alert.alert('Error', 'Failed to update profile');
        return;
      }

      setProviderData({
        ...providerData,
        email: pendingEmailChange,
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone_number: editPhone.trim() || null,
      });

      setShowEmailOTPModal(false);
      setOtpCode('');
      setPendingEmailChange('');
      Alert.alert('Success', 'Email and profile updated successfully!');
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyPasswordOTP = async () => {
    if (!otpCode || !pendingPasswordChange || !providerData) return;

    try {
      setOtpLoading(true);

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: providerData.email,
        token: otpCode,
        type: 'magiclink',
      });

      if (verifyError) {
        console.error('Error verifying OTP:', verifyError);
        Alert.alert('Error', 'Invalid verification code');
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: pendingPasswordChange,
      });

      if (error) {
        console.error('Error changing password:', error);
        Alert.alert('Error', 'Failed to change password');
        return;
      }

      setShowPasswordOTPModal(false);
      setOtpCode('');
      setPendingPasswordChange('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert('Success', 'Password changed successfully!');
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setOtpLoading(false);
    }
  };

  const resendEmailOTP = async () => {
    if (!pendingEmailChange) return;

    try {
      setResendLoading(true);

      const { error } = await supabase.auth.updateUser({
        email: pendingEmailChange,
      });

      if (error) {
        console.error('Error resending OTP:', error);
        Alert.alert('Error', 'Failed to resend verification code');
        return;
      }

      Alert.alert('Success', 'Verification code sent!');
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setResendLoading(false);
    }
  };

  const resendPasswordOTP = async () => {
    if (!providerData) return;

    try {
      setResendLoading(true);

      const { error } = await supabase.auth.signInWithOtp({
        email: providerData.email,
      });

      if (error) {
        console.error('Error resending OTP:', error);
        Alert.alert('Error', 'Failed to resend verification code');
        return;
      }

      Alert.alert('Success', 'Verification code sent!');
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setResendLoading(false);
    }
  };

  const addPaymentMethod = () => {
    Alert.alert('Add Payment Method', 'Payment method integration would be implemented here');
    setShowAddPayment(false);
  };

  const removePaymentMethod = (id: string) => {
    Alert.alert(
      'Remove Payment Method',
      'Are you sure you want to remove this payment method?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPaymentMethods(prev => prev.filter(pm => pm.id !== id));
          }
        }
      ]
    );
  };

  const chevronIcon = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 18L15 12L9 6" stroke="#0c4309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const cardIcon = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="#0c4309" stroke-width="2"/>
      <line x1="2" y1="10" x2="22" y2="10" stroke="#0c4309" stroke-width="2"/>
    </svg>
  `;

  const lockIcon = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#0c4309" stroke-width="2"/>
      <circle cx="12" cy="16" r="1" stroke="#0c4309" stroke-width="2"/>
      <path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke="#0c4309" stroke-width="2"/>
    </svg>
  `;

  const userIcon = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="#0c4309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="#0c4309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0c4309" />
        <Text style={styles.loadingText}>Loading your account...</Text>
      </View>
    );
  }

  if (!providerData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load account data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProviderData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.push('/landing')}>
          <Image
            source={require('../assets/icons/backButton.png')}
            style={styles.backButtonIcon}
          />
        </Pressable>
        <Text style={styles.title}>Account</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {providerData.first_name.charAt(0).toUpperCase()}
              {providerData.last_name.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>
            {providerData.first_name} {providerData.last_name}
          </Text>
          <Text style={styles.email} numberOfLines={1}>{providerData.email}</Text>
          {providerData.phone_number && (
            <Text style={styles.phone}>{providerData.phone_number}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.editIcon} onPress={() => {
          setEditFirstName(providerData?.first_name || '');
          setEditLastName(providerData?.last_name || '');
          setEditEmail(providerData?.email || '');
          setEditPhone(providerData?.phone_number || '');
          setEditing(true);
        }}>
          <Text style={styles.editIconText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} onPress={() => setShowPaymentModal(true)}>
          <View style={styles.menuItemContent}>
            <SvgXml xml={cardIcon} width="20" height="20" />
            <Text style={styles.menuItemText}>Payment methods</Text>
          </View>
          <SvgXml xml={chevronIcon} width="16" height="16" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => setShowPasswordModal(true)}>
          <View style={styles.menuItemContent}>
            <SvgXml xml={lockIcon} width="20" height="20" />
            <Text style={styles.menuItemText}>Security</Text>
          </View>
          <SvgXml xml={chevronIcon} width="16" height="16" />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.signOutItem} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={editing}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => {
                setEditFirstName(providerData?.first_name || '');
                setEditLastName(providerData?.last_name || '');
                setEditEmail(providerData?.email || '');
                setEditPhone(providerData?.phone_number || '');
                setEditing(false);
              }}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.editForm}>
              <TextInput
                style={styles.editInput}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder="First Name"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.editInput}
                value={editLastName}
                onChangeText={setEditLastName}
                placeholder="Last Name"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.editInput}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.editInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Phone (optional)"
                keyboardType="phone-pad"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveProfileChanges}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholderTextColor="#999"
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Confirm New Password"
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              secureTextEntry
              placeholderTextColor="#999"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={changePassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? (
                  <ActivityIndicator color="#0c4309" />
                ) : (
                  <Text style={styles.modalSaveButtonText}>Update Password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPasswordModal(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPaymentModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Payment Methods</Text>

            {paymentMethods.map((method) => (
              <View key={method.id} style={styles.paymentMethodItem}>
                <View style={styles.paymentMethodInfo}>
                  <Text style={styles.paymentMethodText}>
                    {method.brand} •••• {method.last4}
                  </Text>
                  {method.isDefault && (
                    <Text style={styles.defaultLabel}>Default</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.removePaymentButton}
                  onPress={() => removePaymentMethod(method.id)}
                >
                  <Text style={styles.removePaymentText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addPaymentButton} onPress={addPaymentMethod}>
              <Text style={styles.addPaymentButtonText}>+ Add payment method</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowPaymentModal(false)}
            >
              <Text style={styles.modalCancelButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEmailOTPModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Verify Email Change</Text>
            <Text style={styles.otpDescription}>
              We've sent a verification code to {pendingEmailChange}. Please enter it below.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Enter verification code"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="numeric"
              maxLength={6}
              placeholderTextColor="#999"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={verifyEmailOTP}
                disabled={otpLoading}
              >
                {otpLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.modalSaveButtonText}>Verify & Update</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resendButton, resendLoading && styles.resendButtonDisabled]}
                onPress={resendEmailOTP}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <ActivityIndicator color="#0c4309" size="small" />
                ) : (
                  <Text style={styles.resendButtonText}>Resend Code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowEmailOTPModal(false);
                  setOtpCode('');
                  setPendingEmailChange('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPasswordOTPModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Verify Password Change</Text>
            <Text style={styles.otpDescription}>
              For security, we've sent a verification code to your email. Please enter it below to confirm the password change.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Enter verification code"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="numeric"
              maxLength={6}
              placeholderTextColor="#999"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={verifyPasswordOTP}
                disabled={otpLoading}
              >
                {otpLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.modalSaveButtonText}>Verify & Update</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resendButton, resendLoading && styles.resendButtonDisabled]}
                onPress={resendPasswordOTP}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <ActivityIndicator color="#0c4309" size="small" />
                ) : (
                  <Text style={styles.resendButtonText}>Resend Code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPasswordOTPModal(false);
                  setOtpCode('');
                  setPendingPasswordChange('');
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#0c4309',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#0c4309',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  profileSection: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 30,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0c4309',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0c4309',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginBottom: 2,
  },
  phone: {
    fontSize: 16,
    color: '#666',
  },
  editIcon: {
    padding: 8,
  },
  editIconText: {
    fontSize: 16,
    color: '#0c4309',
    fontWeight: '500',
  },
  menuContainer: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: '#0c4309',
    marginLeft: 12,
    fontWeight: '400',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 16,
  },
  signOutItem: {
    padding: 16,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    color: '#dc3545',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  editModalContent: {
    backgroundColor: 'white',
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0c4309',
  },
  closeText: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  editForm: {
    marginBottom: 20,
  },
  editInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
    color: '#0c4309',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  editModalActions: {
    paddingTop: 10,
  },
  saveButton: {
    backgroundColor: '#0c4309',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    backgroundColor: 'white',
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
    color: '#0c4309',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  modalActions: {
    marginTop: 20,
  },
  modalSaveButton: {
    backgroundColor: '#0c4309',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalSaveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalCancelButton: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  modalCancelButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '500',
  },
  paymentMethodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodText: {
    fontSize: 16,
    color: '#0c4309',
    fontWeight: '500',
  },
  defaultLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  removePaymentButton: {
    padding: 8,
  },
  removePaymentText: {
    fontSize: 14,
    color: '#dc3545',
    fontWeight: '500',
  },
  addPaymentButton: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  addPaymentButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '500',
  },
  otpDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  resendButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#0c4309',
  },
  resendButtonDisabled: {
    opacity: 0.6,
  },
  resendButtonText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '500',
  },
});
