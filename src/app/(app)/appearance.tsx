import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Moon, Smartphone, Sun } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Chip } from '@/components/common/chip';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { useSettings } from '@/store/settings-store';
import { ACCENT_THEMES, ACCENT_THEME_LIST, CLASSIC_ACCENTS, isAuroraAccent } from '@/lib/accent-themes';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { cn } from '@/lib/cn';
import { NATIVE_NEUTRALS } from '@/styles/tokens';
import { motionControl } from '@/styles/motion';

/** Mode, skin and accent, split out of Settings. */
export default function AppearanceScreen() {
  const { themeMode, accentTheme, lastClassicAccent, setThemeMode, setAccentTheme, applyThemePreset } = useSettings();
  const scheme = useAppColorScheme();
  const selectedAccent = ACCENT_THEME_LIST.find((t) => t.id === accentTheme) ?? ACCENT_THEME_LIST[0];
  const auroraActive = isAuroraAccent(accentTheme);

  const presets = [
    { id: 'classic', label: 'Classic', hint: 'Clean base, any accent', swatch: NATIVE_NEUTRALS[scheme].background, ring: NATIVE_NEUTRALS[scheme].muted },
    { id: 'electron', label: 'Electron', hint: 'Cyan aurora, neon dark skin', swatch: ACCENT_THEMES.electron.hex[scheme], ring: null },
    { id: 'rose', label: 'Rose', hint: 'Pink aurora, neon dark skin', swatch: ACCENT_THEMES.rose.hex[scheme], ring: null },
  ] as const;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
        <Section title="Mode" className="mt-4">
          <ListGroup>
            <ListRow
              stacked
              icon={<Icon icon={themeMode === 'dark' ? Moon : themeMode === 'light' ? Sun : Smartphone} size={18} color="muted-foreground" />}
              title="Light or dark"
              subtitle="System follows your phone">
              <View className="flex-row flex-wrap gap-2">
                <Chip label="System" selected={themeMode === 'system'} onPress={() => setThemeMode('system')} />
                <Chip label="Light" selected={themeMode === 'light'} onPress={() => setThemeMode('light')} />
                <Chip label="Dark" selected={themeMode === 'dark'} onPress={() => setThemeMode('dark')} />
              </View>
            </ListRow>
          </ListGroup>
        </Section>

        <Section title="Theme">
          <ListGroup>
            {presets.map((preset) => {
              const selected = preset.id === 'classic' ? !auroraActive : accentTheme === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => applyThemePreset(preset.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${preset.label} theme`}
                  className="flex-row items-center gap-3 py-3 active:opacity-70">
                  <View
                    className="h-9 w-9 rounded-full border border-divider"
                    style={{ backgroundColor: preset.swatch, borderColor: preset.ring ?? undefined }}
                  />
                  <View className="min-w-0 flex-1">
                    <Body className="font-medium text-foreground">{preset.label}</Body>
                    <Caption className="mt-0.5">{preset.hint}</Caption>
                  </View>
                  {selected ? <Icon icon={Check} size={18} color="primary" /> : null}
                </Pressable>
              );
            })}
          </ListGroup>
          <Caption className="mt-2 px-1 text-xs">
            Aurora skins restyle the dark base and add an ambient glow. Light mode stays Classic.
          </Caption>
        </Section>

        <Section title="Accent">
          <Card>
            {/* #182: under an aurora skin the dots used to dim but stay live, so a
                tap looked broken. They stay full strength; a tap switches back to
                Classic with that accent, and the ring marks Classic's current one. */}
            <Caption>{auroraActive ? 'Pick an accent to switch back to Classic' : selectedAccent.description}</Caption>
            <View className="mt-3 flex-row flex-wrap gap-3">
              {CLASSIC_ACCENTS.map((theme) => {
                const selected = auroraActive ? lastClassicAccent === theme.id : accentTheme === theme.id;
                const swatch = scheme === 'dark' ? theme.hex.dark : theme.hex.light;
                return (
                  <Pressable
                    key={theme.id}
                    onPress={() => setAccentTheme(theme.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${theme.label} accent`}
                    accessibilityHint={auroraActive ? 'Switches to the Classic theme' : undefined}
                    className="items-center gap-1.5"
                    style={{ width: 56, minHeight: motionControl.minHeight }}>
                    <View
                      className={cn(
                        'h-10 w-10 items-center justify-center rounded-full border-2',
                        selected ? (auroraActive ? 'border-muted-foreground' : 'border-foreground') : 'border-transparent',
                      )}>
                      <View className="h-8 w-8 rounded-full" style={{ backgroundColor: swatch }} />
                    </View>
                    <Caption className={cn('text-center text-2xs', selected ? 'font-semibold text-foreground' : '')}>
                      {theme.label}
                    </Caption>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
