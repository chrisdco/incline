import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Moon, Sun, Smartphone, Vibrate, Ruler, Bell, BellOff, Timer, Zap, Palette,
  Cloud, RefreshCw, CalendarDays, MonitorSmartphone, Download, ChevronRight, Sparkles, History,
  Film, FlaskConical, Info,
} from 'lucide-react-native';
import { applyAppUpdate, checkForAppUpdate, updatesEnabled } from '@/features/updates';
import { formatRelease, releaseInfo } from '@/lib/release';
import { Icon } from '@/components/common/icon';

import { Body, Caption } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import { ListRow, SectionLabel } from '@/components/layout';
import { Switch } from '@/components/ui/switch';
import { Chip } from '@/components/common/chip';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  useSettings,
  DEFAULT_REST_OPTIONS,
  WORKOUT_REMINDER_TIME_PRESETS,
} from '@/store/settings-store';
import { useProfile } from '@/hooks/use-data';
import { useCloudSync } from '@/hooks/use-cloud-sync';
import { saveProfile } from '@/db/queries';
import { ACCENT_THEMES, ACCENT_THEME_LIST, CLASSIC_ACCENTS, isAuroraAccent } from '@/lib/accent-themes';
import { SCREEN_CONTENT } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import {
  notificationsAvailable,
  prepareNotifications,
  NOTIFICATION_CHANNELS,
  getNotifications,
  getExactAlarmStatus,
  requestExactAlarmPermission,
} from '@/lib/notifications';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { cn } from '@/lib/cn';
import { NATIVE_NEUTRALS } from '@/styles/tokens';
import type { Unit } from '@/db/types';

const WEEKDAY_CHIPS: { jsDay: number; label: string }[] = [
  { jsDay: 1, label: 'Mon' },
  { jsDay: 2, label: 'Tue' },
  { jsDay: 3, label: 'Wed' },
  { jsDay: 4, label: 'Thu' },
  { jsDay: 5, label: 'Fri' },
  { jsDay: 6, label: 'Sat' },
  { jsDay: 0, label: 'Sun' },
];

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
    <>
      <SectionLabel className="mt-6">About</SectionLabel>
      <Card>
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
      </Card>
    </>
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

