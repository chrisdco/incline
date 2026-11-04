import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Vibrate, Ruler, Bell, BellOff, Timer, Zap, Palette,
  Cloud, RefreshCw, CalendarDays, MonitorSmartphone, Download, Sparkles, History,
  Film, FlaskConical, Info, Upload, Trash2,
} from 'lucide-react-native';
import { useAiSettings } from '@/ai/byok';
import { byokPreset, type ByokConfig } from '@/ai/byok-presets';
import { applyAppUpdate, checkForAppUpdate, updatesEnabled } from '@/features/updates';
import { formatRelease, releaseInfo } from '@/lib/release';
import { Icon } from '@/components/common/icon';

import { Caption } from '@/components/common/text';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { Switch } from '@/components/ui/switch';
import { Chip } from '@/components/common/chip';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useSettings, DEFAULT_REST_OPTIONS } from '@/store/settings-store';
import { useProfile } from '@/hooks/use-data';
import { useCloudSync } from '@/hooks/use-cloud-sync';
import { clearWorkoutHistory, saveProfile } from '@/db/queries';
import { ACCENT_THEME_LIST, isAuroraAccent } from '@/lib/accent-themes';
import { SCREEN_CONTENT } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { getNotifications, getExactAlarmStatus, requestExactAlarmPermission } from '@/lib/notifications';
import type { Unit } from '@/db/types';

/** Version + stage, and a manual update check (OTA via expo-updates). */
function AboutSection() {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [ready, setReady] = useState(false);
  const info = releaseInfo();
  const canUpdate = updatesEnabled();

  const check = async () => {
    setChecking(true);
    const outcome = await checkForAppUpdate();
    setChecking(false);
    if (outcome === 'ready') setReady(true);
    else if (outcome === 'none') toast({ title: 'You’re up to date', variant: 'success' });
    else if (outcome === 'error') toast({ title: 'Couldn’t check for updates', description: 'Try again on a better connection.', variant: 'warning' });
  };

  return (
    <Section title="About">
      <ListGroup>
        <ListRow
          icon={<Icon icon={Info} size={18} color="muted-foreground" />}
          title="Version"
          subtitle={info.updateCreatedAt ? `Updated ${info.updateCreatedAt.toLocaleDateString()}` : undefined}>
          <Caption>{formatRelease(info)}</Caption>
        </ListRow>
        <ListRow
          icon={<Icon icon={RefreshCw} size={18} color="muted-foreground" />}
          title="App updates"
          subtitle={canUpdate ? (ready ? 'Downloaded — restart to apply' : 'Checks automatically on launch') : 'Not available in this build'}>
          {ready ? (
            <Button size="sm" onPress={() => void applyAppUpdate()}>Restart</Button>
          ) : (
            <Button size="sm" variant="outline" disabled={!canUpdate || checking} loading={checking} onPress={() => void check()}>
              Check
            </Button>
          )}
        </ListRow>
      </ListGroup>
    </Section>
  );
}

function formatSyncTime(ms: number | null | undefined): string {
  if (!ms) return 'Never';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Never';
  }
}

/** One-line state for the AI row: off, cloud, or the user's own provider. */
function aiSummary(enabled: boolean, byok: ByokConfig | null): string {
  if (!enabled) return 'Off';
  return byok ? `On · ${byokPreset(byok.presetId).label} (your key)` : 'On · Incline cloud';
}

const MODE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' } as const;

/**
 * Settings hub. Topics with more than a few rows (notifications, appearance,
 * AI) are their own screens; this one keeps the toggles you change often.
 */
