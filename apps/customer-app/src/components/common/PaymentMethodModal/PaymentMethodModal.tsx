import { CardField } from '@stripe/stripe-react-native';
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

import { cardFieldStyle, styles } from './styles';
import { PaymentMethodModalProps } from './types';

export const PaymentMethodModal: React.FC<PaymentMethodModalProps> = ({
  visible,
  onClose,
  savedPaymentMethods,
  activePaymentMethodId,
  onSelectPaymentMethod,
  showAddForm,
  setShowAddForm,
  cardComplete,
  setCardComplete,
  setCardDetailsSnapshot,
  onSavePaymentMethod,
  loading,
  saving = false,
  showModal,
}) => {
  const animation = useRef(new Animated.Value(0)).current;
  const [showDefaultPrompt, setShowDefaultPrompt] = React.useState(false);

  useEffect(() => {
    if (visible) {
      animation.setValue(0);
      Animated.timing(animation, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      // Reset animation when modal becomes invisible
      animation.setValue(0);
    }
  }, [visible, animation]);

  const handleClose = () => {
    // Immediately call onClose to ensure modal closes even if animation is interrupted
    onClose();
    Animated.timing(animation, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
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
              <Text style={styles.title}>
                {showAddForm || savedPaymentMethods.length === 0 ? 'Add Payment Method' : 'Payment Methods'}
              </Text>
              <Pressable style={styles.closeButton} onPress={handleClose}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#0c4309" />
              </View>
            ) : showAddForm || savedPaymentMethods.length === 0 ? (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
                <Pressable
                  style={styles.plaidOption}
                  onPress={() =>
                    showModal({
                      title: 'Coming Soon',
                      message: 'Plaid/ACH integration will be available soon! Pay with lower fees.',
                    })
                  }
                >
                  <View style={styles.plaidContent}>
                    <Image source={require('../../../assets/icons/PMIcon.png')} style={styles.plaidLogo} resizeMode="contain" />
                    <View style={styles.plaidTextContainer}>
                      <Text style={styles.plaidTitle}>Bank Transfer (ACH)</Text>
                      <Text style={styles.plaidSubtitle}>Save up to 2.9%</Text>
                    </View>
                    <Text style={styles.plaidArrow}>›</Text>
                  </View>
                </Pressable>

                <View style={styles.cardFieldContainer}>
                  <CardField
                    postalCodeEnabled
                    placeholders={{ number: '4242 4242 4242 4242' }}
                    cardStyle={cardFieldStyle}
                    style={styles.cardField}
                    onCardChange={(cardDetails) => {
                      setCardComplete(cardDetails.complete);
                      setCardDetailsSnapshot({
                        brand: cardDetails.brand ?? null,
                        last4: cardDetails.last4 ?? null,
                        expiryMonth: cardDetails.expiryMonth ?? null,
                        expiryYear: cardDetails.expiryYear ?? null,
                      });
                    }}
                  />
                </View>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.saveButton, (!cardComplete || saving) && styles.saveButtonDisabled]}
                    onPress={() => {
                      // If this is the first payment method, save it as default without asking
                      if (savedPaymentMethods.length === 0) {
                        onSavePaymentMethod(true);
                      } else {
                        // If there are existing methods, show the default prompt
                        setShowDefaultPrompt(true);
                      }
                    }}
                    disabled={!cardComplete || saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.saveButtonText, !cardComplete && styles.saveButtonTextDisabled]}>
                        Save Payment Method
                      </Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              <>
                <View style={styles.methodsList}>
                  {savedPaymentMethods.map((method) => {
                    const isSelected = method.id === activePaymentMethodId;
                    return (
                      <Pressable
                        key={method.id}
                        style={[styles.methodItem, isSelected && styles.methodItemSelected]}
                        onPress={() => onSelectPaymentMethod(method.id)}
                      >
                        <View style={styles.methodInfo}>
                          <View style={styles.methodIconWrapper}>
                            <Image source={getCardBrandIcon(method.brand)} style={styles.methodIcon} resizeMode="contain" />
                          </View>
                          <View>
                            <View style={styles.methodBrandRow}>
                              <Text style={styles.methodBrand}>{method.brand}</Text>
                              {method.isDefault && (
                                <View style={styles.defaultBadge}>
                                  <Text style={styles.defaultBadgeText}>Default</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.methodDetails}>
                              •••• {method.last4} · Expires {method.expiryMonth}/{method.expiryYear}
                            </Text>
                          </View>
                        </View>
                        {isSelected && (
                          <Text style={styles.checkmarkIcon}>✓</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  style={styles.addNewButton}
                  onPress={() => {
                    setShowAddForm(true);
                    setCardComplete(false);
                    setCardDetailsSnapshot(null);
                  }}
                >
                  <Text style={styles.addNewButtonText}>Add new payment method</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Default Payment Method Prompt Modal */}
      <Modal visible={showDefaultPrompt} transparent animationType="fade" onRequestClose={() => setShowDefaultPrompt(false)}>
        <View style={styles.overlayBackground}>
          <View style={styles.defaultPromptModal}>
            <Text style={styles.defaultPromptTitle}>Make this your default payment method?</Text>
            <View style={styles.defaultPromptDivider} />
            <Text style={styles.defaultPromptMessage}>
              Set this card as your default payment method for future bookings.
            </Text>
            <View style={styles.defaultPromptActions}>
              <Pressable
                style={styles.defaultPromptButton}
                onPress={() => {
                  setShowDefaultPrompt(false);
                  onSavePaymentMethod(false);
                }}
              >
                <Text style={styles.defaultPromptButtonText}>No, thanks</Text>
              </Pressable>
              <Pressable
                style={[styles.defaultPromptButton, styles.defaultPromptPrimaryButton]}
                onPress={() => {
                  setShowDefaultPrompt(false);
                  onSavePaymentMethod(true);
                }}
              >
                <Text style={[styles.defaultPromptButtonText, styles.defaultPromptPrimaryButtonText]}>Yes, make it default</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

export { };

