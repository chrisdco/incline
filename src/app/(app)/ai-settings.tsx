import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bot, CheckCircle2, Cloud, History, KeyRound, ShieldCheck, XCircle } from 'lucide-react-native';
import { AiMark } from '@/components/ai/ai-mark';

import { Icon } from '@/components/common/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Chip } from '@/components/common/chip';
import { Body, Caption } from '@/components/common/text';
import { ListRow, SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { clearByokKey, getByokKey, setByokKey, useAiSettings } from '@/ai/byok';
import {
  BYOK_PRESETS,
  byokPreset,
  isCleartextLan,
  isValidServerUrl,
  type ByokConfig,
  type ByokPresetId,
} from '@/ai/byok-presets';
import { testAiConnection, type ConnectionTestResult } from '@/ai/connection-test';
import { aiFailureCopy } from '@/ai/copy';
import { hasAnyConsent, useAiConsent } from '@/ai/consent';
import { useAiDataUse } from '@/ai/data-use';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useSettings } from '@/store/settings-store';

type Where = 'cloud' | 'byok';

function maskKey(key: string): string {
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`;
}

function draftConfig(presetId: ByokPresetId, model: string, baseUrl: string): ByokConfig {
  const preset = byokPreset(presetId);
  return {
    presetId,
    baseUrl: baseUrl.trim() || preset.baseUrl,
    model: model.trim() || preset.defaultModel,
    ...(preset.reasoningEffort ? { reasoningEffort: preset.reasoningEffort } : {}),
  };
}

// Module-level so the async handlers' try blocks stay free of conditionals
// (React Compiler can't lower them inside try/catch).
async function runTest(config: ByokConfig, draftKey: string): Promise<ConnectionTestResult> {
  const typed = draftKey.trim();
  const getKey = typed ? async () => typed : getByokKey;
  try {
    return await testAiConnection(config, getKey);
  } catch {
    return { ok: false, reason: 'error' };
  }
}

async function persistKey(draftKey: string): Promise<boolean> {
  const typed = draftKey.trim();
  if (!typed) return true;
  try {
    await setByokKey(typed);
    return true;
  } catch {
    return false;
  }
}

function TestResultLine({ result }: { result: ConnectionTestResult }) {
  if (result.ok) {
    return (
      <View className="flex-row items-start gap-2">
        <Icon icon={CheckCircle2} size={18} color="success" />
        <View className="min-w-0 flex-1">
          <Body className="font-medium text-foreground">Connected · {result.latencyMs} ms</Body>
          <Caption selectable className="mt-0.5">Sample reply: “{result.headline}”</Caption>
        </View>
      </View>
    );
  }
  const copy = aiFailureCopy(result.reason);
  return (
    <View className="flex-row items-start gap-2">
      <Icon icon={XCircle} size={18} color="destructive" />
      <View className="min-w-0 flex-1">
        <Body selectable className="font-medium text-foreground">{copy.title}</Body>
        <Caption selectable className="mt-0.5">{copy.body}</Caption>
      </View>
    </View>
  );
}

export default function AiSettingsScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const aiEnabled = useSettings((s) => s.aiExplanationsEnabled);
  const setAiEnabled = useSettings((s) => s.setAiExplanationsEnabled);
  const saved = useAiSettings((s) => s.byok);
  const setByok = useAiSettings((s) => s.setByok);
  const consent = useAiConsent();
  const consented = hasAnyConsent(consent);
  const dataUseCount = useAiDataUse((s) => s.entries.length);
  const onToggleAi = (on: boolean) => {
    // Turning AI on goes through consent first (App Store 5.1.2(i)); the consent screen turns it on.
    if (on && !consented) router.push('/(app)/ai-consent?enable=1' as Href);
    else setAiEnabled(on);
  };

  const [where, setWhere] = useState<Where>(saved ? 'byok' : 'cloud');
  const [presetId, setPresetId] = useState<ByokPresetId>(saved?.presetId ?? 'groq');
  const [model, setModel] = useState(saved?.model ?? '');
  const [baseUrl, setBaseUrl] = useState(saved?.presetId === 'local' ? saved.baseUrl : '');
  const [keyDraft, setKeyDraft] = useState('');
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  useEffect(() => {
    void getByokKey().then(setStoredKey);
  }, []);

  const preset = byokPreset(presetId);
  const hasKey = !preset.needsKey || Boolean(keyDraft.trim() || storedKey);
  const config = draftConfig(presetId, model, baseUrl);
  const urlOk = isValidServerUrl(config.baseUrl);
  const canSubmit = hasKey && urlOk && !testing && !saving;

  const pickPreset = (id: ByokPresetId) => {
    setPresetId(id);
    setModel('');
    setBaseUrl('');
    setTestResult(null);
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestResult(await runTest(config, keyDraft));
    setTesting(false);
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    const keySaved = await persistKey(keyDraft);
    setSaving(false);
    if (!keySaved) {
      // Draft stays in the field so the user can retry.
      toast({ title: 'Could not save the key', variant: 'destructive' });
      return;
    }
    setByok(config);
    // Saving a provider under the disclosure line below is the user's permission for it.
    consent.set({ kind: 'byok', presetId: config.presetId }, true);
    setStoredKey(keyDraft.trim() || storedKey);
    setKeyDraft('');
    toast({ title: `Using ${preset.label}`, description: 'Incline cloud stays as the backup.', variant: 'success' });
  };

  const switchToCloud = async () => {
    setWhere('cloud');
    setByok(null);
    await clearByokKey();
    setStoredKey(null);
    setKeyDraft('');
    setTestResult(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={() => router.back()} className="-my-1.5 -ml-2" />
        <Body className="text-base font-semibold text-foreground">AI</Body>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 40 }}>
        <Card>
          <ListRow
            icon={<Icon icon={AiMark} size={18} color="muted-foreground" />}
            title="AI coaching"
            subtitle="Plain-language explanations. Numbers always come from your data and our rules.">
            <Switch value={aiEnabled} onValueChange={onToggleAi} accessibilityLabel="AI coaching" />
          </ListRow>
        </Card>

        <SectionLabel className="mt-6">Where AI runs</SectionLabel>
        <Card>
          <View className="flex-row gap-2 py-3">
            <Chip label="Incline cloud" selected={where === 'cloud'} onPress={() => void switchToCloud()} />
            <Chip label="My own key / local" selected={where === 'byok'} onPress={() => setWhere('byok')} />
          </View>
          <Caption className="pb-3">
            {where === 'cloud'
              ? 'Free, no setup. Uses a shared daily limit.'
              : 'Your provider and quota. Incline cloud is still used if yours is unavailable.'}
          </Caption>
        </Card>

        {where === 'byok' ? (
          <>
            <SectionLabel className="mt-6">Provider</SectionLabel>
            <Card>
              <View className="flex-row flex-wrap gap-1.5 py-3">
                {BYOK_PRESETS.map((p) => (
                  <Chip key={p.id} size="sm" label={p.label} selected={presetId === p.id} onPress={() => pickPreset(p.id)} />
                ))}
              </View>

              <View className="gap-2 border-t border-border py-3">
                <Body className="font-medium text-foreground">Model</Body>
                <Input
                  value={model}
                  onChangeText={setModel}
                  placeholder={preset.defaultModel}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Model"
                />
              </View>

              {presetId === 'local' ? (
                <View className="gap-2 border-t border-border py-3">
                  <Body className="font-medium text-foreground">Server address</Body>
                  <Input
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    placeholder={preset.baseUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    accessibilityLabel="Server address"
                  />
                  {urlOk ? (
                    <Caption>Ollama or LM Studio on your network. Small models are slow on a laptop CPU.</Caption>
                  ) : (
                    <Caption selectable className="text-destructive">Enter an address like http://192.168.1.10:11434/v1</Caption>
                  )}
                  {urlOk && process.env.EXPO_OS === 'android' && isCleartextLan(config.baseUrl) ? (
                    <Caption>
                      This version of Android blocks plain http to other devices. If the test fails, use an https address
                      (for example a tunnel to your computer).
                    </Caption>
                  ) : null}
                </View>
              ) : null}

              {preset.needsKey ? (
                <View className="gap-2 border-t border-border py-3">
                  <View className="flex-row items-center justify-between">
                    <Body className="font-medium text-foreground">API key</Body>
                    {preset.keyUrl ? (
                      <Pressable onPress={() => void Linking.openURL(preset.keyUrl!)} accessibilityRole="link" hitSlop={8}>
                        <Caption className="text-primary-text">Get a key</Caption>
                      </Pressable>
                    ) : null}
                  </View>
                  <Input
                    value={keyDraft}
                    onChangeText={setKeyDraft}
                    placeholder={storedKey ? `Saved ${maskKey(storedKey)} — paste to replace` : 'Paste your key'}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="API key"
                  />
                </View>
              ) : null}

              <View className="gap-3 border-t border-border py-3">
                <View className="flex-row gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onPress={() => void onTest()} loading={testing} disabled={!canSubmit}>
                    Test connection
                  </Button>
                  <Button size="sm" className="flex-1" onPress={() => void onSave()} loading={saving} disabled={!canSubmit}>
                    Save
                  </Button>
                </View>
                {presetId !== 'local' ? (
                  <Caption>Saving lets Incline send the data each answer needs to {preset.label}.</Caption>
                ) : null}
                {testResult ? <TestResultLine result={testResult} /> : null}
                {saved ? (
                  <Caption>
                    Active: {byokPreset(saved.presetId).label} · {saved.model}
                  </Caption>
                ) : null}
              </View>
            </Card>
          </>
        ) : null}

        <SectionLabel className="mt-6">Privacy</SectionLabel>
        <Card>
          <ListRow
            icon={<Icon icon={ShieldCheck} size={18} color="muted-foreground" />}
            title="Data sharing"
            subtitle={consented ? 'Allowed for the providers you chose' : 'No AI provider allowed yet'}
            onPress={() => router.push('/(app)/ai-consent' as Href)}
          />
          <ListRow
            icon={<Icon icon={History} size={18} color="muted-foreground" />}
            title="AI data use"
            subtitle={dataUseCount ? `${dataUseCount} recent requests — what was sent, to whom` : 'What was sent, to whom and when'}
            onPress={() => router.push('/(app)/ai-data-use' as Href)}
          />
          <View className="gap-3 py-3">
            <View className="flex-row items-start gap-3">
              <Icon icon={ShieldCheck} size={18} color="muted-foreground" />
              <Caption className="min-w-0 flex-1">
                AI only sees summaries the app computes (like “volume +12% this week”), never your full history.
              </Caption>
            </View>
            <View className="flex-row items-start gap-3">
              <Icon icon={KeyRound} size={18} color="muted-foreground" />
              <Caption className="min-w-0 flex-1">
                Your key is stored in this phone’s secure keystore and sent only to the provider you chose.
              </Caption>
            </View>
            <View className="flex-row items-start gap-3">
              <Icon icon={Cloud} size={18} color="muted-foreground" />
              <Caption className="min-w-0 flex-1">
                Free AI tiers may use requests to improve their models. Use your own paid key if that matters to you.
              </Caption>
            </View>
          </View>
        </Card>

        <SectionLabel className="mt-6">Connected AI apps</SectionLabel>
        <Card>
          <ListRow
            icon={<Icon icon={Bot} size={18} color="muted-foreground" />}
            title="Connect Claude and others"
            subtitle="Let your AI apps read your training and save routines"
            onPress={() => router.push('/(app)/connect-ai' as Href)}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
