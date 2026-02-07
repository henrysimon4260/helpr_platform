import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#FFF8E8' },
      }}
    >
      <Stack.Screen name="login" options={{ animation: 'none' }} />
      <Stack.Screen name="signup" options={{ animation: 'none' }} />
    </Stack>
  );
}
 