import { useCallback } from 'react';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { motionControl, motionPress } from '@/styles/motion';
import { Text } from './text';

const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-full', {
  variants: {
    variant: {
      default: 'bg-primary',
      secondary: 'bg-secondary',
      destructive: 'bg-destructive',
      destructiveTonal: 'border border-destructive/30 bg-destructive/10',
      tonal: 'border border-primary/25 bg-primary/10',
      outline: 'border border-border bg-transparent',
      ghost: 'bg-transparent',
      success: 'bg-success',
    },
    size: {
      default: 'h-11 px-5',
      sm: 'h-11 min-h-[44px] px-4',
      lg: 'h-12 px-7',
      icon: 'h-11 w-11',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

const buttonTextVariants = cva('font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      destructiveTonal: 'text-destructive',
      tonal: 'text-primary',
      outline: 'text-foreground',
      ghost: 'text-foreground',
      success: 'text-success-foreground',
    },
    size: { default: 'text-base', sm: 'text-sm', lg: 'text-lg', icon: '' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type ButtonProps = PressableProps &
  VariantProps<typeof buttonVariants> & {
    children?: ReactNode;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    textClass?: string;
    /** Busy state: disables press, shows a spinner, keeps the label for a11y. */
    loading?: boolean;
  };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function asButtonLabel(children: ReactNode): string | null {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children) && children.every((c) => typeof c === 'string' || typeof c === 'number')) {
    return children.join('');
  }
  return null;
}

export function Button({
  className,
  variant,
  size,
  textClass,
  leftIcon,
  rightIcon,
  children,
  disabled,
  loading,
  ...props
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    scale.value = withSpring(motionPress.scale, motionPress.spring);
  }, [scale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, motionPress.spring);
  }, [scale]);

  const label = asButtonLabel(children);
  const inactive = disabled || loading;

  return (
    <AnimatedPressable
      style={animatedStyle}
      className={cn(buttonVariants({ variant, size }), inactive && 'opacity-50', className)}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      // Amber `control` pattern: retain presses that drift slightly off-target
      // (gym use with sweaty hands) without enlarging the visual target.
      pressRetentionOffset={motionControl.pressRetentionOffset}
      hitSlop={motionControl.pressRetentionOffset}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      {...props}>
      {loading ? <ActivityIndicator /> : leftIcon}
      {label != null ? (
        <Text className={cn(buttonTextVariants({ variant, size }), textClass)}>{label}</Text>
      ) : (
        children
      )}
      {!loading && rightIcon}
    </AnimatedPressable>
  );
}

export { buttonVariants, buttonTextVariants };
