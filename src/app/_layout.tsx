import '@/global.css';

import { useEffect } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@expo/ui/community/bottom-sheet';
import { ClerkProvider } from '@clerk/expo';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';

import { cn } from '@/lib/cn';
import { themeHex } from '@/lib/theme';
import { CLERK_PUBLISHABLE_KEY, isDevAuthBypassEnabled } from '@/lib/env';
import { secureTokenCache } from '@/auth/secure-store';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { useDatabaseReady } from '@/hooks/use-database';
import { useNotificationRouting } from '@/hooks/use-notification-routing';
import { useWeeklyDigestSync } from '@/hooks/use-weekly-digest-sync';
import { useWorkoutReminderSync } from '@/hooks/use-workout-reminder-sync';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { useSettings } from '@/store/settings-store';

SplashScreen.preventAutoHideAsync();

function NotificationBootstrap() {
  useNotificationRouting();
  useWorkoutReminderSync();
  useWeeklyDigestSync();
  return null;
}

function AppShell() {
  const [fontsLoaded] = useFonts({
    Geist: Geist_400Regular,
    'Geist-Medium': Geist_500Medium,
    'Geist-SemiBold': Geist_600SemiBold,
    'Geist-Bold': Geist_700Bold,
  });
  const dbReady = useDatabaseReady();
  const scheme = useAppColorScheme();
  const accentTheme = useSettings((s) => s.accentTheme);
  // Paint the OS window + nav containers with the themed background so push /
  // pop gestures never reveal a white flash underneath. Matches --background.
  // (Amber pattern: bridge the palette into the nav theme — the navigator
  // paints every screen container with `background` before JS mounts, and
  // SystemUI covers the root view/overscroll behind routes.)
  const palette = themeHex(scheme, accentTheme);
  const navBackground = palette.background;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(navBackground).catch(() => {});
  }, [navBackground]);

  useEffect(() => {
    if (fontsLoaded && dbReady) SplashScreen.hideAsync();
  }, [fontsLoaded, dbReady]);

  if (!fontsLoaded || !dbReady) return null;

  const isDark = scheme === 'dark';
  const baseNavTheme = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseNavTheme,
    colors: {
      ...baseNavTheme.colors,
      background: navBackground,
      card: navBackground,
      text: palette.foreground,
      border: palette.border,
      primary: palette.primary,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <ErrorBoundary>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <GestureHandlerRootView style={{ flex: 1 }}>
          <BottomSheetModalProvider>
            <View className={cn('flex-1', isDark && 'dark', `theme-${accentTheme}`)}>
                <ToastProvider>
                  <NotificationBootstrap />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: navBackground },
                    }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(onboarding)" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(app)" />
                  <Stack.Screen name="exercise/[id]" options={{ headerShown: true, title: 'Exercise' }} />
                  <Stack.Screen name="workout/[id]" options={{ headerShown: true, title: 'Workout' }} />
                  <Stack.Screen name="session/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="session/reorder/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="pick-exercise" options={{ headerShown: false }} />
                  <Stack.Screen name="summary/[id]" options={{ headerShown: false }} />
                  {/* Share cards as formSheets (Amber convention): grabber +
                      themed container so the sheet never flashes the default
                      background on push. Android falls back to modal. */}
                  <Stack.Screen
                    name="share/[id]"
                    options={{
                      headerShown: false,
                      presentation: 'formSheet',
                      sheetGrabberVisible: true,
                      contentStyle: { backgroundColor: navBackground },
                    }}
                  />
                  <Stack.Screen
                    name="share/week"
                    options={{
                      headerShown: false,
                      presentation: 'formSheet',
                      sheetGrabberVisible: true,
                      contentStyle: { backgroundColor: navBackground },
                    }}
                  />
                  <Stack.Screen
                    name="share/month"
                    options={{
                      headerShown: false,
                      presentation: 'formSheet',
                      sheetGrabberVisible: true,
                      contentStyle: { backgroundColor: navBackground },
                    }}
                  />
                  <Stack.Screen name="edit-workout/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="+not-found" options={{ title: 'Not Found' }} />
                </Stack>
              </ToastProvider>
            </View>
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

/**
 * Dev auth bypass (`__DEV__` + `EXPO_PUBLIC_DEV_BYPASS_AUTH=1`) skips the
 * Clerk provider entirely so no Clerk key or sign-in is needed for UI work.
 * Production bundles always take the Clerk path (see `isDevAuthBypassEnabled`).
 */
export default function RootLayout() {
  if (isDevAuthBypassEnabled()) return <AppShell />;
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      tokenCache={secureTokenCache}>
      <AppShell />
    </ClerkProvider>
  );
}
