import { Stack } from 'expo-router';

export default function ServicesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#FFF8E8' },
      }}
    >
      <Stack.Screen name="moving" />
      <Stack.Screen name="cleaning" />
      <Stack.Screen name="furniture-assembly" />
      <Stack.Screen name="home-improvement" />
      <Stack.Screen name="wall-mounting" />
      <Stack.Screen name="custom-service" />
    </Stack>
  );
}
