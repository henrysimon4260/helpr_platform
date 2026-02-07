import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#FFF8E8' },
      }}
    >
      <Stack.Screen name="landing" options={{ animation: 'none' }} />
      <Stack.Screen name="account" />
      <Stack.Screen name="customer-service-chat" />
    </Stack>
  );
}

