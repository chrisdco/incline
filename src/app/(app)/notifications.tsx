import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, CalendarDays, History, Timer, Zap } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Chip } from '@/components/common/chip';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useSettings, WORKOUT_REMINDER_TIME_PRESETS } from '@/store/settings-store';
import { SCREEN_CONTENT } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { notificationsAvailable, prepareNotifications, NOTIFICATION_CHANNELS } from '@/lib/notifications';

const WEEKDAY_CHIPS: { jsDay: number; label: string }[] = [
  { jsDay: 1, label: 'Mon' },
  { jsDay: 2, label: 'Tue' },
  { jsDay: 3, label: 'Wed' },
  { jsDay: 4, label: 'Thu' },
  { jsDay: 5, label: 'Fri' },
  { jsDay: 6, label: 'Sat' },
  { jsDay: 0, label: 'Sun' },
];

type Channel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

/** Reminders, recaps and nudges, split out of Settings. */
export default function NotificationsScreen() {
  const {
    workoutRemindersEnabled, workoutReminderDays, workoutReminderHour, workoutReminderMinute,
    weeklyDigestEnabled, weeklyDigestHour, weeklyDigestMinute,
    monthlyRecapEnabled, abandonedNudgeEnabled, streakNudgeEnabled, milestoneNudgeEnabled,
    setWorkoutRemindersEnabled, setWorkoutReminderDays, setWorkoutReminderTime,
    setWeeklyDigestEnabled, setWeeklyDigestTime,
    setMonthlyRecapEnabled, setAbandonedNudgeEnabled, setStreakNudgeEnabled, setMilestoneNudgeEnabled,
  } = useSettings();
  const { toast } = useToast();

  /** Turning a toggle on asks for permission on its channel first. */
  const gate = async (next: boolean, set: (v: boolean) => void, channel: Channel, feature: string, what: string) => {
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
    const mod = await prepareNotifications(channel);
    if (!mod) {
      toast({ title: 'Permission needed', description: `Allow notifications to ${what}`, variant: 'warning' });
      return;
    }
    set(true);
  };
  const digestGate = (next: boolean, set: (v: boolean) => void, feature: string) =>
    void gate(next, set, NOTIFICATION_CHANNELS.digests, feature, `enable ${feature.toLowerCase()}`);

  const toggleReminderDay = (jsDay: number) => {
    const has = workoutReminderDays.includes(jsDay);
    if (has && workoutReminderDays.length === 1) {
      toast({ title: 'Keep at least one day', variant: 'warning' });
      return;
    }
    setWorkoutReminderDays(has ? workoutReminderDays.filter((d) => d !== jsDay) : [...workoutReminderDays, jsDay]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
        <Section title="Reminders" className="mt-4">
          <ListGroup>
            <ListRow
              icon={<Icon icon={Bell} size={18} color="muted-foreground" />}
              title="Workout reminders"
              subtitle="Local weekly alerts on the days you choose">
              <Switch
                value={workoutRemindersEnabled}
                onValueChange={(v) =>
                  void gate(v, setWorkoutRemindersEnabled, NOTIFICATION_CHANNELS.workoutReminders, 'Reminders', 'schedule workout reminders')
                }
                accessibilityLabel="Workout reminders"
              />
            </ListRow>
            {workoutRemindersEnabled ? (
              <ListRow stacked icon={<Icon icon={CalendarDays} size={18} color="muted-foreground" />} title="Days" subtitle="Tap to include or remove">
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
            ) : null}
            {workoutRemindersEnabled ? (
              <ListRow stacked icon={<Icon icon={Timer} size={18} color="muted-foreground" />} title="Time" subtitle="Same time each selected day">
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
            ) : null}
          </ListGroup>
        </Section>

        <Section title="Recaps">
          <ListGroup>
            <ListRow
              icon={<Icon icon={METRIC_ICONS.sessions} size={18} color="muted-foreground" />}
              title="Sunday digest"
              subtitle="Optional local alert with your week summary">
              <Switch
                value={weeklyDigestEnabled}
                onValueChange={(v) =>
                  void gate(v, setWeeklyDigestEnabled, NOTIFICATION_CHANNELS.digests, 'Digests', 'schedule the weekly digest')
                }
                accessibilityLabel="Sunday weekly digest"
              />
            </ListRow>
            {weeklyDigestEnabled ? (
              <ListRow stacked icon={<Icon icon={Timer} size={18} color="muted-foreground" />} title="Time" subtitle="Fires every Sunday">
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
            ) : null}
            <ListRow
              icon={<Icon icon={CalendarDays} size={18} color="muted-foreground" />}
              title="Monthly recap"
              subtitle="1st of the month, same time as the digest">
              <Switch
                value={monthlyRecapEnabled}
                onValueChange={(v) => digestGate(v, setMonthlyRecapEnabled, 'Monthly recaps')}
                accessibilityLabel="Monthly recap"
              />
            </ListRow>
          </ListGroup>
        </Section>

        <Section title="Nudges">
          <ListGroup>
            <ListRow
              icon={<Icon icon={History} size={18} color="muted-foreground" />}
              title="Abandoned session"
              subtitle="One ping if a workout sits idle 25+ min">
              <Switch
                value={abandonedNudgeEnabled}
                onValueChange={(v) => digestGate(v, setAbandonedNudgeEnabled, 'Session nudges')}
                accessibilityLabel="Abandoned session nudge"
              />
            </ListRow>
            <ListRow
              icon={<Icon icon={METRIC_ICONS.streak} size={18} color="muted-foreground" />}
              title="Streak at risk"
              subtitle="One late-week ping when a streak has no session yet">
              <Switch
                value={streakNudgeEnabled}
                onValueChange={(v) => digestGate(v, setStreakNudgeEnabled, 'Streak nudges')}
                accessibilityLabel="Streak at risk nudge"
              />
            </ListRow>
            <ListRow
              icon={<Icon icon={Zap} size={18} color="muted-foreground" />}
              title="Milestones"
              subtitle="Congrats ping for newly unlocked achievements">
              <Switch
                value={milestoneNudgeEnabled}
                onValueChange={(v) => digestGate(v, setMilestoneNudgeEnabled, 'Milestone nudges')}
                accessibilityLabel="Milestone nudges"
              />
            </ListRow>
          </ListGroup>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
