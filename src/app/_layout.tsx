import { Stack } from 'expo-router';
import { ToastProvider } from '../lib/toast';

export default function RootLayout() {
  return (
    <ToastProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="otp" />
        <Stack.Screen name="home" />
        <Stack.Screen name="add-family-member" />
        <Stack.Screen name="add-vehicle" options={{ headerShown: true, title: 'Add Vehicle' }} />
      </Stack>
    </ToastProvider>
  );
}
