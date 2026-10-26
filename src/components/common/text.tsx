import type { ReactNode } from 'react';
import { Text as RNText, type TextProps } from 'react-native';

import { cn } from '@/lib/cn';

/** Base text primitive: Geist + foreground. The semantic wrappers below build on it. */
export function Text({ className, ...props }: TextProps) {
  return <RNText className={cn('font-sans text-base text-foreground', className)} {...props} />;
}

/**
 * Semantic text components. Thin wrappers over <Text> with sensible default
 * utility classes; override anything via className. NativeWind utilities are
 * the primary styling method — these exist only for consistency of voice.
 */
export function Hero({ className, children, ...props }: { className?: string; children: ReactNode } & TextProps) {
  return <Text className={cn('text-3xl font-extrabold tracking-tight text-foreground', className)} {...props}>{children}</Text>;
}
export function Heading({ className, children, ...props }: { className?: string; children: ReactNode } & TextProps) {
  return <Text className={cn('text-2xl font-bold tracking-tight text-foreground', className)} {...props}>{children}</Text>;
}
export function Title({ className, children, ...props }: { className?: string; children: ReactNode } & TextProps) {
  return <Text className={cn('text-xl font-semibold tracking-tight text-foreground', className)} {...props}>{children}</Text>;
}
export function Subtitle({ className, children, ...props }: { className?: string; children: ReactNode } & TextProps) {
  return <Text className={cn('text-base font-medium text-foreground', className)} {...props}>{children}</Text>;
}
export function Body({ className, children, ...props }: { className?: string; children: ReactNode } & TextProps) {
  return <Text className={cn('text-base text-foreground', className)} {...props}>{children}</Text>;
}
export function Caption({ className, children, ...props }: { className?: string; children: ReactNode } & TextProps) {
  return <Text className={cn('text-sm text-muted-foreground', className)} {...props}>{children}</Text>;
}
export function Label({ className, children, ...props }: { className?: string; children: ReactNode } & TextProps) {
  return <Text className={cn('text-xs font-medium uppercase tracking-wide text-muted-foreground', className)} {...props}>{children}</Text>;
}
