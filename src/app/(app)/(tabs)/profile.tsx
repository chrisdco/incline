import { useState } from 'react';
import { Pressable, ScrollView, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useAppAuth } from '@/auth/use-app-auth';
import { isDevAuthBypassEnabled } from '@/lib/env';
import * as ImagePicker from 'expo-image-picker';
import { documentDirectory, makeDirectoryAsync, copyAsync } from 'expo-file-system/legacy';
import {
  Settings as SettingsIcon,
  Pencil,
  Dumbbell,
  Ruler,
  Calendar,
  Camera,
  Calculator,
  Trophy,
  UserX,
  FlaskConical,
} from 'lucide-react-native';
import { SignOutRow } from '@/components/account/sign-out-row';
import { Icon } from '@/components/common/icon';

import { Heading, Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatCard } from '@/components/common/stat-card';
import { Card } from '@/components/ui/card';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { InitialsAvatar } from '@/components/common/initials-avatar';
import { PhotoPeek } from '@/components/common/photo-peek';
import { useProfile, useProgressStats } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { useToast } from '@/components/ui/toast';
import { saveProfile, resetUserData } from '@/db/queries';
import { requestDeletion } from '@/lib/account-deletion';
import { ACCOUNT_DELETION_ENABLED } from '@/constants/config';
import { useActiveWorkout } from '@/store/active-workout-store';
import { resetAiSettings } from '@/ai/byok';
import { GOAL_LABELS } from '@/lib/labels';
import { formatVolume } from '@/db/calc';
import { SCREEN_HEADER } from '@/lib/layout';
import { useTabScreenContent } from '@/hooks/use-tab-content-inset';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { evaluateAchievements } from '@/lib/achievements';

