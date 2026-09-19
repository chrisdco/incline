import * as React from 'react';
import { View, TextInput } from 'react-native';

import { Heading, Body, Caption } from '@/components/common/text';
import { Icon } from '@/components/common/icon';
import { SegmentedControl } from '@/components/common/segmented-control';
import { Switch } from '@/components/ui/switch';
import { calculatePlates, BAR_OPTIONS, type BarKind, type Plate } from '@/lib/plate-calculator';
import { useSettings } from '@/store/settings-store';
import { PLACEHOLDER_COLOR } from '@/constants/config';
import { cn } from '@/lib/cn';
import { METRIC_ICONS } from '@/lib/metric-icons';

interface PlateCalculatorProps {
  /** Target total weight on the bar */
  targetWeight?: number;
  className?: string;
}

export function PlateCalculator({ targetWeight: initialTarget, className }: PlateCalculatorProps) {
  const settingsUnit = useSettings((s) => s.unit);
  const unit = settingsUnit === 'metric' ? 'kg' : 'lb';
  const [input, setInput] = React.useState(initialTarget?.toString() ?? '');
  const [includeBar, setIncludeBar] = React.useState(true);
  const [barKind, setBarKind] = React.useState<BarKind>('barbell');

  const barOption = BAR_OPTIONS.find((b) => b.kind === barKind) ?? BAR_OPTIONS[0];
  const barWeight = includeBar ? (unit === 'kg' ? barOption.kg : barOption.lb) : 0;
  const result = calculatePlates(Number(input) || 0, unit, barWeight);

  return (
    <View className={cn('rounded-2xl border border-border bg-card p-4', className)}>
      <View className="mb-3 flex-row items-center gap-2">
        <Icon icon={METRIC_ICONS.equipment} color="primary" size={20} />
        <Heading>Plate Calculator</Heading>
      </View>

      <View className="gap-3">
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

        {includeBar ? (
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

        {input && Number(input) > 0 && result && (
          <View className="gap-2">
            <Caption className="text-muted-foreground">
              {result.barbell > 0
                ? `${result.barbell}${unit} bar + ${result.totalPerSide.toFixed(1)}${unit} per side`
                : `${result.totalPerSide.toFixed(1)}${unit} per side · no bar`}
            </Caption>
            {result.plates.length === 0 ? (
              <Caption className="text-primary">Bar only — no plates needed</Caption>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {result.plates.map((plate) => (
                  <PlateChip key={plate.weight} plate={plate} unit={unit} />
                ))}
              </View>
            )}
          </View>
        )}

        {input && Number(input) > 0 && !result && (
          <Caption className="text-destructive">
            Weight must be at least {includeBar ? `the ${barWeight}${unit} bar` : '0'}.
          </Caption>
        )}
      </View>
    </View>
  );
}

function PlateChip({ plate, unit }: { plate: Plate; unit: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5">
      <View className="h-2 w-2 rounded-full bg-primary" />
      <Body className="text-sm font-semibold text-primary">
        {plate.count}x {plate.weight}{unit}
      </Body>
    </View>
  );
}