export default function SettingsScreen() {
  const {
    unit, themeMode, accentTheme, hapticsEnabled,
    restSoundEnabled, autoStartRest, defaultRestSeconds, showWarmUpSets, showRpe,
    showSessionGhost,
    aiExplanationsEnabled,
    calendarHeatMetric, weekStartsOn, keepScreenAwake, weeklyWorkoutGoal,
    workoutRemindersEnabled, weeklyDigestEnabled,
    monthlyRecapEnabled, abandonedNudgeEnabled, streakNudgeEnabled, milestoneNudgeEnabled,
    exerciseMediaStyle, exerciseMediaAnimation, devExerciseMediaOverride,
    setUnit, setHaptics, setRestSound, setAutoStartRest, setDefaultRestSeconds, setShowWarmUpSets, setShowRpe,
    setShowSessionGhost,
    setCalendarHeatMetric, setWeekStartsOn, setKeepScreenAwake, setWeeklyWorkoutGoal,
    setExerciseMediaStyle, setExerciseMediaAnimation, setDevExerciseMediaOverride,
  } = useSettings();
  const router = useRouter();
  const aiByok = useAiSettings((s) => s.byok);
  const { data: profile, refetch } = useProfile();
  const { toast } = useToast();
  const { status, pending, syncing, enabled, syncNow } = useCloudSync({ auto: false });
  const [clearOpen, setClearOpen] = useState(false);

  const accent = ACCENT_THEME_LIST.find((t) => t.id === accentTheme) ?? ACCENT_THEME_LIST[0];
  const appearanceSummary = `${MODE_LABELS[themeMode]} · ${accent.label}${isAuroraAccent(accentTheme) ? ' aurora' : ''}`;
  const notificationsOn = [
    workoutRemindersEnabled, weeklyDigestEnabled, monthlyRecapEnabled,
    abandonedNudgeEnabled, streakNudgeEnabled, milestoneNudgeEnabled,
  ].filter(Boolean).length;

  // Android 14+ denies exact alarms by default; without the grant a rest alert
  // can arrive minutes late, so surface a one-tap fix next to the toggle.
  const [exactAlarmDenied, setExactAlarmDenied] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const mod = getNotifications();
    if (!mod) return;
    let cancelled = false;
    void getExactAlarmStatus(mod).then((alarmStatus) => {
      if (!cancelled) setExactAlarmDenied(alarmStatus === 'denied');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allowExactAlarms = async () => {
    const mod = getNotifications();
    if (!mod) return;
    const granted = await requestExactAlarmPermission(mod);
    setExactAlarmDenied(!granted);
  };

  const changeUnit = (u: Unit) => {
    setUnit(u);
    if (profile) saveProfile({ unit: u }).then(refetch);
  };

  const isSyncError = status?.status === 'error' && !!status?.lastError;
  const syncSubtitle = !enabled
    ? 'Sign in to back up'
    : status?.lastError
      ? pending > 0
        ? `${status.lastError} • ${pending} waiting — tap retry`
        : status.lastError
      : pending > 0
        ? `${pending} change${pending === 1 ? '' : 's'} waiting to upload`
        : `Last synced ${formatSyncTime(status?.lastPullAt ?? status?.lastPushAt)}`;

  const handleSyncPress = async () => {
    const result = await syncNow();
    if (result.ok) {
      toast({
        title: 'Synced',
        description: result.pushed > 0 ? `${result.pushed} pushed` : 'Up to date',
        variant: 'success',
      });
    } else if (result.error) {
      toast({ title: 'Sync failed', description: result.error, variant: 'destructive' });
    } else if (status?.lastError) {
      toast({ title: 'Sync failed', description: status.lastError, variant: 'destructive' });
    }
  };

  const clearHistory = async () => {
    setClearOpen(false);
    await clearWorkoutHistory();
    toast({ title: 'Workout history cleared', variant: 'info' });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
        <Section title="Workout" className="mt-4">
          <ListGroup>
            <ListRow icon={<Icon icon={Zap} size={18} color="muted-foreground" />} title="Auto-start rest timer" subtitle="Begin countdown when you finish a set">
              <Switch value={autoStartRest} onValueChange={setAutoStartRest} accessibilityLabel="Auto-start rest timer" />
            </ListRow>
            <ListRow stacked icon={<Icon icon={Timer} size={18} color="muted-foreground" />} title="Default rest" subtitle="Used for newly added exercises">
              <View className="flex-row flex-wrap gap-1.5">
                {DEFAULT_REST_OPTIONS.map((s) => (
                  <Chip key={s} size="sm" label={`${s}s`} selected={defaultRestSeconds === s} onPress={() => setDefaultRestSeconds(s)} />
                ))}
              </View>
            </ListRow>
            <ListRow icon={<Icon icon={restSoundEnabled ? Bell : BellOff} size={18} color="muted-foreground" />} title="Rest timer alerts" subtitle="Chime in-app and notify if you leave the session">
              <Switch value={restSoundEnabled} onValueChange={setRestSound} accessibilityLabel="Rest timer alerts" />
            </ListRow>
            {Platform.OS === 'android' && restSoundEnabled && exactAlarmDenied ? (
              <ListRow
                icon={<Icon icon={Timer} size={18} color="muted-foreground" />}
                title="Precise rest alerts"
                subtitle="Allow exact alarms so rest alerts arrive on time">
                <Chip label="Allow" onPress={allowExactAlarms} />
              </ListRow>
            ) : null}
            <ListRow icon={<Icon icon={METRIC_ICONS.warmUp} size={18} color="muted-foreground" />} title="Warm-up set button" subtitle="Quick 50% set in the session">
              <Switch value={showWarmUpSets} onValueChange={setShowWarmUpSets} accessibilityLabel="Warm-up set button" />
            </ListRow>
            <ListRow icon={<Icon icon={METRIC_ICONS.rpe} size={18} color="muted-foreground" />} title="RPE after working sets" subtitle="Optional 1–10. Never required to complete a set">
              <Switch value={showRpe} onValueChange={setShowRpe} accessibilityLabel="RPE after working sets" />
            </ListRow>
            <ListRow
              icon={<Icon icon={History} size={18} color="muted-foreground" />}
              title="Last-session comparison"
              subtitle="Show last time on the workout preview and live session">
              <Switch value={showSessionGhost} onValueChange={setShowSessionGhost} accessibilityLabel="Last-session comparison" />
            </ListRow>
            <ListRow icon={<Icon icon={MonitorSmartphone} size={18} color="muted-foreground" />} title="Keep screen on" subtitle="While a workout session is open">
              <Switch value={keepScreenAwake} onValueChange={setKeepScreenAwake} accessibilityLabel="Keep screen on during workout" />
            </ListRow>
            <ListRow icon={<Icon icon={Vibrate} size={18} color="muted-foreground" />} title="Haptics" subtitle="Subtle vibration feedback">
              <Switch value={hapticsEnabled} onValueChange={setHaptics} accessibilityLabel="Haptics" />
            </ListRow>
            <ListRow stacked icon={<Icon icon={METRIC_ICONS.sessions} size={18} color="muted-foreground" />} title="Weekly workout goal" subtitle="Sessions per week for consistency tracking">
              <View className="flex-row flex-wrap gap-1.5">
                {[0, 3, 4, 5, 6].map((g) => (
                  <Chip key={g} size="sm" label={g === 0 ? 'Off' : `${g}×`} selected={weeklyWorkoutGoal === g} onPress={() => setWeeklyWorkoutGoal(g)} />
                ))}
              </View>
            </ListRow>
          </ListGroup>
        </Section>

        <Section title="Units">
          <ListGroup>
            <ListRow icon={<Icon icon={Ruler} size={18} color="muted-foreground" />} title="Measurement" subtitle="Displayed across workouts and stats">
              <View className="flex-row gap-2">
                <Chip label="kg" selected={unit === 'metric'} onPress={() => changeUnit('metric')} />
                <Chip label="lb" selected={unit === 'imperial'} onPress={() => changeUnit('imperial')} />
              </View>
            </ListRow>
          </ListGroup>
        </Section>

        <Section title="App">
          <ListGroup>
            <ListRow
              icon={<Icon icon={Palette} size={18} color="muted-foreground" />}
              title="Appearance"
              subtitle={appearanceSummary}
              onPress={() => router.push('/(app)/appearance' as Href)}
            />
            <ListRow
              icon={<Icon icon={Bell} size={18} color="muted-foreground" />}
              title="Notifications"
              subtitle={notificationsOn ? `${notificationsOn} on` : 'Off'}
              onPress={() => router.push('/(app)/notifications' as Href)}
            />
            <ListRow
              icon={<Icon icon={Sparkles} size={18} color="muted-foreground" />}
              title="AI coaching"
              subtitle={aiSummary(aiExplanationsEnabled, aiByok)}
              onPress={() => router.push('/(app)/ai-settings' as Href)}
              accessibilityLabel="AI settings"
            />
          </ListGroup>
        </Section>

        <Section title="Display">
          <ListGroup>
            <ListRow stacked
              icon={<Icon icon={Film} size={18} color="muted-foreground" />}
              title="Demonstration images"
              subtitle="Auto uses GIFs first, illustrations fill the gaps">
              <View className="flex-row flex-wrap gap-2">
                <Chip label="Auto" selected={exerciseMediaStyle === 'auto'} onPress={() => setExerciseMediaStyle('auto')} />
                <Chip label="GIFs" selected={exerciseMediaStyle === 'gif'} onPress={() => setExerciseMediaStyle('gif')} />
                <Chip label="Illustrations" selected={exerciseMediaStyle === 'illustration'} onPress={() => setExerciseMediaStyle('illustration')} />
              </View>
            </ListRow>
            <ListRow
              icon={<Icon icon={Timer} size={18} color="muted-foreground" />}
              title="Illustration motion"
              subtitle="Cycle frames, or hold one pose">
              <View className="flex-row gap-2">
                <Chip label="Cycle" selected={exerciseMediaAnimation === 'cycle'} onPress={() => setExerciseMediaAnimation('cycle')} />
                <Chip label="Static" selected={exerciseMediaAnimation === 'static'} onPress={() => setExerciseMediaAnimation('static')} />
              </View>
            </ListRow>
            <ListRow stacked
              icon={<Icon icon={METRIC_ICONS.sessions} size={18} color="muted-foreground" />}
              title="Calendar day color"
              subtitle="What each tinted day represents">
              <View className="flex-row flex-wrap gap-2">
                {(
                  [
                    { id: 'presence' as const, label: 'Trained' },
                    { id: 'volume' as const, label: 'Volume' },
                    { id: 'intensity' as const, label: 'Intensity' },
                    { id: 'reps' as const, label: 'Reps' },
                  ]
                ).map((opt) => (
                  <Chip key={opt.id} size="sm" label={opt.label} selected={calendarHeatMetric === opt.id} onPress={() => setCalendarHeatMetric(opt.id)} />
                ))}
              </View>
            </ListRow>
            <ListRow
              icon={<Icon icon={CalendarDays} size={18} color="muted-foreground" />}
              title="Week starts on"
              subtitle="Calendar grids and day headers">
              <View className="flex-row gap-2">
                <Chip label="Mon" selected={weekStartsOn === 'monday'} onPress={() => setWeekStartsOn('monday')} />
                <Chip label="Sun" selected={weekStartsOn === 'sunday'} onPress={() => setWeekStartsOn('sunday')} />
              </View>
            </ListRow>
          </ListGroup>
          <Caption className="mt-2 px-1 text-xs">Illustrations by Bryl Lim / Everkinetic · CC BY-SA 4.0</Caption>
        </Section>

        <Section title="Backup">
          <ListGroup>
            <ListRow
              icon={<Icon icon={Cloud} size={18} color={isSyncError ? 'destructive' : 'muted-foreground'} />}
              title={syncing ? 'Syncing…' : isSyncError ? 'Sync error' : 'Backup & restore'}
              subtitle={syncSubtitle}>
              <Button
                size="icon"
                variant="tonal"
                disabled={!enabled || syncing}
                onPress={() => void handleSyncPress()}
                accessibilityLabel={isSyncError ? 'Retry sync' : 'Sync now'}>
                <Icon icon={RefreshCw} size={16} color={isSyncError ? 'destructive' : 'primary'} />
              </Button>
            </ListRow>
          </ListGroup>
        </Section>

        <Section title="Your data">
          <ListGroup>
            <ListRow
              icon={<Icon icon={Download} size={18} color="muted-foreground" />}
              title="Download your data"
              subtitle="Choose workouts, measurements, and format"
              onPress={() => router.push('/(app)/export' as Href)}
              accessibilityLabel="Export your data"
            />
            <ListRow
              icon={<Icon icon={Upload} size={18} color="muted-foreground" />}
              title="Import from Strong / Hevy"
              subtitle="Bring your workout history from a CSV export"
              onPress={() => router.push('/(app)/import' as Href)}
            />
            <ListRow
              icon={<Icon icon={Trash2} size={18} color="destructive" />}
              title="Clear workout history"
              subtitle="Deletes every completed workout"
              tone="destructive"
              onPress={() => setClearOpen(true)}
            />
          </ListGroup>
        </Section>

        <AboutSection />

        {__DEV__ ? (
          <Section title="Dev tools">
            <ListGroup>
              <ListRow stacked
                icon={<Icon icon={FlaskConical} size={18} color="muted-foreground" />}
                title="Force media source"
                subtitle="Overrides the preference above — testing only">
                <View className="flex-row flex-wrap gap-2">
                  <Chip label="Off" selected={devExerciseMediaOverride === 'off'} onPress={() => setDevExerciseMediaOverride('off')} />
                  <Chip label="Auto" selected={devExerciseMediaOverride === 'auto'} onPress={() => setDevExerciseMediaOverride('auto')} />
                  <Chip label="GIFs" selected={devExerciseMediaOverride === 'gif'} onPress={() => setDevExerciseMediaOverride('gif')} />
                  <Chip label="Illustrations" selected={devExerciseMediaOverride === 'illustration'} onPress={() => setDevExerciseMediaOverride('illustration')} />
                </View>
              </ListRow>
            </ListGroup>
          </Section>
        ) : null}

        <Caption className="mt-6 text-center">Incline · Built with Expo</Caption>
      </ScrollView>

      <Dialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all history?"
        description={
          pending > 0
            ? `This permanently deletes every completed workout. ${pending} unsynced change${pending === 1 ? '' : 's'} will upload afterward — cleared items sync as deletions.`
            : 'This permanently deletes every completed workout. This cannot be undone. Export a copy first if you might want it.'
        }
        footer={
          <>
            {/* Export first + a second confirm: this is unrecoverable (#162). */}
            <Button
              variant="outline"
              onPress={() => {
                setClearOpen(false);
                router.push('/(app)/export' as Href);
              }}>
              Export first
            </Button>
            <Button variant="outline" onPress={() => setClearOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onPress={() =>
                Alert.alert('Delete every workout?', 'Your history, PRs and stats go too. There is no undo.', [
                  { text: 'Keep history', style: 'cancel' },
                  { text: 'Delete everything', style: 'destructive', onPress: () => void clearHistory() },
                ])
              }>
              Delete
            </Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
