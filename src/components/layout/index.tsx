/**
 * Layout primitives — the hierarchy layer of the design system
 * (docs/design/SYSTEM.md). Screens compose these instead of hand-rolling
 * labels, row anatomy and stat blocks, so every screen shares one rhythm:
 *
 *   Screen padding 16 · Section gap 24 · label → content 8 · row padding 12
 */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Body, Caption, Text } from '@/components/common/text';

/** Uppercase group label above a block ("Workout", "Recent"). */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      accessibilityRole="header"
      className={cn('mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </Text>
  );
}

/**
 * A labelled block. Sections own the vertical rhythm: 24 above each one
 * except the first (`first`), 8 between label and content.
 */
export function Section({
  title,
  action,
  first,
  children,
  className,
}: {
  title?: ReactNode;
  /** Trailing node on the label line (e.g. "See all"). */
  action?: ReactNode;
  first?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn(first ? undefined : 'mt-6', className)}>
      {title || action ? (
        <View className="flex-row items-end justify-between">
          {title ? <SectionLabel>{title}</SectionLabel> : <View />}
          {action ? <View className="mb-2">{action}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Icon tile used by list rows (36pt, control radius). */
export function RowIcon({ children }: { children: ReactNode }) {
  return <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">{children}</View>;
}

/**
 * Standard list row: icon · title/subtitle · trailing control.
 * `stacked` puts the control under the text (wrapping chip groups).
 * `onPress` makes the whole row a button with a chevron unless a trailing
 * node is given.
 */
export function ListRow({
  icon,
  title,
  subtitle,
  children,
  stacked,
  onPress,
  accessibilityLabel,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  stacked?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const head = (
    <View className="min-w-0 flex-1 flex-row items-center gap-3">
      {icon ? <RowIcon>{icon}</RowIcon> : null}
      <View className="min-w-0 flex-1">
        <Body className="font-medium text-foreground">{title}</Body>
        {subtitle ? <Caption className="mt-0.5">{subtitle}</Caption> : null}
      </View>
    </View>
  );
  const trailing = children ?? (onPress ? <Icon icon={ChevronRight} size={18} color="muted-foreground" /> : null);
  const body = stacked ? (
    <View className="gap-3 py-3">
      {head}
      {children}
    </View>
  ) : (
    <View className="flex-row items-center gap-3 py-3">
      {head}
      {trailing}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      className="active:opacity-70">
      {body}
    </Pressable>
  );
}

/**
 * Label over value (over an optional comparison line). The workhorse of
 * session / summary / progress strips: value carries the weight, label and
 * comparison stay quiet.
 */
export function StatBlock({
  label,
  value,
  sub,
  align = 'center',
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  align?: 'start' | 'center';
  tone?: 'default' | 'primary';
  className?: string;
}) {
  return (
    <View className={cn('flex-1', align === 'center' ? 'items-center' : 'items-start', className)}>
      <Text className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Text>
      <Text
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          tone === 'primary' ? 'text-primary' : 'text-foreground',
        )}>
        {value}
      </Text>
      {sub ? <Caption className="mt-0.5 text-xs">{sub}</Caption> : null}
    </View>
  );
}
