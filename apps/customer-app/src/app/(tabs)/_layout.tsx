import { Stack } from 'expo-router';

export default function TabsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#FFF8E8' },
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="moving" />
      <Stack.Screen name="cleaning" />
      <Stack.Screen name="furniture-assembly" />
      <Stack.Screen name="home-improvement" />
      <Stack.Screen name="wall-mounting" />
      <Stack.Screen name="customService" />
      <Stack.Screen name="booked-services" />
      <Stack.Screen name="past-services" />
      <Stack.Screen name="account" />
      <Stack.Screen name="selecthelpr" />
      <Stack.Screen name="ServiceDetails" />
      <Stack.Screen name="customer-service-chat" />
    </Stack>
  );
}
