import { View } from 'react-native';
import { Image } from 'expo-image';

import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';

const COLORS = [
  'bg-primary',
  'bg-info',
  'bg-warning',
  'bg-destructive',
  'bg-success',
  '#6366f1',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** Avatar with image support, falling back to colored initials. */
export function InitialsAvatar({
  name,
  uri,
  size = 44,
  className,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
  const bgColor = colorForName(name || 'A');

  if (uri) {
    return (
      <Image
        source={{ uri }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        className={cn('rounded-full', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <View
      className={cn('items-center justify-center rounded-full', bgColor, className)}
      style={{ width: size, height: size }}>
      <Text className="font-semibold text-white" style={{ fontSize: size * 0.4 }}>
        {initials}
      </Text>
    </View>
  );
}
