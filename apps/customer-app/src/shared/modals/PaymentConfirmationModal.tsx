import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type PaymentConfirmationModalProps = {
  visible: boolean;
  serviceId: string;
  serviceName: string;
  price: string;
  onClose: () => void;
  onPaymentSuccess: () => void;
};

const PaymentConfirmationModal: React.FC<PaymentConfirmationModalProps> = ({
  visible,
  serviceName,
  price,
  onClose,
  onPaymentSuccess,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Confirm Payment</Text>
          <Text style={styles.subtitle}>{serviceName}</Text>
          <Text style={styles.amount}>{price}</Text>
          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={[styles.buttonText, styles.cancelText]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.confirmButton]} onPress={onPaymentSuccess}>
              <Text style={styles.buttonText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: '#FFF8E8',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#615748',
    textAlign: 'center',
  },
  amount: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '800',
    color: '#0c4309',
    textAlign: 'center',
  },
  buttonRow: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#E5DCC9',
  },
  confirmButton: {
    backgroundColor: '#0c4309',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelText: {
    color: '#0c4309',
  },
});

export default PaymentConfirmationModal;