export default function SettingsScreen() {
  const {
    unit, themeMode, accentTheme, hapticsEnabled,
    restSoundEnabled, autoStartRest, defaultRestSeconds, showWarmUpSets, showRpe,
    showSessionGhost,
    aiExplanationsEnabled,
    calendarHeatMetric, weekStartsOn, keepScreenAwake, weeklyWorkoutGoal,
    workoutRemindersEnabled, workoutReminderDays, workoutReminderHour, workoutReminderMinute,
    weeklyDigestEnabled, weeklyDigestHour, weeklyDigestMinute,
    monthlyRecapEnabled, abandonedNudgeEnabled, streakNudgeEnabled, milestoneNudgeEnabled,
    exerciseMediaStyle, exerciseMediaAnimation, devExerciseMediaOverride,
    setUnit, setThemeMode, setAccentTheme, setHaptics, setRestSound, setAutoStartRest, setDefaultRestSeconds, setShowWarmUpSets, setShowRpe,
    setShowSessionGhost,
    setAiExplanationsEnabled,
    setCalendarHeatMetric, setWeekStartsOn, setKeepScreenAwake, setWeeklyWorkoutGoal,
    setWorkoutRemindersEnabled, setWorkoutReminderDays, setWorkoutReminderTime,
    setWeeklyDigestEnabled, setWeeklyDigestTime,
    setMonthlyRecapEnabled, setAbandonedNudgeEnabled, setStreakNudgeEnabled, setMilestoneNudgeEnabled,
    setExerciseMediaStyle, setExerciseMediaAnimation, setDevExerciseMediaOverride,
    applyThemePreset,
  } = useSettings();
  const router = useRouter();
  const { data: profile, refetch } = useProfile();
  const scheme = useAppColorScheme();
  const { toast } = useToast();
  const selectedAccent = ACCENT_THEME_LIST.find((t) => t.id === accentTheme) ?? ACCENT_THEME_LIST[0];
  const auroraActive = isAuroraAccent(accentTheme);
  const { status, pending, syncing, enabled, syncNow } = useCloudSync({ auto: false });

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

  const toggleReminderDay = (jsDay: number) => {
    const has = workoutReminderDays.includes(jsDay);
    if (has && workoutReminderDays.length === 1) {
      toast({ title: 'Keep at least one day', variant: 'warning' });
      return;
    }
    const next = has
      ? workoutReminderDays.filter((d) => d !== jsDay)
      : [...workoutReminderDays, jsDay];
    setWorkoutReminderDays(next);
  };

  const onRemindersToggle = async (next: boolean) => {
    if (!next) {
      setWorkoutRemindersEnabled(false);
      return;
    }
    if (!notificationsAvailable) {
      toast({
        title: 'Reminders need a dev build',
        description: 'Local alerts are unavailable in Android Expo Go',
        variant: 'warning',
      });
      return;
    }
    const mod = await prepareNotifications(NOTIFICATION_CHANNELS.workoutReminders);
    if (!mod) {
      toast({
        title: 'Permission needed',
        description: 'Allow notifications to schedule workout reminders',
        variant: 'warning',
      });
      return;
    }
    setWorkoutRemindersEnabled(true);
  };

  const onDigestToggle = async (next: boolean) => {
    if (!next) {
      setWeeklyDigestEnabled(false);
      return;
    }
    if (!notificationsAvailable) {
      toast({
        title: 'Digests need a dev build',
        description: 'Local alerts are unavailable in Android Expo Go',
        variant: 'warning',
      });
      return;
    }
    const mod = await prepareNotifications(NOTIFICATION_CHANNELS.digests);
    if (!mod) {
      toast({
        title: 'Permission needed',
        description: 'Allow notifications to schedule the weekly digest',
        variant: 'warning',
      });
      return;
    }
    setWeeklyDigestEnabled(true);
  };

  /** Generic gate for the digests-channel toggles (monthly recap + nudges). */
  const onDigestsChannelToggle = async (
    next: boolean,
    set: (v: boolean) => void,
    feature: string,
  ) => {
    if (!next) {
      set(false);
      return;
    }
    if (!notificationsAvailable) {
      toast({
        title: `${feature} need a dev build`,
        description: 'Local alerts are unavailable in Android Expo Go',
        variant: 'warning',
      });
      return;
    }
    const mod = await prepareNotifications(NOTIFICATION_CHANNELS.digests);
    if (!mod) {
      toast({
        title: 'Permission needed',
        description: `Allow notifications to enable ${feature.toLowerCase()}`,
        variant: 'warning',
      });
      return;
    }
    set(true);
  };

  const isSyncError = status?.status === 'error' && !!status?.lastError;
  const syncSubtitle = !enabled
    ? 'Configure Supabase + Clerk JWT to enable backup'
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

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
        <SectionLabel className="mt-1">Workout</SectionLabel>
        <Card>
          <ListRow icon={<Icon icon={Zap} size={18} color="muted-foreground" />} title="Auto-start rest timer" subtitle="Begin countdown when you finish a set">
            <Switch value={autoStartRest} onValueChange={setAutoStartRest} accessibilityLabel="Auto-start rest timer" />
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow stacked icon={<Icon icon={Timer} size={18} color="muted-foreground" />} title="Default rest" subtitle="Used for newly added exercises">
            <View className="flex-row flex-wrap gap-1.5">
              {DEFAULT_REST_OPTIONS.map((s) => (
                <Chip key={s} size="sm" label={`${s}s`} selected={defaultRestSeconds === s} onPress={() => setDefaultRestSeconds(s)} />
              ))}
            </View>
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow icon={restSoundEnabled ? <Icon icon={Bell} size={18} color="muted-foreground" /> : <Icon icon={BellOff} size={18} color="muted-foreground" />} title="Rest timer alerts" subtitle="Chime in-app and notify if you leave the session">
            <Switch value={restSoundEnabled} onValueChange={setRestSound} accessibilityLabel="Rest timer alerts" />
          </ListRow>
          {Platform.OS === 'android' && restSoundEnabled && exactAlarmDenied ? (
            <>
              <View className="h-px bg-border/60" />
              <ListRow
                icon={<Icon icon={Timer} size={18} color="muted-foreground" />}
                title="Precise rest alerts"
                subtitle="Allow exact alarms so rest alerts arrive on time">
                <Chip label="Allow" onPress={allowExactAlarms} />
              </ListRow>
            </>
          ) : null}
          <View className="h-px bg-border/60" />
          <ListRow icon={<Icon icon={METRIC_ICONS.warmUp} size={18} color="muted-foreground" />} title="Warm-up set button" subtitle="Quick 50% set in the session">
            <Switch value={showWarmUpSets} onValueChange={setShowWarmUpSets} accessibilityLabel="Warm-up set button" />
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow icon={<Icon icon={METRIC_ICONS.rpe} size={18} color="muted-foreground" />} title="RPE after working sets" subtitle="Optional 1–10. Never required to complete a set">
            <Switch value={showRpe} onValueChange={setShowRpe} accessibilityLabel="RPE after working sets" />
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow
            icon={<Icon icon={History} size={18} color="muted-foreground" />}
            title="Last-session comparison"
            subtitle="Show last time on the workout preview and live session">
            <Switch
              value={showSessionGhost}
              onValueChange={setShowSessionGhost}
              accessibilityLabel="Last-session comparison"
            />
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow
            icon={<Icon icon={MonitorSmartphone} size={18} color="muted-foreground" />}
            title="Keep screen on"
            subtitle="While a workout session is open">
            <Switch value={keepScreenAwake} onValueChange={setKeepScreenAwake} accessibilityLabel="Keep screen on during workout" />
          </ListRow>
        </Card>

        <SectionLabel className="mt-6">Units</SectionLabel>
        <Card>
          <ListRow icon={<Icon icon={Ruler} size={18} color="muted-foreground" />} title="Measurement" subtitle="Displayed across workouts and stats">
            <View className="flex-row gap-2">
              <Chip label="kg" selected={unit === 'metric'} onPress={() => changeUnit('metric')} />
              <Chip label="lb" selected={unit === 'imperial'} onPress={() => changeUnit('imperial')} />
            </View>
          </ListRow>
        </Card>

        <SectionLabel className="mt-6">Coaching</SectionLabel>
        <Card>
          <ListRow
            icon={<Icon icon={Sparkles} size={18} color="muted-foreground" />}
            title="AI explanations"
            subtitle="Numbers still come from local rules; optional AI wording">
            <Switch
              value={aiExplanationsEnabled}
              onValueChange={setAiExplanationsEnabled}
              accessibilityLabel="AI explanations"
            />
          </ListRow>
        </Card>

        <SectionLabel className="mt-6">Notifications · reminders</SectionLabel>
        <Card>
          <ListRow
            icon={<Icon icon={Bell} size={18} color="muted-foreground" />}
            title="Workout reminders"
            subtitle="Local weekly alerts on the days you choose">
            <Switch
              value={workoutRemindersEnabled}
              onValueChange={(v) => void onRemindersToggle(v)}
              accessibilityLabel="Workout reminders"
            />
          </ListRow>
          {workoutRemindersEnabled ? (
            <>
              <View className="h-px bg-border/60" />
              <ListRow stacked
                icon={<Icon icon={CalendarDays} size={18} color="muted-foreground" />}
                title="Days"
                subtitle="Tap to include or remove">
                <View className="flex-row flex-wrap gap-1.5">
                  {WEEKDAY_CHIPS.map((d) => (
                    <Chip
                      key={d.jsDay}
                      size="sm"
                      label={d.label}
                      selected={workoutReminderDays.includes(d.jsDay)}
                      onPress={() => toggleReminderDay(d.jsDay)}
                    />
                  ))}
                </View>
              </ListRow>
              <View className="h-px bg-border/60" />
              <ListRow stacked
                icon={<Icon icon={Timer} size={18} color="muted-foreground" />}
                title="Time"
                subtitle="Same time each selected day">
                <View className="flex-row flex-wrap gap-1.5">
                  {WORKOUT_REMINDER_TIME_PRESETS.map((t) => (
                    <Chip
                      key={t.label}
                      size="sm"
                      label={t.label}
                      selected={workoutReminderHour === t.hour && workoutReminderMinute === t.minute}
                      onPress={() => setWorkoutReminderTime(t.hour, t.minute)}
                    />
                  ))}
                </View>
              </ListRow>
            </>
          ) : null}
        </Card>

        <SectionLabel className="mt-6">Notifications · recaps</SectionLabel>
        <Card>
          <ListRow
            icon={<Icon icon={METRIC_ICONS.sessions} size={18} color="muted-foreground" />}
            title="Sunday digest"
            subtitle="Optional local alert with your week summary">
            <Switch
              value={weeklyDigestEnabled}
              onValueChange={(v) => void onDigestToggle(v)}
              accessibilityLabel="Sunday weekly digest"
            />
          </ListRow>
          {weeklyDigestEnabled ? (
            <>
              <View className="h-px bg-border/60" />
              <ListRow stacked
                icon={<Icon icon={Timer} size={18} color="muted-foreground" />}
                title="Time"
                subtitle="Fires every Sunday">
                <View className="flex-row flex-wrap gap-1.5">
                  {WORKOUT_REMINDER_TIME_PRESETS.map((t) => (
                    <Chip
                      key={`digest-${t.label}`}
                      size="sm"
                      label={t.label}
                      selected={weeklyDigestHour === t.hour && weeklyDigestMinute === t.minute}
                      onPress={() => setWeeklyDigestTime(t.hour, t.minute)}
                    />
                  ))}
                </View>
              </ListRow>
            </>
          ) : null}
          <View className="h-px bg-border/60" />
          <ListRow
            icon={<Icon icon={CalendarDays} size={18} color="muted-foreground" />}
            title="Monthly recap"
            subtitle="1st of the month, same time as the digest">
            <Switch
              value={monthlyRecapEnabled}
              onValueChange={(v) => void onDigestsChannelToggle(v, setMonthlyRecapEnabled, 'Monthly recaps')}
              accessibilityLabel="Monthly recap"
            />
          </ListRow>
        </Card>

        <SectionLabel className="mt-6">Notifications · nudges</SectionLabel>
        <Card>
          <ListRow
            icon={<Icon icon={History} size={18} color="muted-foreground" />}
            title="Abandoned session"
            subtitle="One ping if a workout sits idle 25+ min">
            <Switch
              value={abandonedNudgeEnabled}
              onValueChange={(v) => void onDigestsChannelToggle(v, setAbandonedNudgeEnabled, 'Session nudges')}
              accessibilityLabel="Abandoned session nudge"
            />
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow
            icon={<Icon icon={METRIC_ICONS.streak} size={18} color="muted-foreground" />}
            title="Streak at risk"
            subtitle="One late-week ping when a streak has no session yet">
            <Switch
              value={streakNudgeEnabled}
              onValueChange={(v) => void onDigestsChannelToggle(v, setStreakNudgeEnabled, 'Streak nudges')}
              accessibilityLabel="Streak at risk nudge"
            />
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow
            icon={<Icon icon={Zap} size={18} color="muted-foreground" />}
            title="Milestones"
            subtitle="Congrats ping for newly unlocked achievements">
            <Switch
              value={milestoneNudgeEnabled}
              onValueChange={(v) => void onDigestsChannelToggle(v, setMilestoneNudgeEnabled, 'Milestone nudges')}
              accessibilityLabel="Milestone nudges"
            />
          </ListRow>
        </Card>

        <SectionLabel className="mt-6">Appearance</SectionLabel>
        <Card>
          <ListRow stacked
            icon={themeMode === 'dark' ? <Icon icon={Moon} size={18} color="muted-foreground" /> : themeMode === 'light' ? <Icon icon={Sun} size={18} color="muted-foreground" /> : <Icon icon={Smartphone} size={18} color="muted-foreground" />}
            title="Theme">
            <View className="flex-row flex-wrap gap-2">
              <Chip label="System" selected={themeMode === 'system'} onPress={() => setThemeMode('system')} />
              <Chip label="Light" selected={themeMode === 'light'} onPress={() => setThemeMode('light')} />
              <Chip label="Dark" selected={themeMode === 'dark'} onPress={() => setThemeMode('dark')} />
            </View>
          </ListRow>
          <View className="h-px bg-border/60" />
          <View className="py-3">
            <View className="mb-3 flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
                <Icon icon={Sparkles} size={18} color="muted-foreground" />
              </View>
              <View className="flex-1">
                <Body className="font-medium text-foreground">Theme</Body>
                <Caption className="mt-0.5">
                  {auroraActive ? `${selectedAccent.label} aurora — neon dark skin` : 'Classic — clean base, any accent'}
                </Caption>
              </View>
            </View>
            <View className="gap-2 px-1">
              {(
                [
                  { id: 'classic', label: 'Classic', hint: 'Clean base + accent dots below', swatch: NATIVE_NEUTRALS[scheme].background, ring: NATIVE_NEUTRALS[scheme].muted },
                  { id: 'electron', label: 'Electron', hint: 'Cyan aurora · neon dark skin', swatch: ACCENT_THEMES.electron.hex[scheme], ring: null },
                  { id: 'rose', label: 'Rose', hint: 'Pink aurora · neon dark skin', swatch: ACCENT_THEMES.rose.hex[scheme], ring: null },
                ] as const
              ).map((preset) => {
                const selected = preset.id === 'classic' ? !auroraActive : accentTheme === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => applyThemePreset(preset.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${preset.label} theme`}
                    className={cn(
                      'flex-row items-center gap-3 rounded-2xl border px-3 py-2.5',
                      selected ? 'border-foreground bg-muted/60' : 'border-border/60',
                    )}>
                    <View
                      className="h-9 w-9 rounded-full border border-border/60"
                      style={{ backgroundColor: preset.swatch, borderColor: preset.ring ?? undefined }}
                    />
                    <View className="flex-1">
                      <Body className="font-medium text-foreground">{preset.label}</Body>
                      <Caption>{preset.hint}</Caption>
                    </View>
                    {selected ? <Icon icon={ChevronRight} size={18} color="muted-foreground" /> : null}
                  </Pressable>
                );
              })}
            </View>
            <Caption className="px-1 pb-1 pt-2 text-2xs">
              Aurora skins restyle the dark base + ambient glow. Light mode stays Classic.
            </Caption>
          </View>
          <View className="h-px bg-border/60" />
          <View className="py-3">
            <View className="mb-3 flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
                <Icon icon={Palette} size={18} color="muted-foreground" />
              </View>
              <View className="flex-1">
                <Body className="font-medium text-foreground">Accent</Body>
                <Caption className="mt-0.5">
                  {auroraActive ? 'Accents apply to the Classic theme' : selectedAccent.description}
                </Caption>
              </View>
            </View>
            <View className={cn('flex-row flex-wrap gap-3 px-1', auroraActive && 'opacity-60')}>
              {CLASSIC_ACCENTS.map((theme) => {
                const selected = accentTheme === theme.id;
                const swatch = scheme === 'dark' ? theme.hex.dark : theme.hex.light;
                return (
                  <Pressable
                    key={theme.id}
                    onPress={() => setAccentTheme(theme.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${theme.label} accent`}
                    className="items-center gap-1.5"
                    style={{ width: 56 }}>
                    <View
                      className={cn(
                        'h-10 w-10 items-center justify-center rounded-full border-2',
                        selected ? 'border-foreground' : 'border-transparent',
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
          </View>
        </Card>

        <SectionLabel className="mt-6">Exercise media</SectionLabel>
        <Card>
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
          <View className="h-px bg-border/60" />
          <ListRow
            icon={<Icon icon={Timer} size={18} color="muted-foreground" />}
            title="Illustration motion"
            subtitle="Cycle frames like an animation, or hold one pose">
            <View className="flex-row gap-2">
              <Chip label="Cycle" selected={exerciseMediaAnimation === 'cycle'} onPress={() => setExerciseMediaAnimation('cycle')} />
              <Chip label="Static" selected={exerciseMediaAnimation === 'static'} onPress={() => setExerciseMediaAnimation('static')} />
            </View>
          </ListRow>
          <Caption className="pb-3 pt-1 text-2xs">
            Illustrations by Bryl Lim / Everkinetic · CC BY-SA 4.0
          </Caption>
        </Card>

        <SectionLabel className="mt-6">Haptics</SectionLabel>
        <Card>
          <ListRow icon={<Icon icon={Vibrate} size={18} color="muted-foreground" />} title="Haptics" subtitle="Subtle vibration feedback">
            <Switch value={hapticsEnabled} onValueChange={setHaptics} accessibilityLabel="Haptics" />
          </ListRow>
        </Card>

        <SectionLabel className="mt-6">Calendar</SectionLabel>
        <Card>
          <ListRow stacked
            icon={<Icon icon={METRIC_ICONS.sessions} size={18} color="muted-foreground" />}
            title="Month day color"
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
                <Chip
                  key={opt.id}
                  size="sm"
                  label={opt.label}
                  selected={calendarHeatMetric === opt.id}
                  onPress={() => setCalendarHeatMetric(opt.id)}
                />
              ))}
            </View>
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow
            icon={<Icon icon={CalendarDays} size={18} color="muted-foreground" />}
            title="Week starts on"
            subtitle="Calendar grids and day headers">
            <View className="flex-row gap-2">
              <Chip label="Mon" selected={weekStartsOn === 'monday'} onPress={() => setWeekStartsOn('monday')} />
              <Chip label="Sun" selected={weekStartsOn === 'sunday'} onPress={() => setWeekStartsOn('sunday')} />
            </View>
          </ListRow>
          <View className="h-px bg-border/60" />
          <ListRow stacked
            icon={<Icon icon={METRIC_ICONS.sessions} size={18} color="muted-foreground" />}
            title="Weekly workout goal"
            subtitle="Sessions per week for consistency tracking">
            <View className="flex-row flex-wrap gap-1.5">
              {[0, 3, 4, 5, 6].map((g) => (
                <Chip
                  key={g}
                  size="sm"
                  label={g === 0 ? 'Off' : `${g}×`}
                  selected={weeklyWorkoutGoal === g}
                  onPress={() => setWeeklyWorkoutGoal(g)}
                />
              ))}
            </View>
          </ListRow>
        </Card>

        <SectionLabel className="mt-6">Cloud sync</SectionLabel>
        <Card>
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
        </Card>

        <SectionLabel className="mt-6">Your data</SectionLabel>
        <Card>
          <Pressable
            onPress={() => router.push('/(app)/export' as Href)}
            accessibilityRole="button"
            accessibilityLabel="Export your data"
            className="flex-row items-center gap-3 py-3">
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
              <Icon icon={Download} size={18} color="muted-foreground" />
            </View>
            <View className="min-w-0 flex-1">
              <Body className="font-medium text-foreground">Download your data</Body>
              <Caption className="mt-0.5">Choose workouts, measurements, and format</Caption>
            </View>
            <Icon icon={ChevronRight} size={18} color="muted-foreground" />
          </Pressable>
        </Card>

        <AboutSection />

        {__DEV__ ? (
          <>
            <SectionLabel className="mt-6">Dev tools</SectionLabel>
            <Card>
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
            </Card>
          </>
        ) : null}

        <Caption className="mt-6 text-center">Incline · Built with Expo</Caption>
      </ScrollView>
    </SafeAreaView>
  );
}
