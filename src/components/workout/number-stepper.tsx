import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { clamp } from '@/db/calc';
import { SET_INPUT_HEIGHT } from './set-layout';

export interface NumberStepperHandle {
  /** Focus the input. */
  focus: () => void;
}

/**
 * Fixed-size numeric field. Always mounts a TextInput (never swaps with a
 * Pressable) so tapping to edit cannot reflow the row / scroll the session.
 */
export function NumberStepper({
  ref,
  value,
  onChange,
  min = 0,
  max = 1000,
  decimals = 0,
  onSubmitNext,
  className,
  style,
  step: _step,
  suffix,
}: {
  ref?: Ref<NumberStepperHandle>;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
  onSubmitNext?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  step?: number;
  suffix?: string;
}) {
  void _step;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value > 0 ? String(value) : '');
  const inputRef = useRef<TextInput>(null);
  const committedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
  }), []);

  useEffect(() => {
    if (!focused) setDraft(value > 0 ? String(value) : '');
  }, [value, focused]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const parsed = parseFloat(draft.replace(',', '.'));
    const next = Number.isFinite(parsed) ? clamp(parsed, min, max) : min;
    onChange(decimals > 0 ? Math.round(next * 10) / 10 : Math.round(next));
    setFocused(false);
  };

  return (
    <View
      className={cn('flex-row items-center justify-center', className)}
      style={[{ height: SET_INPUT_HEIGHT }, style]}>
      <TextInput
        ref={inputRef}
        value={focused ? draft : value > 0 ? String(value) : ''}
        placeholder="—"
        placeholderTextColor="#71717a"
        onFocus={() => {
          committedRef.current = false;
          setFocused(true);
          setDraft(value > 0 ? String(value) : '');
        }}
        onChangeText={(t) => {
          committedRef.current = false;
          setDraft(t);
        }}
        onBlur={commit}
        onSubmitEditing={() => {
          commit();
          onSubmitNext?.();
        }}
        keyboardType="decimal-pad"
        returnKeyType={onSubmitNext ? 'next' : 'done'}
        selectTextOnFocus
        accessibilityLabel={suffix ? `Value in ${suffix}` : 'Numeric value'}
        style={{
          height: SET_INPUT_HEIGHT,
          flex: 1,
          paddingVertical: 0,
          includeFontPadding: false,
          textAlign: 'center',
          fontSize: 16,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}
        className="rounded-lg bg-muted/60 px-1 text-foreground"
      />
      {suffix && !focused ? (
        <Text className="absolute right-2 text-xs text-muted-foreground">{suffix}</Text>
      ) : null}
    </View>
  );
}
