import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

import { Heading, Body, Caption } from '@/components/common/text';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/common/segmented-control';
import { SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/common/initials-avatar';
import { Icon } from '@/components/common/icon';
import { useToast } from '@/components/ui/toast';
import { BrandFade, InclineMark } from '@/components/brand/incline-mark';
import { INCLINE_AI_PROCESSORS, useAiConsent } from '@/ai/consent';
import { completeOnboarding } from '@/db/queries';
import { useSettings } from '@/store/settings-store';
import { GOAL_LABELS } from '@/lib/labels';
import type { Goal, Unit, ExperienceLevel } from '@/db/types';
import { Ban, Dumbbell, Target, ChevronRight, ChevronLeft, Check, Send, Settings2, Sparkles } from 'lucide-react-native';
import { displayToKg } from '@/lib/units';

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

const TOTAL_STEPS = 5;

/** The AI step's disclosure (App Store 5.1.2(i)): what is sent, to whom, and how to change it. */
const AI_POINTS = [
  { icon: Send, text: `Only what an answer needs (workouts, routines, records) goes to Incline AI, processed by ${INCLINE_AI_PROCESSORS.join(' and ')}.` },
  { icon: Ban, text: 'Never your email, account details, photos or passwords.' },
  { icon: Settings2, text: 'Off until you choose. Change it any time in Settings → AI.' },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const setUnitStore = useSettings((s) => s.setUnit);
  const setAiEnabled = useSettings((s) => s.setAiExplanationsEnabled);
  const setConsent = useAiConsent((s) => s.set);
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

  const finish = async (withAi: boolean) => {
    if (!name.trim()) {
      toast({ title: 'Add your name', variant: 'warning' });
      return;
    }
    setSaving(true);
    // Computed outside the try: the compiler can't lower conditionals inside one.
    const bw = parseFloat(bodyweight);
    // Typed in the chosen unit; profile stores canonical kg.
    const savedBodyweight = isNaN(bw) ? undefined : displayToKg(bw, unit);
    try {
      await completeOnboarding({
        name: name.trim(),
        goal,
        unit,
        experienceLevel,
        bodyweight: savedBodyweight,
      });
      setUnitStore(unit);
      // Accepting here is the consent screen's 'Allow Incline AI' plus the AI switch, in one tap.
      if (withAi) {
        setConsent({ kind: 'incline' }, true);
        setAiEnabled(true);
      }
      router.replace('/(app)/(tabs)');
    } catch (err) {
      console.error('ONBOARDING ERROR:', err);
      toast({ title: 'Something went wrong', variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <BrandFade />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="items-center pt-4">
          <InclineMark size={step === 0 ? 72 : 40} />
        </View>
        {/* Progress dots + step count */}
        <View className="flex-row items-center justify-center gap-2 pt-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              className={`h-2 rounded-full ${i === step ? 'w-6 bg-primary' : i < step ? 'w-2 bg-primary/40' : 'w-2 bg-muted'}`}
            />
          ))}
        </View>
        <Caption className="mt-2 text-center text-xs">Step {step + 1} of {TOTAL_STEPS}</Caption>

        <View className="flex-1 px-6">
          {step === 0 && (
            <Animated.View entering={FadeIn.duration(300)} className="flex-1 pt-8">
              {name ? (
                <View className="mb-6 items-center">
                  <InitialsAvatar name={name} size={64} />
                </View>
              ) : null}
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
            <Animated.View entering={FadeInRight.duration(300)} className="flex-1 pt-10">
              <Heading className="text-center">Units &amp; stats</Heading>
              <Body className="mt-2 text-center text-muted-foreground">
                Help us personalize your experience.
              </Body>
              <View className="mt-8 gap-2">
                <SectionLabel>Weigh in</SectionLabel>
                <SegmentedControl<Unit>
                  values={[
                    { value: 'metric', label: 'Kilograms' },
                    { value: 'imperial', label: 'Pounds' },
                  ]}
                  value={unit}
                  onChange={setUnit}
                />
                <Caption className="px-1">You can switch any single exercise later, e.g. lb for dumbbells.</Caption>
              </View>
              <View className="mt-6 gap-2">
                <SectionLabel>Bodyweight · optional</SectionLabel>
                <Input
                  value={bodyweight}
                  onChangeText={setBodyweight}
                  placeholder={unit === 'metric' ? 'e.g. 80 kg' : 'e.g. 175 lb'}
                  keyboardType="decimal-pad"
                />
              </View>
            </Animated.View>
          )}

          {step === 2 && (
            <Animated.View entering={FadeInRight.duration(300)} className="flex-1 pt-10">
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
                      accessibilityRole="radio"
                      accessibilityState={{ checked: goal === g }}
                      className={`flex-row items-center gap-3 rounded-2xl border-2 px-4 py-4 ${
                        goal === g ? 'border-primary bg-primary/15' : 'border-transparent bg-surface1'
                      }`}>
                      <Icon icon={IconComp} size={20} color={goal === g ? 'primary' : 'muted-foreground'} />
                      <Body className={`flex-1 font-medium ${goal === g ? 'text-primary-text' : 'text-foreground'}`}>
                        {GOAL_LABELS[g]}
                      </Body>
                      {goal === g ? <Icon icon={Check} size={18} color="primary" /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {step === 3 && (
            <Animated.View entering={FadeInRight.duration(300)} className="flex-1 pt-10">
              <Heading className="text-center">Experience level</Heading>
              <Body className="mt-2 text-center text-muted-foreground">
                We will tailor exercise selection and progression.
              </Body>
              <View className="mt-8 gap-3">
                {LEVELS.map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => setExperienceLevel(l)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: experienceLevel === l }}
                    className={`rounded-2xl border-2 px-4 py-4 ${
                      experienceLevel === l ? 'border-primary bg-primary/15' : 'border-transparent bg-surface1'
                    }`}>
                    <Body className={`font-medium ${experienceLevel === l ? 'text-primary-text' : 'text-foreground'}`}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </Body>
                    <Caption className="mt-0.5">{LEVEL_DESCRIPTIONS[l]}</Caption>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          )}

          {step === 4 && (
            <Animated.View entering={FadeInRight.duration(300)} className="flex-1 pt-10">
              <View className="items-center">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                  <Icon icon={Sparkles} size={26} color="primary" />
                </View>
              </View>
              <Heading className="mt-4 text-center">Coaching with AI</Heading>
              <Body className="mt-2 text-center text-muted-foreground">
                Ask about your training, get plans built and changes explained in plain words.
              </Body>
              <View className="mt-8 gap-4 rounded-2xl bg-surface1 p-4">
                {AI_POINTS.map((p) => (
                  <View key={p.text} className="flex-row items-start gap-3">
                    <Icon icon={p.icon} size={18} color="muted-foreground" />
                    <Caption className="min-w-0 flex-1">{p.text}</Caption>
                  </View>
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
              <>
                <Button variant="ghost" onPress={() => void finish(false)} disabled={saving}>
                  Not now
                </Button>
                <Button className="flex-1" variant="success" onPress={() => void finish(true)} disabled={saving}>
                  {saving ? 'Setting up…' : 'Turn on AI'}
                </Button>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
