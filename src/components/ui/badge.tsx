import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from '@/components/common/text';

const badgeVariants = cva('flex-row items-center rounded-full px-2.5 py-1', {
  variants: {
    variant: {
      default: 'bg-primary/15',
      neutral: 'bg-muted',
      secondary: 'bg-secondary',
      destructive: 'bg-destructive/15',
      outline: 'border border-border bg-transparent',
      success: 'bg-success/15',
      warning: 'bg-warning/15',
      info: 'bg-info/15',
    },
  },
  defaultVariants: { variant: 'default' },
});

const badgeTextVariants = cva('text-xs font-semibold', {
  variants: {
    variant: {
      default: 'text-primary',
      neutral: 'text-muted-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive',
      outline: 'text-muted-foreground',
      success: 'text-success',
      warning: 'text-warning',
      info: 'text-info',
    },
  },
  defaultVariants: { variant: 'default' },
});

type BadgeProps = ViewProps & VariantProps<typeof badgeVariants> & { textClass?: string; children: ReactNode };

export function Badge({ className, variant, textClass, children, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      <Text className={cn(badgeTextVariants({ variant }), textClass)}>{children}</Text>
    </View>
  );
}

export { badgeVariants, badgeTextVariants };
