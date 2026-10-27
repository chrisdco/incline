import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, Play } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption, Text, Title } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import type { MuscleGroup } from '@/db/types';

/**
 * Home's primary card: the one thing to do today. Anatomy, top to bottom:
 * eyebrow (source · duration) → title (tap to preview) → one quiet meta line
 * → muscle map → full-width primary action → optional footnote.
 *
 * Program slot and suggested routine share it, so both read identically.
 */
export function TodayCard({
  eyebrow,
  trailing,
  title,
  meta,
  muscles,
  onPreview,
  actionLabel = 'Start workout',
  actionIcon,
  actionVariant = 'default',
  onAction,
  disabled,
  footnote,
}: {
  eyebrow: string;
  trailing?: string | null;
  title: string;
  meta?: string | null;
  muscles?: MuscleGroup[];
  onPreview?: () => void;
  actionLabel?: string;
  actionIcon?: ReactNode;
  actionVariant?: 'default' | 'outline';
  onAction: () => void;
  disabled?: boolean;
  footnote?: string;
}) {
  const heading = (
    <View className="mt-1 flex-row items-center gap-2">
      <Title numberOfLines={2} className="flex-1">{title}</Title>
      {onPreview ? <Icon icon={ChevronRight} size={20} color="muted-foreground" /> : null}
    </View>
  );
  return (
    <Card elevation="raised">
      <View className="flex-row items-center justify-between">
        <Text className="text-2xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</Text>
        {trailing ? <Caption className="text-xs">{trailing}</Caption> : null}
      </View>
      {onPreview ? (
        <Pressable
          onPress={onPreview}
          accessibilityRole="button"
          accessibilityLabel={`Preview ${title}`}
          className="active:opacity-70">
          {heading}
        </Pressable>
      ) : (
        heading
      )}
      {meta ? <Caption numberOfLines={2} className="mt-1">{meta}</Caption> : null}
      {muscles && muscles.length > 0 ? <MuscleBodyMap muscles={muscles} compact className="mt-4" /> : null}
      <Button
        className="mt-4"
        variant={actionVariant}
        leftIcon={actionIcon ?? <Icon icon={Play} size={16} color="primary-foreground" />}
        onPress={onAction}
        disabled={disabled}>
        {actionLabel}
      </Button>
      {footnote ? <Caption className="mt-3 text-center text-xs">{footnote}</Caption> : null}
    </Card>
  );
}
