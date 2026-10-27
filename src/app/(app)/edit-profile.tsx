import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { documentDirectory, makeDirectoryAsync, copyAsync } from 'expo-file-system/legacy';
import { ArrowLeft, Camera } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/common/chip';
import { InitialsAvatar } from '@/components/common/initials-avatar';
import { useProfile } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { displayToKg, kgToInput } from '@/lib/units';
import { useToast } from '@/components/ui/toast';
import { saveProfile } from '@/db/queries';
import { EXPERIENCE_LABELS, GOAL_LABELS } from '@/lib/labels';
import { SCREEN_CONTENT } from '@/lib/layout';
import type { ExperienceLevel, Goal } from '@/db/types';

const GOALS: Goal[] = ['build_muscle', 'gain_strength', 'lose_fat', 'improve_endurance'];
const LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

export default function EditProfileScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const unit = useSettings((s) => s.unit);
  const { data: profile, refetch } = useProfile();

  const [name, setName] = useState('');
  const [goal, setGoal] = useState<Goal>('build_muscle');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('intermediate');
  const [bodyweight, setBodyweight] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setGoal(profile.goal ?? 'build_muscle');
    setExperienceLevel(profile.experienceLevel ?? 'intermediate');
    setBodyweight(profile.bodyweight != null ? String(kgToInput(profile.bodyweight, unit)) : '');
    setAvatarUrl(profile.avatarUrl);
  }, [profile, unit]);

  const pickAvatar = useCallback(async () => {
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
    setAvatarUrl(localUri);
  }, []);

  const save = async () => {
    setSaving(true);
    // Computed outside the try: the compiler can't lower conditionals inside one.
    const bw = bodyweight.trim() ? parseFloat(bodyweight.replace(',', '.')) : null;
    // Typed in the display unit; profile stores canonical kg.
    const savedBodyweight = Number.isFinite(bw as number) ? displayToKg(bw as number, unit) : null;
    try {
      await saveProfile({
        name: name.trim(),
        goal,
        experienceLevel,
        bodyweight: savedBodyweight,
        avatarUrl,
      });
      refetch();
      toast({ title: 'Profile updated', variant: 'success' });
      router.back();
    } catch {
      toast({ title: 'Could not save profile', variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Edit profile</Body>
        <View className="w-8" />
      </View>

      <ScrollView
        contentContainerStyle={SCREEN_CONTENT}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View className="items-center py-4">
          <Pressable onPress={pickAvatar} accessibilityRole="button" accessibilityLabel="Change profile photo" className="relative">
            <InitialsAvatar name={name || profile?.name || ''} uri={avatarUrl} size={96} />
            <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full bg-primary">
              <Icon icon={Camera} size={14} color="primary-foreground" />
            </View>
          </Pressable>
          <Caption className="mt-3">Tap to change photo</Caption>
        </View>

        <View className="gap-5">
          <View className="gap-1.5">
            <Caption>Name</Caption>
            <Input value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          </View>

          <View className="gap-1.5">
            <Caption>Goal</Caption>
            <View className="flex-row flex-wrap gap-2">
              {GOALS.map((g) => (
                <Chip key={g} label={GOAL_LABELS[g]} selected={goal === g} onPress={() => setGoal(g)} />
              ))}
            </View>
          </View>

          <View className="gap-1.5">
            <Caption>Experience</Caption>
            <View className="flex-row flex-wrap gap-2">
              {LEVELS.map((level) => (
                <Chip
                  key={level}
                  label={EXPERIENCE_LABELS[level]}
                  selected={experienceLevel === level}
                  onPress={() => setExperienceLevel(level)}
                />
              ))}
            </View>
          </View>

          <View className="gap-1.5">
            <Caption>Bodyweight ({unit === 'metric' ? 'kg' : 'lb'})</Caption>
            <Input
              value={bodyweight}
              onChangeText={setBodyweight}
              placeholder="Optional"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <Button className="mt-8" onPress={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
