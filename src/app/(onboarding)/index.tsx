import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

import { Heading, Body, Caption, Text } from '@/components/common/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/common/initials-avatar';
import { Icon } from '@/components/common/icon';
import { useToast } from '@/components/ui/toast';
import { completeOnboarding } from '@/db/queries';
import { useSettings } from '@/store/settings-store';
import { GOAL_LABELS } from '@/lib/labels';
import type { Goal, Unit, ExperienceLevel } from '@/db/types';
import { Dumbbell, Target, ChevronRight, ChevronLeft } from 'lucide-react-native';

const GOALS: Goal[] = ['build_muscle', 'gain_strength', 'lose_fat', 'improve_endurance'];
const LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

const LEVEL_DESCRIPTIONS: Record<ExperienceLevel, string> = {
  beginner: 'New to lifting or returning after a long break',
  intermediate: 'Comfortable with compound lifts and training consistently',
  advanced: 'Experienced lifter with solid technique and progression',
};

const GOAL_ICONS: Record<Goal, typeof Dumbbell> = {
  build_muscle: Dumbbell,
  gain_strength: Target,
  lose_fat: Target,
  improve_endurance: Target,
};

const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const setUnitStore = useSettings((s) => s.setUnit);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [bodyweight, setBodyweight] = useState('');
  const [goal, setGoal] = useState<Goal>('build_muscle');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('intermediate');
  const [unit, setUnit] = useState<Unit>('metric');
  const [saving, setSaving] = useState(false);

  const next = () => {
    if (step === 0 && !name.trim()) {
      toast({ title: 'Add your name', description: 'So we can greet you on Home.', variant: 'warning' });
      return;
    }
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    }
  };

  const skip = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const finish = async () => {
    if (!name.trim()) {
      toast({ title: 'Add your name', variant: 'warning' });
      return;
    }
    setSaving(true);
    // Computed outside the try: the compiler can't lower conditionals inside one.
    const bw = parseFloat(bodyweight);
    const savedBodyweight = isNaN(bw) ? undefined : bw;
    try {
      await completeOnboarding({
        name: name.trim(),
        goal,
        unit,
        experienceLevel,
        bodyweight: savedBodyweight,
      });
      setUnitStore(unit);
      router.replace('/(app)/(tabs)');
    } catch (err) {
      console.error('ONBOARDING ERROR:', err);
      toast({ title: 'Something went wrong', variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        {/* Progress dots */}
        <View className="flex-row items-center justify-center gap-2 py-4">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              className={`h-2 rounded-full ${i === step ? 'w-6 bg-primary' : i < step ? 'w-2 bg-primary/40' : 'w-2 bg-muted'}`}
            />
          ))}
        </View>

        <View className="flex-1 px-6">
          {step === 0 && (
            <Animated.View entering={FadeIn.duration(300)} className="flex-1 justify-center">
              <View className="items-center mb-8">
                {name ? (
                  <InitialsAvatar name={name} size={80} />
                ) : (
                  <View className="h-[80px] w-[80px] items-center justify-center rounded-full bg-primary/15">
                    <Icon icon={Dumbbell} size={36} color="primary" />
                  </View>
                )}
              </View>
              <Heading className="text-center">Welcome to Incline</Heading>
              <Body className="mt-2 text-center text-muted-foreground">
                Your personal strength training companion.
              </Body>
              <View className="mt-8 gap-2">
                <Caption>Your name</Caption>
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Alex"
                  autoCapitalize="words"
                  autoFocus
                />
              </View>
            </Animated.View>
          )}

          {step === 1 && (
            <Animated.View entering={FadeInRight.duration(300)} className="flex-1 justify-center">
              <Heading className="text-center">Your stats</Heading>
              <Body className="mt-2 text-center text-muted-foreground">
                Help us personalize your experience.
              </Body>
              <View className="mt-8 gap-2">
                <Caption>Bodyweight (optional)</Caption>
                <View className="flex-row gap-2">
                  <Input
                    value={bodyweight}
                    onChangeText={setBodyweight}
                    placeholder="e.g. 80"
                    keyboardType="decimal-pad"
                    className="flex-1"
                  />
                  <View className="flex-row gap-1 rounded-xl bg-muted p-1">
                    <Pressable
                      onPress={() => setUnit('metric')}
                      className={`rounded-lg px-3 py-2 ${unit === 'metric' ? 'bg-primary' : ''}`}>
                      <Text className={unit === 'metric' ? 'text-primary-foreground' : 'text-muted-foreground'}>kg</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setUnit('imperial')}
                      className={`rounded-lg px-3 py-2 ${unit === 'imperial' ? 'bg-primary' : ''}`}>
                      <Text className={unit === 'imperial' ? 'text-primary-foreground' : 'text-muted-foreground'}>lb</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}

          {step === 2 && (
            <Animated.View entering={FadeInRight.duration(300)} className="flex-1 justify-center">
              <Heading className="text-center">Your goal</Heading>
              <Body className="mt-2 text-center text-muted-foreground">
                What are you training for?
              </Body>
              <View className="mt-8 gap-3">
                {GOALS.map((g) => {
                  const IconComp = GOAL_ICONS[g];
                  return (
                    <Pressable
                      key={g}
                      onPress={() => setGoal(g)}
                      className={`flex-row items-center gap-3 rounded-xl border-2 px-4 py-3.5 ${
                        goal === g ? 'border-primary bg-primary/10' : 'border-border bg-card'
                      }`}>
                      <Icon icon={IconComp} size={20} color={goal === g ? 'primary' : 'muted-foreground'} />
                      <Body className={`font-medium ${goal === g ? 'text-primary' : 'text-foreground'}`}>
                        {GOAL_LABELS[g]}
                      </Body>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {step === 3 && (
            <Animated.View entering={FadeInRight.duration(300)} className="flex-1 justify-center">
              <Heading className="text-center">Experience level</Heading>
              <Body className="mt-2 text-center text-muted-foreground">
                We will tailor exercise selection and progression.
              </Body>
              <View className="mt-8 gap-3">
                {LEVELS.map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => setExperienceLevel(l)}
                    className={`rounded-xl border-2 px-4 py-3.5 ${
                      experienceLevel === l ? 'border-primary bg-primary/10' : 'border-border bg-card'
                    }`}>
                    <Body className={`font-medium ${experienceLevel === l ? 'text-primary' : 'text-foreground'}`}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </Body>
                    <Caption className="mt-0.5">{LEVEL_DESCRIPTIONS[l]}</Caption>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          )}
        </View>

        {/* Navigation */}
        <View className="px-6 pb-6 pt-4">
          <View className="flex-row gap-3">
            {step > 0 ? (
              <Button variant="outline" onPress={back} leftIcon={<Icon icon={ChevronLeft} size={16} color="foreground" />}>
                Back
              </Button>
            ) : null}
            {step < TOTAL_STEPS - 1 ? (
              <>
                {/* Show Skip on optional steps (1 = bodyweight, 3 = experience) */}
                {(step === 1 || step === 3) && (
                  <Button variant="ghost" onPress={skip}>
                    Skip
                  </Button>
                )}
                <Button className="flex-1" onPress={next} rightIcon={<Icon icon={ChevronRight} size={16} color="primary-foreground" />}>
                  Continue
                </Button>
              </>
            ) : (
              <Button className="flex-1" variant="success" onPress={finish} disabled={saving}>
                {saving ? 'Setting up…' : 'Get started'}
              </Button>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
