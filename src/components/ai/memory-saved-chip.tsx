import { useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Brain } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption, Text } from '@/components/common/text';
import { Tappable } from '@/components/ui/tappable';
import { forgetMemoryFact, restoreMemoryFact } from '@/db/queries/memory';

/**
 * "Saved to memory · Undo" (AI-CHAT §5): under an answer where Ask called
 * `remember`. Undo soft-deletes the fact; "Manage" opens What Incline knows.
 */
export function MemorySavedChip({ id, text }: { id: string; text: string }) {
  const router = useRouter();
  const [removed, setRemoved] = useState(false);
  const toggle = () => {
    const next = !removed;
    setRemoved(next);
    void (next ? forgetMemoryFact(id) : restoreMemoryFact(id)).catch(() => setRemoved(!next));
  };
  return (
    <View className="flex-row items-center gap-2 rounded-xl bg-surface2 px-3 py-2" accessibilityLabel={`${removed ? 'Removed from' : 'Saved to'} memory: ${text}`}>
      <Icon icon={Brain} size={14} color="muted-foreground" />
      <Caption className="min-w-0 flex-1" numberOfLines={2}>
        {removed ? 'Removed from memory' : `Saved to memory: ${text}`}
      </Caption>
      <Tappable onPress={toggle} accessibilityRole="button" accessibilityLabel={removed ? 'Restore' : 'Undo'} hitSlop={8}>
        <Text className="text-xs font-semibold text-primary-text">{removed ? 'Restore' : 'Undo'}</Text>
      </Tappable>
      {removed ? null : (
        <Tappable onPress={() => router.push('/(app)/ai-memory' as Href)} accessibilityRole="link" accessibilityLabel="Manage memory" hitSlop={8}>
          <Text className="text-xs font-semibold text-muted-foreground">Manage</Text>
        </Tappable>
      )}
    </View>
  );
}
