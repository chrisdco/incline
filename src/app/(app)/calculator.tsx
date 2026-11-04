import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption, Hero } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import { ListGroup, Num, Section } from '@/components/layout';
import { SegmentedControl } from '@/components/common/segmented-control';
import { NumberStepper } from '@/components/workout/number-stepper';
import { PlateCalculator } from '@/components/workout/plate-calculator';
import { useSettings } from '@/store/settings-store';
import { estimated1RM } from '@/db/calc';
import { SCREEN_CONTENT } from '@/lib/layout';

const TARGET_REPS = [1, 2, 3, 5, 8, 10, 12];

type Tab = 'oneRm' | 'plates';

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function OneRepMax() {
  const unit = useSettings((s) => s.unit);
  const [weight, setWeight] = useState(60);
  const [reps, setReps] = useState(5);

  const oneRM = estimated1RM(weight, reps);
  const unitSuffix = unit === 'metric' ? 'kg' : 'lb';

  return (
    <>
      <View className="mt-4 flex-row gap-3">
        <Card className="flex-1 items-center">
          <Caption className="mb-3">Weight ({unitSuffix})</Caption>
          <NumberStepper value={weight} onChange={setWeight} step={2.5} suffix={unitSuffix} decimals={1} />
        </Card>
        <Card className="flex-1 items-center">
          <Caption className="mb-3">Reps</Caption>
          <NumberStepper value={reps} onChange={setReps} step={1} min={1} suffix="reps" />
        </Card>
      </View>

      {/* The answer is the one number on screen: hero size, neutral (SYSTEM.md §4). */}
      <View className="mt-6 items-center">
        <Caption>Estimated 1RM</Caption>
        {oneRM > 0 ? (
          <Num value={fmt(oneRM)} unit={unitSuffix} className="mt-1 text-display font-extrabold tracking-tight" unitClassName="text-lg" />
        ) : (
          <Hero className="mt-1">—</Hero>
        )}
        <Caption className="mt-1">
          {fmt(weight)} {unitSuffix} × {reps} reps · Epley formula
        </Caption>
      </View>

      <Section title="By rep range">
        <ListGroup>
          {TARGET_REPS.map((r) => {
            const max = r === 1 ? oneRM : oneRM / (1 + r / 30);
            return (
              <View key={r} className="flex-row items-center justify-between py-3">
                <Body className="text-foreground">{r} rep{r !== 1 ? 's' : ''}</Body>
                {max > 0 ? <Num value={fmt(max)} unit={unitSuffix} className="font-semibold" /> : <Body>—</Body>}
              </View>
            );
          })}
        </ListGroup>
      </Section>
    </>
  );
}

/** 1RM and plate calculators on one screen (`?tab=plates` opens plates). */
export default function CalculatorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'plates' ? 'plates' : 'oneRm');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Calculators</Body>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
        <SegmentedControl<Tab>
          className="mt-2"
          values={[
            { value: 'oneRm', label: '1RM' },
            { value: 'plates', label: 'Plates' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'oneRm' ? <OneRepMax /> : <PlateCalculator className="mt-4" />}
      </ScrollView>
    </SafeAreaView>
  );
}