export default function ProfileScreen() {
  const router = useRouter();
  const screenContent = useTabScreenContent();
  const { toast } = useToast();
  const unit = useSettings((s) => s.unit);
  const { data: profile, refetch } = useProfile();
  const { data: stats } = useProgressStats();
  const { signOut, userId, getToken } = useAppAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [peek, setPeek] = useState(false);

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const dir = `${documentDirectory}avatars/`;
    await makeDirectoryAsync(dir, { intermediates: true });
    const filename = `avatar_${Date.now()}.jpg`;
    const localUri = `${dir}${filename}`;
    await copyAsync({ from: asset.uri, to: localUri });

    await saveProfile({ avatarUrl: localUri });
    refetch();
    toast({ title: 'Profile photo updated', variant: 'success' });
  };

  const deleteAccount = async () => {
    if (!userId || deleting) return;
    setDeleting(true);
    // Schedule server-side first: if this throws, nothing local is touched.
    try {
      await requestDeletion(userId, getToken);
    } catch {
      toast({ title: 'Could not schedule deletion', variant: 'destructive' });
      setDeleting(false);
      return;
    }
    // Wipe-then-exit runs even if the wipe itself throws: the server already
    // scheduled, so staying signed in with partial data is the worse outcome.
    // Next login lands on the scheduled screen either way.
    try {
      await resetUserData();
    } catch (err) {
      console.warn('[profile] local wipe incomplete after scheduled deletion', err);
    }
    useActiveWorkout.getState().clear();
    await resetAiSettings().catch(() => undefined);
    setDeleteOpen(false);
    setDeleting(false);
    try {
      await signOut();
    } catch {
      // Clerk sign-out is best-effort here; the gate re-routes regardless.
    }
    router.replace('/(auth)/sign-in' as Href);
  };

  const achievements = evaluateAchievements(stats, unit);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={screenContent}>
        <View className={`${SCREEN_HEADER} flex-row items-center justify-between px-0`}>
          <Heading>Profile</Heading>
          <Pressable
            onPress={() => router.push('/(app)/settings')}
            className="h-10 w-10 items-center justify-center rounded-full bg-muted"
            accessibilityRole="button"
            accessibilityLabel="Settings">
            <Icon icon={SettingsIcon} size={20} color="foreground" />
          </Pressable>
        </View>

        {/* Neutral card: the avatar carries the colour, not an accent wash (SYSTEM.md §4). */}
        <Card className="mt-2">
            <View>
              <View className="flex-row items-start gap-4">
                <Pressable
                  onPress={pickAvatar}
                  onLongPress={profile?.avatarUrl ? () => setPeek(true) : undefined}
                  delayLongPress={300}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  accessibilityHint={profile?.avatarUrl ? 'Long press to view it' : undefined}
                  className="relative">
                  <InitialsAvatar name={profile?.name ?? ''} uri={profile?.avatarUrl} size={64} />
                  <View className="absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full border-2 border-surface1 bg-surface3">
                    <Icon icon={Camera} size={12} color="foreground" />
                  </View>
                </Pressable>
                <View className="flex-1 pt-1">
                  <Body className="text-lg font-bold text-foreground">
                    {profile?.name?.trim() || 'Athlete'}
                  </Body>
                  <Caption className="mt-0.5">
                    {profile?.goal ? GOAL_LABELS[profile.goal] : 'Set your goal'}
                  </Caption>
                </View>
              </View>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                leftIcon={<Icon icon={Pencil} size={14} color="muted-foreground" />}
                onPress={() => router.push('/(app)/edit-profile' as Href)}>
                Edit profile
              </Button>
            </View>
        </Card>

        <View className="mt-6 flex-row gap-3">
          <StatCard label="Sessions" value={stats?.totalSessions ?? 0} icon={<Icon icon={METRIC_ICONS.sessions} size={16} color="muted-foreground" />} />
          <StatCard label="Volume" value={formatVolume(stats?.totalVolume ?? 0, unit)} icon={<Icon icon={METRIC_ICONS.volume} size={16} color="muted-foreground" />} />
          <StatCard label="Sets" value={stats?.totalSets ?? 0} icon={<Icon icon={METRIC_ICONS.sets} size={16} color="muted-foreground" />} />
        </View>

        {/* One grouped list, not a card per link. Statistics lives in the
            Progress tab; backup and clearing history live in Settings. */}
        <Section title="Training">
          <ListGroup>
            <ListRow
              icon={<Icon icon={Trophy} size={18} color="muted-foreground" />}
              title="Milestones"
              subtitle={`${unlockedCount}/${achievements.length} unlocked`}
              onPress={() => router.push('/(app)/milestones' as Href)}
            />
            <ListRow
              icon={<Icon icon={Dumbbell} size={18} color="muted-foreground" />}
              title="Exercises"
              onPress={() => router.push('/(app)/exercises' as Href)}
            />
            <ListRow
              icon={<Icon icon={Ruler} size={18} color="muted-foreground" />}
              title="Measurements"
              onPress={() => router.push('/(app)/measurements' as Href)}
            />
            <ListRow
              icon={<Icon icon={Calendar} size={18} color="muted-foreground" />}
              title="Calendar"
              onPress={() => router.push('/(app)/calendar' as Href)}
            />
            <ListRow
              icon={<Icon icon={Calculator} size={18} color="muted-foreground" />}
              title="Calculators"
              subtitle="1RM and plates"
              onPress={() => router.push('/(app)/calculators' as Href)}
            />
          </ListGroup>
        </Section>

        {/* Hidden under the dev auth bypass: stub sign-out is a noop and the
            gate would bounce straight back into the app. */}
        {!isDevAuthBypassEnabled() ? (
          <Section title="Account">
            <ListGroup>
              {ACCOUNT_DELETION_ENABLED ? (
                <ListRow
                  icon={<Icon icon={UserX} size={18} color="destructive" />}
                  title="Delete account"
                  subtitle="30-day undo window"
                  tone="destructive"
                  onPress={() => setDeleteOpen(true)}
                />
              ) : null}
              <SignOutRow />
            </ListGroup>
          </Section>
        ) : null}

        {__DEV__ ? (
          <Section title="Dev tools">
            <ListGroup>
              <ListRow
                icon={<Icon icon={FlaskConical} size={18} color="muted-foreground" />}
                title="Reset logs and profile"
                subtitle="Routines kept">
                <Button
                  variant="outline"
                  size="sm"
                  onPress={async () => {
                    await resetUserData();
                    Alert.alert('Done', 'Logs, bodyweight, and profile cleared. Routines kept.');
                    router.replace('/(onboarding)');
                  }}>
                  Reset
                </Button>
              </ListRow>
            </ListGroup>
          </Section>
        ) : null}
      </ScrollView>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}
        title="Delete your account?"
        description="This schedules deletion of all workouts, measurements, routines and photos in 30 days. This device is wiped now; signing back in before the purge cancels it and restores everything. Export first — purged data cannot be recovered."
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteOpen(false)} disabled={deleting}>Keep</Button>
            <Button variant="destructive" onPress={() => { void deleteAccount(); }} disabled={deleting} loading={deleting}>Delete</Button>
          </>
        }
      />
      <PhotoPeek uri={profile?.avatarUrl} open={peek} onClose={() => setPeek(false)} />
    </SafeAreaView>
  );
}
