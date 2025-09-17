import { View, Text, Modal, StyleSheet, Pressable, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { RouteParams } from '../constants/routes';

export default function BookedServices() {
  const params = useLocalSearchParams();
  const showOverlay = params.showOverlay === 'true';
  const [overlayVisible, setOverlayVisible] = useState(false);
  const navigate = (route: keyof RouteParams) => router.push(route as any);

  useEffect(() => {
    if (showOverlay) {
      setOverlayVisible(true);
    }
  }, [showOverlay]);

  const closeOverlay = () => {
    setOverlayVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* Main content of booked services page */}
      <View style={styles.content}>
        <Pressable style={styles.backButton} onPress={() => router.navigate('landing')}>
                    <Image 
                      source={require('../assets/icons/backButton.png')} 
                      style={styles.backButtonIcon} 
        />
        </Pressable>
        <Text style={styles.title}>Booked Services</Text>
        <Text style={styles.subtitle}>Your upcoming services will appear here.</Text>
        {/* Add more content as needed */}
      </View>

      {/* Customizable Overlay Modal */}
      <Modal
        visible={overlayVisible}
        transparent
        animationType="fade"
        onRequestClose={closeOverlay}
      >
        <View style={styles.overlayBackground}>
          <View style={styles.overlayPopup}>
            {/* Customizable Header */}
            <View style={styles.popupHeader}>
              <Image
                source={require('../assets/icons/ChooseHelprIcon.png')} // Replace with appropriate icon
                style={styles.popupIcon}
              />
              <Text style={styles.popupTitle}>Booking Confirmed!</Text>
            </View>

            {/* Customizable Message */}
            <Text style={styles.popupMessage}>
              Your Helpr is on the way. We'll send you updates as they approach.
            </Text>

            {/* Customizable Details */}
            <View style={styles.popupDetails}>
              <Text style={styles.detailText}>Estimated arrival: 15-20 minutes</Text>
              <Text style={styles.detailText}>Service: Moving Assistance</Text>
            </View>

            {/* Customizable Actions */}
            <View style={styles.popupActions}>
              <Pressable style={styles.primaryButton} onPress={closeOverlay}>
                <Text style={styles.primaryButtonText}>Got it!</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => {
                closeOverlay();
                router.push('/customer-service-chat');
              }}>
                <Text style={styles.secondaryButtonText}>Contact Support</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff0cfff',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0c4309',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#49454F',
    textAlign: 'center',
  },
  overlayBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Dimmed background
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayPopup: {
    width: '85%',
    backgroundColor: '#FFF8E8', // Matching app's background
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    // Android shadow
    elevation: 10,
  },
  popupHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  popupIcon: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0c4309',
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 16,
    color: '#49454F',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  popupDetails: {
    width: '100%',
    backgroundColor: '#E5DCC9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  detailText: {
    fontSize: 14,
    color: '#0c4309',
    marginBottom: 8,
  },
  popupActions: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#0c4309',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    position: 'absolute',
    top: 85,
    left: 30,
    zIndex: 10,
  },
  backButtonIcon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  }
});
