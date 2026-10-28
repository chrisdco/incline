import '@/global.css';

import { useEffect } from 'react';
import { Text as RNText, View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@expo/ui/community/bottom-sheet';
import { ClerkProvider } from '@clerk/expo';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';

import { cn } from '@/lib/cn';
import { queryClient } from '@/lib/query-client';
import { themeHex } from '@/lib/theme';
import { CLERK_KEY_PROBLEM, CLERK_PUBLISHABLE_KEY, isDevAuthBypassEnabled } from '@/lib/env';
import { secureTokenCache } from '@/auth/secure-store';
import { ToastProvider } from '@/components/ui/toast';
import { UpdateBootstrap } from '@/features/updates';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { useDatabaseReady } from '@/hooks/use-database';
import { useNotificationRouting } from '@/hooks/use-notification-routing';
import { useMonthlyRecapSync } from '@/hooks/use-monthly-recap-sync';
import { useNudgeSync } from '@/hooks/use-nudge-sync';
import { useCatalogPrefetch } from '@/hooks/use-catalog-prefetch';
import { useWeeklyDigestSync } from '@/hooks/use-weekly-digest-sync';
import { useWidgetRefresh } from '@/hooks/use-widget-refresh';
import { useWorkoutReminderSync } from '@/hooks/use-workout-reminder-sync';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { useSettings } from '@/store/settings-store';

SplashScreen.preventAutoHideAsync();

function NotificationBootstrap() {
  useNotificationRouting();
  useWorkoutReminderSync();
  useWeeklyDigestSync();
  useMonthlyRecapSync();
  useNudgeSync();
  useCatalogPrefetch();
  return null;
}

function WidgetBootstrap() {
  useWidgetRefresh();
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
                  <WidgetBootstrap />
                  <UpdateBootstrap />
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
                  {/* Share cards stay pushed (not modal): view-shot cannot
                      capture inside native modals on Android (separate
                      window). The in-screen header keeps the sheet feel. */}
                  <Stack.Screen
                    name="share/[id]"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: navBackground },
                    }}
                  />
                  <Stack.Screen
                    name="share/week"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: navBackground },
                    }}
                  />
                  <Stack.Screen
                    name="share/month"
                    options={{
                      headerShown: false,
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
 * Shown instead of crashing when the build's public config is unusable.
 * Plain RN only: fonts, theme and providers may not be up yet.
 */
function ConfigErrorScreen({ problem }: { problem: string }) {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#1a1a1a' }}>
      <RNText style={{ color: '#fafafa', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
        This build is misconfigured
      </RNText>
      <RNText style={{ color: '#a1a1aa', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
        {problem}. Install a newer build.
      </RNText>
    </View>
  );
}

/**
 * Dev auth bypass (`__DEV__` + `EXPO_PUBLIC_DEV_BYPASS_AUTH=1`) skips the
 * Clerk provider entirely so no Clerk key or sign-in is needed for UI work.
 * Production bundles always take the Clerk path (see `isDevAuthBypassEnabled`).
 */
export default function RootLayout() {
  // Local SQLite reads (src/lib/query-client.ts) — invalidated by table.
  const shell = (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
  if (isDevAuthBypassEnabled()) return shell;
  // A bad key would throw inside ClerkProvider and close the app on launch.
  if (CLERK_KEY_PROBLEM) return <ConfigErrorScreen problem={`Sign-in key ${CLERK_KEY_PROBLEM}`} />;
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      tokenCache={secureTokenCache}>
      {shell}
    </ClerkProvider>
  );
}
