import { Stack } from 'expo-router';

import { CloudSyncProvider } from '@/components/common/cloud-sync-provider';
import { themeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { useSettings } from '@/store/settings-store';

/** App group: tabs at the root, settings pushed on top (hides the tab bar). */
export default function AppLayout() {
  const scheme = useAppColorScheme();
  const accentTheme = useSettings((s) => s.accentTheme);
  return (
    <CloudSyncProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themeHex(scheme, accentTheme).background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="exercises" options={{ headerShown: true, title: 'Exercises' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="export" options={{ headerShown: false }} />
        <Stack.Screen name="template/[id]" options={{ headerShown: true, title: 'Routine' }} />
        <Stack.Screen name="program/[id]" options={{ headerShown: true, title: 'Program' }} />
      <Stack.Screen name="program/edit/[id]" options={{ headerShown: true, title: 'Edit program' }} />
        <Stack.Screen name="bodyweight" options={{ headerShown: true, title: 'Measurements' }} />
        <Stack.Screen name="calendar" options={{ headerShown: false }} />
        <Stack.Screen name="calculator" options={{ headerShown: false }} />
        <Stack.Screen name="plate-calculator" options={{ headerShown: false }} />
        <Stack.Screen name="muscle-distribution" options={{ headerShown: false }} />
        <Stack.Screen name="progress-photos" options={{ headerShown: false }} />
        <Stack.Screen name="deload" options={{ headerShown: false }} />
        <Stack.Screen name="program-adjust" options={{ headerShown: false }} />
        <Stack.Screen name="milestones" options={{ headerShown: false }} />
        <Stack.Screen name="report/week" options={{ headerShown: false }} />
        <Stack.Screen name="report/month" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="day/[ms]" options={{ headerShown: false }} />
      </Stack>
    </CloudSyncProvider>
  );
}
