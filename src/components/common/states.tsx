import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Subtitle, Body, Caption } from './text';
import { AlertTriangle } from 'lucide-react-native';
import { Icon } from './icon';

/**
 * Empty / error / loading states. Composed everywhere lists appear so the
 * product voice stays consistent.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <View className={cn('items-center justify-center px-6 py-12', className)}>
      {icon ? <View className="mb-4">{icon}</View> : null}
      <Subtitle className="text-center">{title}</Subtitle>
      {description ? <Body className="mt-1.5 text-center text-muted-foreground">{description}</Body> : null}
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" className="mt-5" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We couldn’t load this. Please try again.',
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <View className={cn('items-center justify-center px-6 py-12', className)}>
      <Subtitle className="text-center">{title}</Subtitle>
      <Body className="mt-1.5 text-center text-muted-foreground">{description}</Body>
      {onRetry ? <Button variant="outline" size="sm" className="mt-5" onPress={onRetry}>Try again</Button> : null}
    </View>
  );
}

/**
 * Inline warning for a failed secondary read: the screen stays usable, the
 * failure is visible and retryable (never silently shown as "no data").
 */
export function InlineError({
  message,
  onRetry,
  retrying = false,
  className,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="alert"
      className={cn('flex-row items-center gap-3 rounded-xl bg-warning/15 py-1 pl-4 pr-1', className)}>
      <Icon icon={AlertTriangle} size={16} color="warning" />
      <Caption className="flex-1 text-foreground">{message}</Caption>
      <Button variant="ghost" size="sm" onPress={onRetry} loading={retrying} accessibilityLabel="Retry loading">
        Retry
      </Button>
    </View>
  );
}

export function LoadingState({ className }: { className?: string }) {
  return <View className={cn('items-center justify-center py-12', className)} />;
}
