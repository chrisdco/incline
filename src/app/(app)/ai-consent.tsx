import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Ban, Cloud, KeyRound, Send } from 'lucide-react-native';

import { useAiSettings } from '@/ai/byok';
import { byokPreset } from '@/ai/byok-presets';
import { hasConsent, INCLINE_AI_PROCESSORS, INCLINE_AI_ROUTER, useAiConsent } from '@/ai/consent';
import { Icon } from '@/components/common/icon';
import { Caption, Heading } from '@/components/common/text';
import { ListRow, SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Switch } from '@/components/ui/switch';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useSettings } from '@/store/settings-store';

function Point({ icon, children }: { icon: typeof Send; children: string }) {
  return (
    <View className="flex-row items-start gap-3">
      <Icon icon={icon} size={18} color="muted-foreground" />
      <Caption className="min-w-0 flex-1">{children}</Caption>
    </View>
  );
}

/**
 * Consent to share personal data with third-party AI (App Store 5.1.2(i),
 * FOUNDATION-REVIEW G1): names each provider, says what is and isn't sent,
 * every switch starts off. `?enable=1` (from the AI switch) turns AI on once
 * at least one provider is allowed.
 */
export default function AiConsentScreen() {
  const router = useRouter();
  const { enable } = useLocalSearchParams<{ enable?: string }>();
  const consent = useAiConsent();
  const byok = useAiSettings((s) => s.byok);
  const setAiEnabled = useSettings((s) => s.setAiExplanationsEnabled);

  const inclineOn = hasConsent(consent, { kind: 'incline' });
  const byokPresetInfo = byok && byok.presetId !== 'local' ? byokPreset(byok.presetId) : null;
  const byokOn = byokPresetInfo ? hasConsent(consent, { kind: 'byok', presetId: byokPresetInfo.id }) : false;

  const done = () => {
    if (enable === '1' && (inclineOn || byokOn)) setAiEnabled(true);
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={() => router.back()} className="-my-1.5 -ml-2" />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 24 }}>
        <Heading>AI and your data</Heading>
        <Caption className="mt-2">
          AI features send some of your training data to an outside AI provider to write an answer. Nothing is sent until you
          allow a provider below, and you can turn it off at any time.
        </Caption>

        <SectionLabel className="mt-6">What is sent</SectionLabel>
        <Card>
          <View className="gap-3 py-3">
            <Point icon={Send}>
              Only what an answer needs: summaries and the workouts, routines, records and exercise names it looks at.
            </Point>
            <Point icon={Ban}>Never your email, account details, photos or passwords. Health data only if you allow it later.</Point>
            <Point icon={Cloud}>
              Free AI tiers may keep requests to improve their models. Use your own paid key if that matters to you.
            </Point>
          </View>
        </Card>

        <SectionLabel className="mt-6">Allow these providers</SectionLabel>
        <Card>
          <ListRow
            title="Incline AI"
            subtitle={`Processed by ${INCLINE_AI_PROCESSORS.join(' and ')}, routed through ${INCLINE_AI_ROUTER}.`}>
            <Switch
              value={inclineOn}
              onValueChange={(v) => consent.set({ kind: 'incline' }, v)}
              accessibilityLabel="Allow Incline AI"
            />
          </ListRow>
          {byokPresetInfo ? (
            <ListRow title={`${byokPresetInfo.label} (your key)`} subtitle={`Sent directly from this phone to ${byokPresetInfo.label}.`}>
              <Switch
                value={byokOn}
                onValueChange={(v) => consent.set({ kind: 'byok', presetId: byokPresetInfo.id }, v)}
                accessibilityLabel={`Allow ${byokPresetInfo.label}`}
              />
            </ListRow>
          ) : null}
        </Card>
        <View className="mt-3 flex-row items-start gap-3 px-1">
          <Icon icon={KeyRound} size={16} color="muted-foreground" />
          <Caption className="min-w-0 flex-1">
            A model on your own computer (Local) is not an outside provider and needs no permission here.
          </Caption>
        </View>
      </ScrollView>
      <View className="px-4 pb-2 pt-2">
        <Button onPress={done}>{enable === '1' && !(inclineOn || byokOn) ? 'Not now' : 'Done'}</Button>
      </View>
    </SafeAreaView>
  );
}
