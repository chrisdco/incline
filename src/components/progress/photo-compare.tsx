import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowLeftRight, ImageOff, MoreHorizontal } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { formatFullDate } from '@/db/calc';
import type { ProgressPhoto, WeekStartsOn } from '@/db/types';
import { progressPhotoWeekLabel } from '@/lib/progress-photos';

function PhotoPane({
  photo,
  side,
  weekStartsOn,
  onPress,
  onOpenMenu,
}: {
  photo: ProgressPhoto;
  side: 'left' | 'right';
  weekStartsOn: WeekStartsOn;
  onPress: () => void;
  onOpenMenu: () => void;
}) {
  const [missing, setMissing] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setMissing(false);
  }, [photo.id, photo.uri]);

  const dateLabel = formatFullDate(photo.startedAt);
  const weekLabel = progressPhotoWeekLabel(photo.startedAt, weekStartsOn);
  const sideLabel = side === 'left' ? 'Earlier' : 'Later';

  return (
    <View className="flex-1">
      <Pressable
        onPress={onPress}
        onLayout={(e) => {
          const { width } = e.nativeEvent.layout;
          if (width > 0 && width !== size.width) {
            setSize({ width, height: Math.round(width * (4 / 3)) });
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={`${sideLabel} photo, ${dateLabel}, ${weekLabel}, ${photo.workoutName}. Tap to change.`}
        className="overflow-hidden rounded-2xl bg-card">
        <View style={{ width: '100%', height: size.height || 180 }} className="items-center justify-center bg-surface2">
          {missing ? (
            <View className="items-center px-3">
              <Icon icon={ImageOff} size={28} color="muted-foreground" />
              <Caption className="mt-2 text-center">Photo missing on this device</Caption>
            </View>
          ) : size.width > 0 ? (
            <Image
              source={{ uri: photo.uri }}
              style={{ width: size.width, height: size.height }}
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={`progress-photo-${photo.id}`}
              onError={() => setMissing(true)}
            />
          ) : null}
        </View>
      </Pressable>
      <View className="mt-2 flex-row items-start justify-between gap-1">
        <View className="flex-1">
          <Body className="text-sm font-semibold text-foreground" numberOfLines={1}>
            {photo.workoutName}
          </Body>
          <Caption numberOfLines={1}>{dateLabel}</Caption>
          <Caption numberOfLines={1}>{weekLabel}</Caption>
        </View>
        <Pressable
          onPress={onOpenMenu}
          hitSlop={8}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel={`Photo options for ${sideLabel} photo`}>
          <Icon icon={MoreHorizontal} size={18} color="muted-foreground" />
        </Pressable>
      </View>
    </View>
  );
}

export function PhotoCompare({
  left,
  right,
  weekStartsOn,
  onChangeLeft,
  onChangeRight,
  onSwap,
  onOpenMenu,
}: {
  left: ProgressPhoto;
  right: ProgressPhoto;
  weekStartsOn: WeekStartsOn;
  onChangeLeft: () => void;
  onChangeRight: () => void;
  onSwap: () => void;
  onOpenMenu: (side: 'left' | 'right') => void;
}) {
  return (
    <View>
      <View className="flex-row gap-2">
        <PhotoPane
          photo={left}
          side="left"
          weekStartsOn={weekStartsOn}
          onPress={onChangeLeft}
          onOpenMenu={() => onOpenMenu('left')}
        />
        <PhotoPane
          photo={right}
          side="right"
          weekStartsOn={weekStartsOn}
          onPress={onChangeRight}
          onOpenMenu={() => onOpenMenu('right')}
        />
      </View>
      <Pressable
        onPress={onSwap}
        accessibilityRole="button"
        accessibilityLabel="Swap left and right photos"
        className="mt-3 flex-row items-center justify-center gap-2 self-center rounded-full border border-border bg-card px-4 py-2">
        <Icon icon={ArrowLeftRight} size={16} color="primary" />
        <Caption className="font-medium text-primary-text">Swap</Caption>
      </Pressable>
    </View>
  );
}
