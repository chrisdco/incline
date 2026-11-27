import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Check, Dumbbell, HeartPulse, Settings2 } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { AiMark } from '@/components/ai/ai-mark';
import { getHealthPort, HEALTH_KIND_LABEL, HEALTH_KINDS, type HealthKind } from '@/health';
import { healthSnapshotQuery, refreshHealth } from '@/health/query';
import { formatSleep, healthStatusLine, MIN_BASELINE_DAYS, type HealthSnapshot, type KindCoverage } from '@/health/readiness';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useSettings } from '@/store/settings-store';

function todayLine(s: HealthSnapshot): string {
  const parts: string[] = [];
  if (s.lastNightSleepMinutes !== null) parts.push(`Slept ${formatSleep(s.lastNightSleepMinutes)}`);
  if (s.hrv) parts.push(`HRV ${s.hrv.today} ms (usual ${s.hrv.baseline})`);
  if (s.restingHeartRate) parts.push(`Resting HR ${s.restingHeartRate.today} bpm (usual ${s.restingHeartRate.baseline})`);
  if (s.stepsToday !== null) parts.push(`${s.stepsToday.toLocaleString()} steps`);
  if (s.nutrition?.yesterday) parts.push(`Ate ${s.nutrition.yesterday.kcal.toLocaleString()} kcal, ${s.nutrition.yesterday.proteinG} g protein yesterday`);
  if (s.nutrition?.avg7d) parts.push(`7-day avg ${s.nutrition.avg7d.kcal.toLocaleString()} kcal, ${s.nutrition.avg7d.proteinG} g protein`);
  const status = healthStatusLine(s);
  if (status) parts.push(status);
  return parts.length ? parts.join(' · ') : `No readings yet today. HRV and resting HR need ${MIN_BASELINE_DAYS} days of history before we compare.`;
}

