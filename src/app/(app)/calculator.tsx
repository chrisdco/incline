import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Dumbbell, Repeat } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption, Hero } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { NumberStepper } from '@/components/workout/number-stepper';
import { useSettings } from '@/store/settings-store';
import { estimated1RM } from '@/db/calc';
import { SCREEN_CONTENT } from '@/lib/layout';

const TARGET_REPS = [1, 2, 3, 5, 8, 10, 12];

export default function OneRMCalculatorScreen() {
  const router = useRouter();
  const unit = useSettings((s) => s.unit);
  const [weight, setWeight] = useState(60);
  const [reps, setReps] = useState(5);

  const oneRM = estimated1RM(weight, reps);
  const unitSuffix = unit === 'metric' ? 'kg' : 'lb';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">1RM Calculator</Body>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 40 }}>
        <Hero className="mt-2">Estimate your max</Hero>
        <Caption className="mt-1 text-muted-foreground">
          Enter a weight you can lift for a known number of reps to estimate your one-rep max (Epley formula).
        </Caption>

        <View className="mt-6 flex-row gap-3">
          <View className="flex-1 items-center rounded-2xl bg-card p-4">
            <Caption className="mb-3">Weight ({unitSuffix})</Caption>
            <NumberStepper value={weight} onChange={setWeight} step={2.5} suffix={unitSuffix} decimals={1} />
          </View>
          <View className="flex-1 items-center rounded-2xl bg-card p-4">
            <Caption className="mb-3">Reps</Caption>
            <NumberStepper value={reps} onChange={setReps} step={1} min={1} suffix="reps" />
          </View>
        </View>

        <View className="mt-6 items-center rounded-3xl bg-primary/10 p-6">
          <Caption className="text-primary">Estimated 1RM</Caption>
          <Hero className="mt-1 text-primary">
            {oneRM > 0 ? `${Number.isInteger(oneRM) ? oneRM : oneRM.toFixed(1)} ${unitSuffix}` : '—'}
          </Hero>
          <Caption className="mt-1 text-muted-foreground">
            {weight} {unitSuffix} × {reps} reps
          </Caption>
        </View>

        <Caption className="mt-8 mb-3 text-base font-semibold text-foreground">Estimated max by rep range</Caption>
        <View className="overflow-hidden rounded-2xl bg-card">
          {TARGET_REPS.map((r, i) => {
            const max = r === 1 ? oneRM : oneRM / (1 + r / 30);
            return (
              <View
                key={r}
                className={`flex-row items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border/40' : ''}`}>
                <View className="flex-row items-center gap-2">
                  <Icon icon={r <= 5 ? Dumbbell : Repeat} size={16} color={r <= 5 ? 'primary' : 'muted-foreground'} />
                  <Body className="text-sm text-foreground">{r} rep{r !== 1 ? 's' : ''}</Body>
                </View>
                <Body className="font-semibold text-foreground">
                  {max > 0 ? `${Number.isInteger(max) ? max : max.toFixed(1)} ${unitSuffix}` : '—'}
                </Body>
              </View>
            );
          })}
        </View>

        <Button variant="outline" className="mt-6" onPress={() => router.back()}>
          Done
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
