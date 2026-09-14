import { Pressable, View } from 'react-native';
import { Download, PaintBucket, Share2, Sparkles } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption } from '@/components/common/text';

type Action = {
  key: string;
  label: string;
  icon: typeof Share2;
  onPress: () => void;
};

/** Hevy-style row: Background, Stories, More, Download. Stories uses the OS share sheet (pick Instagram if installed). */
export function ShareActionBar({
  busy,
  onBackground,
  onStories,
  onMore,
  onDownload,
}: {
  busy?: boolean;
  onBackground: () => void;
  onStories: () => void;
  onMore: () => void;
  onDownload: () => void;
}) {
  const actions: Action[] = [
    { key: 'bg', label: 'Background', icon: PaintBucket, onPress: onBackground },
    { key: 'stories', label: 'Stories', icon: Sparkles, onPress: onStories },
    { key: 'more', label: 'More', icon: Share2, onPress: onMore },
    { key: 'download', label: 'Download', icon: Download, onPress: onDownload },
  ];

  return (
    <View>
      <Caption className="mb-3 text-center text-muted-foreground">
        Share this image and tag Incline
      </Caption>
      <View className="flex-row justify-around px-2">
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            className="items-center gap-1.5 disabled:opacity-40">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Icon icon={a.icon} size={20} color="foreground" />
            </View>
            <Caption className="text-foreground">{a.label}</Caption>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
