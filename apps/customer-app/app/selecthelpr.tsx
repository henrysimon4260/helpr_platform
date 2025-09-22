import { View, Text, Modal, StyleSheet, Pressable, Image, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { RouteParams } from '../constants/routes';

export default function BookedServices() {
  const params = useLocalSearchParams();
  const navigate = (route: keyof RouteParams) => router.push(route as any);

  

  return (
    <View style={styles.container}>
      <StatusBar style='dark' backgroundColor="#0c4309" />
      {/* Back Button */}
      <Pressable style={styles.backButton} onPress={() => router.push('/booked-services')}>
        <Image 
          source={require('../assets/icons/backButton.png')} 
          style={styles.backButtonIcon} 
        />
      </Pressable>
      
      {/* Main content */}
      <View style={styles.header}>
        <Text style={styles.title}>Select a Helpr</Text>
      </View>
      <View style={styles.GreenHeaderBar}>
          <Text style={styles.AvailableProsText}>Available Pros</Text>
      </View> 
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E5DCC9',
  },
  header: {
    backgroundColor: '#FFF8E8',
    padding: 15,
    paddingTop: 70, // Account for status bar
    justifyContent: 'center',
    alignItems: 'center',
  },
  noServicesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noServicesText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666666',
    textAlign: 'center',
    paddingBottom: 100,
  },
  scrollViewContent: {
    height: '100%',
    paddingBottom: 60, // Account for footer
    color: '#0c4309',
  },
  footer: {
    backgroundColor: '#FFF8E8',
    padding: 15,
    paddingBottom: 60, // Account for status bar
    justifyContent: 'center',
    alignItems: 'center',
    height: 100,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0c4309',
    paddingTop: 10,
    
  },
  GreenHeaderBar:{
    backgroundColor: '#0c4309',
    height:30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  AvailableProsText: {
    color: '#ffffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  WhiteHeaderText:{
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
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
    justifyContent: 'center', // Center content vertically within popup
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
    justifyContent: 'center', // Center header content
    marginBottom: 16,
    width: '100%', // Ensure full width for centering
  },
  popupIcon: {
    width: 48,
    height: 48,
    marginBottom: 5,
  },
  selectADateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0c4309',
    textAlign: 'center',
  },
  selectATimeTitle: {
    fontSize: 16,
    marginBottom: 10,
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
  monthYearContainer: {
    width: 150,
  },
  calendarContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    // borderColor: 'red',
    // borderWidth: 1,
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
  scheduleOptions:{
    flexDirection: 'row',
    justifyContent: 'center', // Center the entire button group
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 10, // Add some padding for better spacing
  },
  popupActions: {
    width: '45%', // Adjust width for better centering
    marginHorizontal: 5, // Add small margin between buttons
  },
  dividerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#0c4309',
    width: 20,
    marginVertical: 5,
  },
  orText: {
    fontSize: 14,
    color: '#0c4309',
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 14, // Slightly increased for more rounded look
    height: 114, // Increased by 4px for taller buttons
    paddingVertical: 0, // Remove vertical padding since height is fixed
    paddingHorizontal: 16, // Reduced by 4px to make buttons appear wider
    alignItems: 'center',
    justifyContent: 'center', // Center text vertically
    width: '100%', // Fill container width
  },
  primaryButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  primaryButtonSubText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 14, // Slightly increased for more rounded look
    height: 114, // Increased by 4px for taller buttons
    paddingVertical: 0, // Remove vertical padding
    paddingHorizontal: 14, // Reduced by 4px to make buttons appear wider
    alignItems: 'center',
    justifyContent: 'center', // Center text vertically
    width: '100%', // Fill container width
  },
  secondaryButtonText: {
    color: '#0c4309',
    fontSize: 14, // Reduced from 16 to better fit the button
    fontWeight: '600',
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 58, // Moved up to align with header text
    left: 30,
    zIndex: 10,
  },
  backButtonIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
});