/** Per type: is it arriving, and since when. */
function arrivalLine(c: KindCoverage | undefined, k: HealthKind): string {
  if (!c || c.days === 0) return k === 'steps' ? 'Shared · no steps yet today' : k === 'nutrition' ? 'Shared · no food logged this week' : 'Shared · nothing received yet';
  if (k === 'steps') return 'Shared · arriving';
  if (k === 'nutrition') return `${c.days} ${c.days === 1 ? 'day' : 'days'} logged this week`;
  const last = c.lastAt ? new Date(c.lastAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
  const learning = c.baselineDays !== undefined && c.baselineDays < MIN_BASELINE_DAYS ? ` · learning ${c.baselineDays}/${MIN_BASELINE_DAYS}` : '';
  return `${c.days} ${c.days === 1 ? 'day' : 'days'}${last ? ` · last ${last}` : ''}${learning}`;
}

const HEALTH_CONNECT_STORE = 'market://details?id=com.google.android.apps.healthdata';

/**
 * Health Connect (HEALTH.md): opt-in reads per type, plus an optional
 * second opt-in to save finished workouts there (write, ExerciseSession). Our toggle is
 * the source of "connected"; the platform owns the permissions, so revoking
 * happens in Health Connect and every read treats "not granted" as empty.
 */
export default function HealthScreen() {
  const port = getHealthPort();
  const { toast } = useToast();
  const on = useSettings((s) => s.healthConnectEnabled);
  const inAsk = useSettings((s) => s.healthInAskEnabled);
  const aiOn = useSettings((s) => s.aiExplanationsEnabled);
  const setOn = useSettings((s) => s.setHealthConnectEnabled);
  const setInAsk = useSettings((s) => s.setHealthInAskEnabled);
  const writeOn = useSettings((s) => s.healthWriteWorkouts);
  const setWriteOn = useSettings((s) => s.setHealthWriteWorkouts);
  const [busy, setBusy] = useState(false);

  const { data: availability } = useQuery({ queryKey: ['health', 'availability'], queryFn: () => port.availability(), staleTime: 60_000 });
  const { data: snapshot } = useQuery({ ...healthSnapshotQuery, enabled: on && availability === 'available' });
  const granted = snapshot?.granted ?? [];

  const connect = async () => {
    setBusy(true);
    const got = await port.requestRead(HEALTH_KINDS);
    setBusy(false);
    if (!got.length) {
      toast({ title: 'Nothing shared', description: 'Pick at least one type in Health Connect to use it here', variant: 'warning' });
      return;
    }
    setOn(true);
    void refreshHealth();
  };

  const toggle = (next: boolean) => {
    if (next) void connect();
    else {
      setOn(false);
      setInAsk(false);
      setWriteOn(false);
    }
  };

  // Its own permission, asked only when the user turns this on.
  const toggleWrite = async (next: boolean) => {
    if (!next) {
      setWriteOn(false);
      return;
    }
    setBusy(true);
    const ok = (await port.canWriteWorkouts()) || (await port.requestWriteWorkouts());
    setBusy(false);
    if (!ok) {
      toast({ title: 'Not allowed', description: 'Allow Incline to write exercise in Health Connect to save workouts there', variant: 'warning' });
      return;
    }
    setWriteOn(true);
    toast({ title: 'Saving workouts to Health Connect', description: 'The last 30 days now, then each one you finish', variant: 'success' });
  };

  if (availability && availability !== 'available') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <ScrollView contentContainerStyle={SCREEN_CONTENT}>
          <View className="mt-4 gap-3 rounded-2xl bg-surface1 p-4">
            <Body className="font-medium text-foreground">{availability === 'needs_update' ? 'Health Connect needs an update' : 'Health Connect isn’t available'}</Body>
            <Caption>
              {availability === 'needs_update'
                ? 'Install or update the Health Connect app from Google Play, then come back.'
                : 'This needs Android with Health Connect and the latest Incline build.'}
            </Caption>
            {availability === 'needs_update' ? (
              <Button variant="outline" onPress={() => void Linking.openURL(HEALTH_CONNECT_STORE)}>
                Open Google Play
              </Button>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
        <Section title="Health Connect" className="mt-4">
          <ListGroup>
            <ListRow
              icon={<Icon icon={HeartPulse} size={18} color="muted-foreground" />}
              title="Read health data"
              subtitle="Sleep, HRV, resting heart rate and nutrition shape readiness and insights">
              <Switch value={on} disabled={busy || !availability} onValueChange={toggle} accessibilityLabel="Read health data" />
            </ListRow>
            {on ? (
              <ListRow
                icon={<Icon icon={Settings2} size={18} color="muted-foreground" />}
                title="Manage permissions"
                subtitle="Choose types or stop sharing in Health Connect"
                onPress={() => port.openSettings()}
              />
            ) : null}
          </ListGroup>
          <Caption className="mt-2 px-1">
            Read only, and it stays on this phone. Samsung Health, Fitbit and others show up here once they sync to Health Connect (in Samsung Health:
            Settings → Health Connect).
          </Caption>
        </Section>

        {on ? (
          <Section title="Shared with Incline">
            <ListGroup>
              {HEALTH_KINDS.map((k) => (
                <ListRow key={k} title={HEALTH_KIND_LABEL[k]} subtitle={granted.includes(k) ? arrivalLine(snapshot?.coverage[k], k) : 'Not shared'}>
                  {granted.includes(k) ? <Icon icon={Check} size={16} color="success" /> : null}
                </ListRow>
              ))}
            </ListGroup>
          </Section>
        ) : null}

        {on ? (
          <Section title="Save to Health">
            <ListGroup>
              <ListRow
                icon={<Icon icon={Dumbbell} size={18} color="muted-foreground" />}
                title="Save workouts"
                subtitle="Each finished workout as strength training: name, start and end. Edits and deletes follow. Sets stay in Incline.">
                <Switch value={writeOn} disabled={busy} onValueChange={(v) => void toggleWrite(v)} accessibilityLabel="Save workouts to Health Connect" />
              </ListRow>
            </ListGroup>
          </Section>
        ) : null}

        {on && snapshot ? (
          <Section title="Today">
            <View className="gap-1.5 rounded-2xl bg-surface1 px-4 py-3">
              <Caption>{todayLine(snapshot)}</Caption>
            </View>
          </Section>
        ) : null}

        {on && aiOn ? (
          <Section title="Ask">
            <ListGroup>
              <ListRow
                icon={<Icon icon={AiMark} size={18} color="muted-foreground" />}
                title="Use in Ask"
                subtitle="Daily totals only (sleep, HRV, resting HR, steps, calories and macros), sent with your question">
                <Switch value={inAsk} onValueChange={setInAsk} accessibilityLabel="Use health data in Ask" />
              </ListRow>
            </ListGroup>
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
