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
  ChevronRight,
  Trash2,
  Info,
  Dumbbell,
  BarChart3,
  Ruler,
  Calendar,
  LogOut,
  Camera,
  Calculator,
  Weight,
  Trophy,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/common/icon';

import { Heading, Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatCard } from '@/components/common/stat-card';
import { InitialsAvatar } from '@/components/common/initials-avatar';
import { useProfile, useProgressStats } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { useToast } from '@/components/ui/toast';
import { saveProfile, clearWorkoutHistory, resetUserData } from '@/db/queries';
import { requestDeletion } from '@/lib/account-deletion';
import { ACCOUNT_DELETION_ENABLED } from '@/constants/config';
import { useActiveWorkout } from '@/store/active-workout-store';
import { GOAL_LABELS } from '@/lib/labels';
import { formatVolume } from '@/db/calc';
import { SCREEN_CONTENT, SCREEN_HEADER } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { hexToRgba, usePrimaryHex } from '@/lib/theme';
import { evaluateAchievements } from '@/lib/achievements';

export default function ProfileScreen() {
  const router = useRouter();
  const primary = usePrimaryHex();
  const { toast } = useToast();
  const { unit } = useSettings();
  const { data: profile, refetch } = useProfile();
  const { data: stats, refetch: refetchStats } = useProgressStats();
  const { signOut, userId, getToken } = useAppAuth();
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const clearHistory = async () => {
    setClearOpen(false);
    await clearWorkoutHistory();
    refetchStats();
    toast({ title: 'Workout history cleared', variant: 'info' });
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
    } finally {
      useActiveWorkout.getState().clear();
      setDeleteOpen(false);
      setDeleting(false);
      try {
        await signOut();
      } catch {
        // Clerk sign-out is best-effort here; the gate re-routes regardless.
      }
      router.replace('/(auth)/sign-in' as Href);
    }
  };

  const achievements = evaluateAchievements(stats);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
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

        <View className="mt-2 overflow-hidden rounded-3xl">
          <LinearGradient
            colors={[hexToRgba(primary, 0.14), hexToRgba(primary, 0.02)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View className="p-4">
              <View className="flex-row items-start gap-4">
                <Pressable onPress={pickAvatar} accessibilityRole="button" accessibilityLabel="Change profile photo" className="relative">
                  <InitialsAvatar name={profile?.name ?? ''} uri={profile?.avatarUrl} size={80} />
                  <View className="absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full bg-primary">
                    <Icon icon={Camera} size={12} color="primary-foreground" />
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
          </LinearGradient>
        </View>

        <View className="mt-6 flex-row gap-3">
          <StatCard label="Sessions" value={stats?.totalSessions ?? 0} icon={<Icon icon={METRIC_ICONS.sessions} size={16} color="muted-foreground" />} />
          <StatCard label="Volume" value={formatVolume(stats?.totalVolume ?? 0, unit)} icon={<Icon icon={METRIC_ICONS.volume} size={16} color="info" />} />
          <StatCard label="Sets" value={stats?.totalSets ?? 0} icon={<Icon icon={METRIC_ICONS.sets} size={16} color="muted-foreground" />} />
        </View>

        <Pressable
          onPress={() => router.push('/(app)/milestones' as Href)}
          accessibilityRole="button"
          accessibilityLabel="Open milestones"
          className="mt-6">
          <View className="flex-row items-center justify-between rounded-3xl bg-card p-4">
            <View className="flex-row items-center gap-3">
              <Icon icon={Trophy} size={20} color="primary" />
              <View>
                <Body className="font-semibold text-foreground">Milestones</Body>
                <Caption className="mt-0.5">
                  {unlockedCount}/{achievements.length} unlocked
                </Caption>
              </View>
            </View>
            <Icon icon={ChevronRight} size={18} color="muted-foreground" />
          </View>
        </Pressable>

        <Caption className="mb-3 mt-6">Dashboard</Caption>
        <View className="flex-row gap-3">
          <Pressable onPress={() => router.push('/(app)/(tabs)/progress')} accessibilityRole="button" accessibilityLabel="Statistics" className="flex-1 flex-row items-center gap-3 rounded-3xl bg-card p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={BarChart3} size={20} color="muted-foreground" />
            <Body className="font-medium text-foreground">Statistics</Body>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/exercises' as Href)} accessibilityRole="button" accessibilityLabel="Exercises" className="flex-1 flex-row items-center gap-3 rounded-3xl bg-card p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Dumbbell} size={20} color="muted-foreground" />
            <Body className="font-medium text-foreground">Exercises</Body>
          </Pressable>
        </View>
        <View className="mt-3 flex-row gap-3">
          <Pressable onPress={() => router.push('/(app)/bodyweight' as Href)} accessibilityRole="button" accessibilityLabel="Measurements" className="flex-1 flex-row items-center gap-3 rounded-3xl bg-card p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Ruler} size={20} color="muted-foreground" />
            <Body className="font-medium text-foreground">Measures</Body>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/calendar' as Href)} accessibilityRole="button" accessibilityLabel="Calendar" className="flex-1 flex-row items-center gap-3 rounded-3xl bg-card p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Calendar} size={20} color="muted-foreground" />
            <Body className="font-medium text-foreground">Calendar</Body>
          </Pressable>
        </View>

        <Caption className="mb-3 mt-6">Tools</Caption>
        <View className="flex-row gap-3">
          <Pressable onPress={() => router.push('/(app)/calculator' as Href)} accessibilityRole="button" accessibilityLabel="1RM calculator" className="flex-1 flex-row items-center gap-3 rounded-3xl bg-card p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Calculator} size={20} color="muted-foreground" />
            <Body className="font-medium text-foreground">1RM Calc</Body>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/plate-calculator' as Href)} accessibilityRole="button" accessibilityLabel="Plate calculator" className="flex-1 flex-row items-center gap-3 rounded-3xl bg-card p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Weight} size={20} color="muted-foreground" />
            <Body className="font-medium text-foreground">Plates</Body>
          </Pressable>
        </View>

        <View className="mt-6 gap-2">
          <Pressable onPress={() => setClearOpen(true)} accessibilityRole="button" accessibilityLabel="Clear workout history" className="flex-row items-center gap-3 rounded-3xl border border-destructive/20 bg-destructive/10 p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Trash2} size={20} color="destructive" />
            <Body className="flex-1 font-medium text-foreground">Clear workout history</Body>
            <Icon icon={ChevronRight} size={18} color="muted-foreground" />
          </Pressable>

          {!isDevAuthBypassEnabled() && ACCOUNT_DELETION_ENABLED && (
          <Pressable onPress={() => setDeleteOpen(true)} accessibilityRole="button" accessibilityLabel="Delete account" className="flex-row items-center gap-3 rounded-3xl bg-card p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={LogOut} size={20} color="destructive" />
            <View className="flex-1">
              <Body className="font-medium text-destructive">Delete account</Body>
              <Caption>30-day undo window</Caption>
            </View>
            <Icon icon={ChevronRight} size={18} color="muted-foreground" />
          </Pressable>
          )}

          <View className="flex-row items-center gap-3 rounded-3xl bg-card p-4">
            <Icon icon={Info} size={20} color="muted-foreground" />
            <View className="flex-1">
              <Body className="font-medium text-foreground">About Incline</Body>
              <Caption>Version 1.0.0</Caption>
            </View>
          </View>

          {__DEV__ && (
            <View className="mt-4 gap-2 rounded-3xl border border-dashed border-border p-4">
              <Caption className="mb-1 font-semibold">Dev Tools</Caption>
              <Button variant="outline" size="sm" onPress={async () => {
                const { resetUserData } = await import('@/db/queries');
                await resetUserData();
                Alert.alert('Done', 'Logs, bodyweight, and profile cleared. Routines kept.');
                router.replace('/(onboarding)');
              }}>
                Clear Logs &amp; Reset Profile
              </Button>
            </View>
          )}

          {/* Hidden under the dev auth bypass: stub sign-out is a noop and the
              gate would bounce straight back into the app. */}
          {!isDevAuthBypassEnabled() && (
          <Pressable onPress={async () => { await signOut(); router.replace('/(auth)/sign-in' as Href); }} accessibilityRole="button" accessibilityLabel="Sign out" className="flex-row items-center gap-3 rounded-3xl bg-card p-4" android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={LogOut} size={20} color="muted-foreground" />
            <Body className="flex-1 font-medium text-foreground">Sign out</Body>
          </Pressable>
          )}
        </View>
      </ScrollView>

      <Dialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all history?"
        description="This permanently deletes every completed workout. This cannot be undone."
        footer={
          <>
            <Button variant="outline" onPress={() => setClearOpen(false)}>Cancel</Button>
            <Button variant="destructive" onPress={clearHistory}>Delete</Button>
          </>
        }
      />

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
    </SafeAreaView>
  );
}
