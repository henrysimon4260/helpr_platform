import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { styles } from './styles';
import { PaymentSummaryModalProps } from './types';

const formatPrice = (value: number, showCents = true): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch {
    return showCents ? `$${safeValue.toFixed(2)}` : `$${Math.round(safeValue)}`;
  }
};

export const PaymentSummaryModal: React.FC<PaymentSummaryModalProps> = ({
  visible,
  onClose,
  onConfirm,
  provider,
  price,
  serviceName,
  scheduledDateTime,
  savedPaymentMethods,
  activePaymentMethodId,
  onSelectPaymentMethod,
  onAddPaymentMethod,
  loading = false,
  confirming = false,
  showModal,
}) => {
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      animation.setValue(0);
      Animated.timing(animation, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, animation]);

  const handleClose = () => {
    if (confirming) return;
    Animated.timing(animation, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onClose();
      }
    });
  };

  const handleConfirm = () => {
    if (!activePaymentMethodId) {
      showModal({
        title: 'Select Payment Method',
        message: 'Please select or add a payment method to continue.',
      });
      return;
    }
    onConfirm();
  };

  const getCardBrandIcon = (brand?: string) => {
    const brandLower = brand?.toLowerCase();
    switch (brandLower) {
      case 'visa':
        return require('../../../assets/icons/payment-method-icons/visa.png');
      case 'mastercard':
        return require('../../../assets/icons/payment-method-icons/mastercard.png');
      case 'discover':
        return require('../../../assets/icons/payment-method-icons/discover.png');
      case 'american express':
      case 'amex':
        return require('../../../assets/icons/payment-method-icons/amex.png');
      default:
        return require('../../../assets/icons/PMIcon.png'); // fallback to generic icon
    }
  };

  // Fee calculations
  const basePrice = price;
  const processingFee = Math.round(price * 0.03 * 100) / 100; // 3% payment processing
  const platformFee = Math.round(price * 0.01 * 100) / 100; // 1% platform fee
  const total = Math.round((basePrice + processingFee + platformFee) * 100) / 100;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: animation }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={0}
        >
          <Animated.View
            style={[
              styles.content,
              {
                transform: [
                  {
                    translateY: animation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Confirm Booking</Text>
              <Pressable style={styles.closeButton} onPress={handleClose} disabled={confirming}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0c4309" />
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={styles.scrollContent}
              >
                {/* Provider Info */}
                {provider && (
                  <View style={styles.providerSection}>
                    <View style={styles.providerRow}>
                      <View style={styles.providerAvatar}>
                        {provider.profileImageUrl ? (
                          <Image
                            source={{ uri: provider.profileImageUrl }}
                            style={styles.providerAvatarImage}
                          />
                        ) : (
                          <Text style={styles.providerInitials}>{provider.initials}</Text>
                        )}
                      </View>
                      <View style={styles.providerInfo}>
                        <Text style={styles.providerName}>{provider.fullName}</Text>
                        {provider.rating ? (
                          <Text style={styles.providerRating}>⭐️ {provider.rating.toFixed(1)}</Text>
                        ) : (
                          <Text style={styles.providerRating}>New to Helpr</Text>
                        )}
                      </View>
                    </View>
                    {scheduledDateTime && (
                      <View style={styles.scheduledTimeRow}>
                        <Text style={styles.scheduledTimeText}>{scheduledDateTime}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Receipt Breakdown */}
                <View style={styles.summarySection}>
                  <View style={styles.receiptHeader}>
                    <Text style={styles.receiptTitle}>Summary</Text>
                  </View>
                  
                  {serviceName && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Service</Text>
                      <Text style={styles.summaryValue}>{serviceName}</Text>
                    </View>
                  )}
                  
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Helpr&apos;s Bid</Text>
                    <Text style={styles.summaryValue}>{formatPrice(basePrice)}</Text>
                  </View>
                  
                  <View style={styles.dividerLine} />
                  
                  <View style={styles.summaryRow}>
                    <Text style={styles.feeLabel}>Payment Processing (3%)</Text>
                    <Text style={styles.feeValue}>{formatPrice(processingFee)}</Text>
                  </View>
                  
                  <View style={styles.summaryRow}>
                    <Text style={styles.feeLabel}>Platform Fee (1%)</Text>
                    <Text style={styles.feeValue}>{formatPrice(platformFee)}</Text>
                  </View>
                  
                  <View style={[styles.summaryRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{formatPrice(total)}</Text>
                  </View>
                </View>

                {/* Payment Method Selection */}
                <View style={styles.paymentSection}>
                  <Text style={styles.paymentSectionTitle}>Payment Method</Text>

                  {savedPaymentMethods.length === 0 ? (
                    <>
                      <Text style={styles.noPaymentText}>No payment method saved</Text>
                      <Pressable style={styles.addPaymentButton} onPress={onAddPaymentMethod}>
                        <Text style={styles.addPaymentButtonText}>+ Add Payment Method</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      {savedPaymentMethods.map((method) => {
                        const isSelected = method.id === activePaymentMethodId;
                        return (
                          <Pressable
                            key={method.id}
                            style={[
                              styles.paymentMethodItem,
                              isSelected && styles.paymentMethodItemSelected,
                            ]}
                            onPress={() => onSelectPaymentMethod(method.id)}
                          >
                            <View style={styles.paymentMethodInfo}>
                              <View style={styles.paymentMethodIconWrapper}>
                                <Image
                                  source={getCardBrandIcon(method.brand)}
                                  style={styles.paymentMethodIcon}
                                />
                              </View>
                              <View>
                                <Text style={styles.paymentMethodBrand}>{method.brand}</Text>
                                <Text style={styles.paymentMethodDetails}>
                                  •••• {method.last4} · Expires {method.expiryMonth}/{method.expiryYear}
                                </Text>
                              </View>
                            </View>
                            {isSelected && (
                              <Pressable style={styles.editPaymentButton} onPress={onAddPaymentMethod}>
                                <Text style={styles.editPaymentButtonText}>edit</Text>
                              </Pressable>
                            )}
                          </Pressable>
                        );
                      })}
                      <Pressable style={styles.addPaymentButton} onPress={onAddPaymentMethod}>
                        <Text style={styles.addPaymentButtonText}>+ Add New Card</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                {/* Confirm Button */}
                <Pressable
                  style={[
                    styles.confirmButton,
                    (!activePaymentMethodId || confirming) && styles.confirmButtonDisabled,
                  ]}
                  onPress={handleConfirm}
                  disabled={!activePaymentMethodId || confirming}
                >
                  {confirming ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmButtonText}>
                      Confirm & Pay {formatPrice(total)}
                    </Text>
                  )}
                </Pressable>

                <Pressable style={styles.cancelButton} onPress={handleClose} disabled={confirming}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </ScrollView>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};
