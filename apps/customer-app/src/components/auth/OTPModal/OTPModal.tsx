import React from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useOTPModalStyles } from './styles';
import { OTPModalProps } from './types';

export const OTPModal: React.FC<OTPModalProps> = ({
  visible,
  email,
  otpCode,
  onChangeOTP,
  onVerify,
  onResend,
  onClose,
  loading = false,
  title = 'Verify Your Email',
  subtitle,
}) => {
  const styles = useOTPModalStyles();
  const isValidCode = otpCode.length === 6;
  const displaySubtitle = subtitle || `We sent a 6-digit code to ${email}`;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{displaySubtitle}</Text>

          <TextInput
            style={styles.otpInput}
            placeholder="Enter 6-digit code"
            value={otpCode}
            onChangeText={onChangeOTP}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus={true}
            placeholderTextColor={styles.placeholderColor}
          />

          <TouchableOpacity
            style={[styles.verifyButton, isValidCode ? styles.buttonActive : styles.buttonInactive]}
            onPress={onVerify}
            disabled={!isValidCode || loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify Email</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.resendButton} onPress={onResend}>
            <Text style={styles.resendButtonText}>Didn't receive code? Resend</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default OTPModal;
