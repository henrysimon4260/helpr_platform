import { Stack } from 'expo-router';

export default function BookingFlowLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#FFF8E8' },
      }}
    >
      <Stack.Screen name="booked-services" />
      <Stack.Screen name="past-services" />
      <Stack.Screen name="select-helpr" />
      <Stack.Screen name="service-details" />
    </Stack>
  );
}

