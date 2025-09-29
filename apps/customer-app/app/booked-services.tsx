import { View, Text, Modal, StyleSheet, Pressable, Image, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { RouteParams } from '../constants/routes';

export default function BookedServices() {
  const params = useLocalSearchParams();
  const showOverlay = params.showOverlay === 'true';
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [selectProModalVisible, setSelectProModalVisible] = useState(false);
  const navigate = (route: keyof RouteParams) => router.push(route as any);

  // Custom date picker state
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    if (showOverlay) {
      setOverlayVisible(true);
    }
  }, [showOverlay]);


  const closeOverlay = () => {
    setOverlayVisible(false);
  };

  // Generate date options
  const currentDate = new Date();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  
  // Flexible time slots (30-minute intervals from 8 AM to 8 PM)
  const timeSlots = [];
  for (let hour = 8; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const period = hour < 12 ? 'AM' : 'PM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const timeString = `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
      timeSlots.push(timeString);
    }
  }
  
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('9:00 AM');

  const isDateInPast = (day: number) => {
    const today = new Date();
    const checkDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    return checkDate < today && !isSameDay(checkDate, today);
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  const handleDateSelect = (day: number) => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    setSelectedDate(newDate);
  };

  const handleConfirm = () => {
    const finalDateTime = new Date(selectedDate);
    
    // Parse the selected time slot (e.g., "2:30 PM")
    const [time, period] = selectedTimeSlot.split(' ');
    const [hourStr, minuteStr] = time.split(':');
    let hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    
    // Convert to 24-hour format
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    finalDateTime.setHours(hour, minute, 0, 0);
    
    // Pass to database here (e.g., API call)
    
    // Example: sendToDatabase(finalDateTime);
    setPickerVisible(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#0c4309" />
      {/* Back Button */}
      <Pressable style={styles.backButton} onPress={() => router.push('/landing')}>
        <Image 
          source={require('../assets/icons/backButton.png')} 
          style={styles.backButtonIcon} 
        />
      </Pressable>
      
      {/* Main content */}
      <View style={styles.header}>
        <Text style={styles.title}> Booked Services</Text>
      </View>
      <View style={styles.GreenHeaderBar}>
        <View style={styles.todayBadge}>
          <Text style={styles.todayText}>Today</Text>
        </View>
      </View>
      
      {/* No Services Message */}
      <View style={styles.noServicesContainer}>
        <Pressable style={styles.selectProButton} onPress={() => setSelectProModalVisible(true)}>
          <Text style={styles.noServicesText}>No Services Booked</Text>
        </Pressable>
      </View>

      {/* Overlay Modal */}
      <Modal
        visible={overlayVisible}
        transparent
        animationType="fade"
        onRequestClose={closeOverlay}
        style={{ zIndex: 1000 }}
      >
        <View style={styles.overlayBackground}>
          <View style={styles.overlayPopup}>
            <View style={styles.popupHeader}>
              <Text style={styles.selectADateTitle}>Schedule Your Service</Text>
            </View>
            <View style={styles.scheduleOptions}>
              <View style={styles.popupActions}>
                <Pressable style={styles.primaryButton} onPress={closeOverlay}>
                  <Text style={styles.primaryButtonText}>ASAP</Text>
                  <Text style={styles.primaryButtonSubText}>Get a Helpr as soon as possible</Text>
                </Pressable>
              </View>
              
              {/* Divider with "or" */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              
              <View style={styles.popupActions}>
                <Pressable style={styles.secondaryButton} onPress={() => {
                  
                  setOverlayVisible(false); // Close overlay first
                  setTimeout(() => setPickerVisible(true), 100); // Then open date picker
                  
                }}>
                  <Text style={styles.secondaryButtonText} numberOfLines={2}>Select{'\n'}Date & Time</Text>
                </Pressable>
              </View>
            </View>
            
            {/* Back to Service Details Button */}
            <View style={styles.backToServiceContainer}>
              <Pressable 
                style={styles.backToServiceButton}
                onPress={() => {
                  setOverlayVisible(false);
                  router.back();
                }}
              >
                <Text style={styles.backToServiceText}>Back to Service Details</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Date Picker Modal */}
      <Modal
        visible={isPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setPickerVisible(false);
          setTimeout(() => setOverlayVisible(true), 100);
        }}
        style={{ zIndex: 10000 }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#FFF8E8', padding: 20, borderRadius: 20, width: '90%', maxHeight: '85%' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#0c4309', textAlign: 'center', marginBottom: 0, marginTop: 0}}>Select a Date</Text>
            
            {/* Month Navigation */}
            <View style={{ marginBottom: 0, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Pressable 
                  style={{
                    padding: 15,
                    backgroundColor: '#FFF8E8',
                    borderRadius: 25,
                    marginRight: 0,
                    minWidth: 45,
                    minHeight: 45,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                  onPress={() => {
                    const newDate = new Date(selectedDate);
                    newDate.setMonth(selectedDate.getMonth() - 1);
                    setSelectedDate(newDate);
                  }}
                >
                  <Text style={{ color: '#0c4309', fontSize: 24, fontWeight: 'bold' }}>‹</Text>
                </Pressable>
                <View style={styles.monthYearContainer}>
                  <Text style={{ 
                    fontSize: 18, 
                    fontWeight: 'bold', 
                    color: '#0c4309',
                    minWidth: 120,
                    textAlign: 'center',
                    marginTop: 3,
                  }}>
                    {months[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                  </Text>
                </View>
                <Pressable 
                  style={{
                    padding: 15,
                    backgroundColor: '#FFF8E8',
                    borderRadius: 25,
                    marginLeft: 0,
                    minWidth: 45,
                    minHeight: 45,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                  onPress={() => {
                    const newDate = new Date(selectedDate);
                    newDate.setMonth(selectedDate.getMonth() + 1);
                    setSelectedDate(newDate);
                  }}
                >
                  <Text style={{ color: '#0c4309', fontSize: 24, fontWeight: 'bold' }}>›</Text>
                </Pressable>
              </View>
            </View>

            {/* Day Selection */}
            <View style={{ marginBottom: 5 }}>
              <View style={styles.calendarContainer}>
                <View style={{ alignItems: 'flex-start', marginBottom: 0 }}>
                  {Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => (
                    <View key={weekIndex} style={{ flexDirection: 'row', marginBottom: 5 }}>
                      {days.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day) => {
                        const isPast = isDateInPast(day);
                        const isSelected = selectedDate.getDate() === day;
                        
                        return (
                          <Pressable
                            key={day}
                            style={{
                              width: 35,
                              height: 35,
                              justifyContent: 'center',
                              alignItems: 'center',
                              margin: 2,
                              backgroundColor: isSelected ? '#0c4309' : isPast ? '#f0f0f0' : '#E5DCC9',
                              borderRadius: 17.5,
                              opacity: isPast ? 0.5 : 1
                            }}
                            onPress={() => !isPast && handleDateSelect(day)}
                            disabled={isPast}
                          >
                            <Text style={{ 
                              color: isSelected ? 'white' : isPast ? '#999' : '#0c4309', 
                              fontSize: 16, 
                              fontWeight: 'bold' 
                            }}>
                              {day}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>  
            </View>

            {/* Time Selection */}
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.selectATimeTitle}>Select a Time</Text>
              <ScrollView style={{ height: 120 }} showsVerticalScrollIndicator={false}>
                {timeSlots.map((timeSlot) => (
                  <Pressable
                    key={timeSlot}
                    style={{
                      padding: 10,
                      marginVertical: 2,
                      backgroundColor: selectedTimeSlot === timeSlot ? '#0c4309' : '#E5DCC9',
                      borderRadius: 8,
                      alignItems: 'center'
                    }}
                    onPress={() => setSelectedTimeSlot(timeSlot)}
                  >
                    <Text style={{ 
                      color: selectedTimeSlot === timeSlot ? 'white' : '#0c4309', 
                      fontSize: 16,
                      fontWeight: selectedTimeSlot === timeSlot ? 'bold' : 'normal'
                    }}>
                      {timeSlot}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Selected Date/Time Display */}
            <View style={{ backgroundColor: '#E5DCC9', padding: 15, borderRadius: 10, marginBottom: 20 }}>
              <Text style={{ textAlign: 'center', color: '#0c4309', fontSize: 16, fontWeight: 'bold' }}>
                {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} at {selectedTimeSlot}
              </Text>
            </View>

            {/* Cancel and Confirm Buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable 
                onPress={() => {
                  setPickerVisible(false);
                  setTimeout(() => setOverlayVisible(true), 100);
                }} 
                style={{ backgroundColor: '#E5DCC9', padding: 15, borderRadius: 8, flex: 1, alignItems: 'center', marginRight: 10 }}
              >
                <Text style={{ color: '#0c4309', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              
              <Pressable 
                onPress={handleConfirm} 
                style={{ backgroundColor: '#0c4309', padding: 15, borderRadius: 8, flex: 1, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Select a Pro Modal */}
      <Modal
        visible={selectProModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectProModalVisible(false)}
      >
        <View style={styles.overlayBackground}>
          <View style={styles.selectProModal}>
            <Text style={styles.selectProTitle}>Select a Pro</Text>
            <View style={styles.DividerContainer1}>
              <View style={styles.DividerLine1} />
            </View>
            <Text style={styles.selectProMessage}>
              Workers are available to fill your request!{'\n'}Select a pro when you&apos;re ready.
            </Text>
            <Pressable 
              style={styles.selectProOkButton} 
              onPress={() => {
                setSelectProModalVisible(false);
                router.push('/selecthelpr');
              }}
            >
              <Text style={styles.selectProOkText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  todayBadge: {
    backgroundColor: '#FFF8E8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  todayText: {
    color: '#0c4309',
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
  pickerBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    width: '90%',
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 20,
  },
  dateSection: {
    marginBottom: 20,
  },
  dropdownRow: {
    marginBottom: 10,
  },
  dropdownItem: {
    padding: 10,
    marginHorizontal: 5,
    backgroundColor: '#E5DCC9',
    borderRadius: 8,
  },
  selectedItem: {
    backgroundColor: '#0c4309',
  },
  dropdownText: {
    color: '#0c4309',
    fontSize: 16,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dayItem: {
    width: 35,
    height: 35,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
    backgroundColor: '#E5DCC9',
    borderRadius: 17.5,
  },
  selectedDay: {
    backgroundColor: '#0c4309',
  },
  dayText: {
    color: '#0c4309',
    fontSize: 16,
  },
  timeSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 16,
    color: '#0c4309',
    marginBottom: 10,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeScroll: {
    height: 100,
  },
  timeItem: {
    padding: 10,
    marginVertical: 2,
    backgroundColor: '#E5DCC9',
    borderRadius: 8,
    alignItems: 'center',
  },
  selectedTime: {
    backgroundColor: '#0c4309',
  },
  timeText: {
    color: '#0c4309',
    fontSize: 16,
  },
  colon: {
    fontSize: 24,
    color: '#0c4309',
    marginHorizontal: 10,
  },
  pickerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#E5DCC9',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#0c4309',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectProButton: {
    // No additional styling needed, inherits from container
  },
  selectProModal: {
    width: '75%',
    backgroundColor: '#FFF8E8',
    borderRadius: 30,
    paddingTop: 10,
    paddingBottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  DividerContainer1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
    marginBottom: 10,
    width: '100%', // Ensure full width
  },
  DividerLine1: {
    flex: 1, // Take up available space instead of fixed width
    height: 2,
    backgroundColor: '#bfbebcff',
    maxWidth: 350, // Optional: limit max width for better appearance
  },
  selectProTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  selectProMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    padding: 10,
  },
  selectProOkButton: {
    backgroundColor: '#0c4309',   
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 80,
    minWidth: 80,
  },
  selectProOkText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  backToServiceContainer: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  backToServiceButton: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backToServiceText: {
    color: '#0c4309',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
