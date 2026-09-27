import { Stack } from 'expo-router';
import { ToastProvider } from '../lib/toast';
import { ConfirmProvider } from '../lib/confirmModal';

export default function RootLayout() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="otp" />
          <Stack.Screen name="home" />
          <Stack.Screen name="add-family-member" />
          <Stack.Screen name="add-vehicle" options={{ headerShown: true, title: 'Add Vehicle' }} />
          <Stack.Screen name="map" />
        </Stack>
      </ConfirmProvider>
    </ToastProvider>
  );
}
