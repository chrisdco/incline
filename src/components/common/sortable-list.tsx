import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { GripVertical } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { useHaptics } from '@/hooks/use-haptics';

/**
 * Drag-to-reorder list (react-native-sortables: Reanimated 4 + gesture
 * handler 3, runs on the UI thread). Replaces react-native-draggable-flatlist,
 * which stuttered and stuck under the new architecture.
 *
 * Drag starts from the grip only, so taps and scrolling on the row stay
 * normal. Pass the parent Animated.ScrollView's ref for auto-scroll near the
 * edges. Rows render inline (not virtualized): fine for a routine or a
 * session's exercises (tens of rows).
 */
export function SortableList<T>({
  data,
  keyOf,
  renderRow,
  onReorder,
  scrollableRef,
}: {
  data: T[];
  keyOf: (item: T) => string;
  /** The row; place `grip` where the drag handle goes (usually first in the card). */
  renderRow: (item: T, grip: ReactNode) => ReactNode;
  onReorder: (next: T[]) => void;
  scrollableRef?: AnimatedRef<any>;
}) {
  const { impact } = useHaptics();
  return (
    <Sortable.Grid
      data={data}
      keyExtractor={keyOf}
      columns={1}
      rowGap={8}
      customHandle
      dragActivationDelay={80}
      activeItemScale={1.03}
      inactiveItemOpacity={0.6}
      overDrag="vertical"
      scrollableRef={scrollableRef}
      onDragStart={() => impact()}
      onDragEnd={({ data: next, fromIndex, toIndex }) => {
        if (fromIndex === toIndex) return;
        impact();
        onReorder(next);
      }}
      renderItem={({ item }) =>
        renderRow(
          item,
          <Sortable.Handle>
            <View className="-my-2 -ml-1 py-2 pl-1 pr-2" accessibilityLabel="Drag to reorder">
              <Icon icon={GripVertical} size={18} color="muted-foreground" />
            </View>
          </Sortable.Handle>,
        )
      }
    />
  );
}
