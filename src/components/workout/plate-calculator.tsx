import * as React from 'react';
import { View, TextInput } from 'react-native';

import { Body, Caption } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/common/segmented-control';
import { Switch } from '@/components/ui/switch';
import { Chip } from '@/components/common/chip';
import { formatPlate } from '@/components/gyms/gym-format';
import { calculatePlates, BAR_OPTIONS, type BarKind, type Plate } from '@/lib/plate-calculator';
import { useGymsState } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { PLACEHOLDER_COLOR } from '@/constants/config';

const STANDARD = 'standard';

interface PlateCalculatorProps {
  /** Target total weight on the bar */
  targetWeight?: number;
  className?: string;
}

export function PlateCalculator({ targetWeight: initialTarget, className }: PlateCalculatorProps) {
  const settingsUnit = useSettings((s) => s.unit);
  const [input, setInput] = React.useState(initialTarget?.toString() ?? '');
  const [includeBar, setIncludeBar] = React.useState(true);
  const [barKind, setBarKind] = React.useState<BarKind>('barbell');
  // Gyms (#243): defaults to the current gym; "Standard" = the full plate set.
  const { data: gymsState } = useGymsState();
  const gyms = gymsState?.gyms ?? [];
  const [picked, setPicked] = React.useState<string | null>(null);
  const gymKey = picked ?? gymsState?.current?.uuid ?? STANDARD;
  const gym = gyms.find((g) => g.uuid === gymKey) ?? null;

  const unit = gym ? (gym.unit === 'metric' ? 'kg' : 'lb') : settingsUnit === 'metric' ? 'kg' : 'lb';
  const barOption = BAR_OPTIONS.find((b) => b.kind === barKind) ?? BAR_OPTIONS[0];
  const standardBarWeight = unit === 'kg' ? barOption.kg : barOption.lb;
  const barWeight = includeBar ? (gym ? gym.barWeight : standardBarWeight) : 0;
  const result = calculatePlates(Number(input) || 0, unit, barWeight, gym?.plates);

  return (
    // The host screen's tab names it ("Plates"), so no heading of its own.
    <Card className={className}>

      <View className="gap-3">
        {gyms.length > 0 ? (
          <View className="gap-1.5">
            <Caption>Gym</Caption>
            <View className="flex-row flex-wrap gap-2">
              {gyms.map((g) => (
                <Chip key={g.uuid} label={g.name} selected={gym?.uuid === g.uuid} onPress={() => setPicked(g.uuid)} />
              ))}
              <Chip label="Standard" selected={gym == null} onPress={() => setPicked(STANDARD)} />
            </View>
          </View>
        ) : null}

        <View className="gap-1.5">
          <Caption>Target weight ({unit})</Caption>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={`e.g. ${unit === 'kg' ? '80' : '135'}`}
            placeholderTextColor={PLACEHOLDER_COLOR}
            keyboardType="decimal-pad"
            className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
          />
        </View>

        <View className="flex-row items-center justify-between rounded-xl bg-background px-4 py-3">
          <View>
            <Body className="text-sm font-medium text-foreground">Include bar weight</Body>
            <Caption>Subtract the bar before loading plates</Caption>
          </View>
          <Switch
            value={includeBar}
            onValueChange={setIncludeBar}
            accessibilityLabel="Include bar weight"
          />
        </View>

        {includeBar && gym ? (
          <Caption className="text-muted-foreground">
            {formatPlate(gym.barWeight)}{unit} bar · {gym.name}
          </Caption>
        ) : null}

        {includeBar && !gym ? (
          <View className="gap-1.5">
            <Caption>Bar type</Caption>
            <SegmentedControl<BarKind>
              values={BAR_OPTIONS.map((b) => ({ value: b.kind, label: b.label }))}
              value={barKind}
              onChange={setBarKind}
            />
            <Caption className="text-muted-foreground">
              {barWeight}{unit} bar · {barOption.label}
            </Caption>
          </View>
        ) : null}

        {input && Number(input) > 0 && result ? (
          <View className="gap-2">
            <Caption className="text-muted-foreground">
              {result.barbell > 0
                ? `${result.barbell}${unit} bar + ${result.totalPerSide.toFixed(1)}${unit} per side`
                : `${result.totalPerSide.toFixed(1)}${unit} per side · no bar`}
            </Caption>
            {result.plates.length === 0 ? (
              <Caption className="text-primary-text">Bar only — no plates needed</Caption>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {result.plates.map((plate) => (
                  <PlateChip key={plate.weight} plate={plate} unit={unit} />
                ))}
              </View>
            )}
            {result.remainderPerSide > 0 ? (
              <Caption className="text-warning">
                {formatPlate(result.remainderPerSide * 2)}{unit} short — {gym ? `${gym.name}’s plates` : 'these plates'} can’t make it exactly
              </Caption>
            ) : null}
          </View>
        ) : null}

        {input && Number(input) > 0 && !result ? (
          <Caption className="text-destructive">
            Weight must be at least {includeBar ? `the ${barWeight}${unit} bar` : '0'}.
          </Caption>
        ) : null}
      </View>
    </Card>
  );
}

function PlateChip({ plate, unit }: { plate: Plate; unit: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5">
      <View className="h-2 w-2 rounded-full bg-primary" />
      <Body className="text-sm font-semibold text-primary-text">
        {plate.count}x {plate.weight}{unit}
      </Body>
    </View>
  );
}
