/**
 * Shown when the local database cannot open (#163). Rendered above the theme,
 * font and navigation providers, so it uses plain React Native with system
 * fonts and colors from the OS scheme only.
 */
import { Pressable, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function DatabaseErrorScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const dark = useColorScheme() === 'dark';
  const fg = dark ? '#fafafa' : '#0a0a0a';
  const muted = dark ? '#a1a1aa' : '#52525b';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#0a0a0a' : '#ffffff' }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 }}>
        <Text style={{ color: fg, fontSize: 22, fontWeight: '700' }}>Incline couldn&apos;t open your data</Text>
        <Text style={{ color: muted, fontSize: 15, lineHeight: 22 }}>
          Your workouts are stored on this phone. Try again first. If it keeps failing, restart the phone. Signed-in
          workouts that already synced come back after a reinstall; unsynced ones would be lost, so reinstall only as a
          last resort.
        </Text>
        <Text style={{ color: muted, fontSize: 12 }} selectable numberOfLines={3}>
          {error.message}
        </Text>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 12,
            minHeight: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: fg,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Text style={{ color: dark ? '#0a0a0a' : '#ffffff', fontSize: 16, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
