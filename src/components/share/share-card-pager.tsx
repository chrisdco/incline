import { useCallback, type ReactNode, type RefObject } from 'react';
import {
  FlatList,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';

import { cn } from '@/lib/cn';

/** Full-width paging carousel for share cards. Capture `captureRef` (current page). */
export function ShareCardPager<T>({
  data,
  index,
  onIndexChange,
  renderCard,
  captureRef,
  pageBackground,
}: {
  data: T[];
  index: number;
  onIndexChange: (index: number) => void;
  renderCard: (item: T, index: number) => ReactNode;
  captureRef: RefObject<View | null>;
  pageBackground?: string;
}) {
  const { width } = useWindowDimensions();
  const pageRefs = useCallback((el: View | null, i: number) => {
    if (i === index) captureRef.current = el;
  }, [captureRef, index]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    onIndexChange(Math.max(0, Math.min(data.length - 1, next)));
  };

  return (
    <View>
      <FlatList
        data={data}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        extraData={`${index}-${pageBackground ?? ''}`}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onMomentumScrollEnd}
        renderItem={({ item, index: i }) => (
          <View style={{ width, paddingHorizontal: 20 }}>
            <View
              ref={(el) => pageRefs(el, i)}
              collapsable={false}
              style={{
                backgroundColor: pageBackground,
                borderRadius: 28,
                padding: 8,
              }}>
              {renderCard(item, i)}
            </View>
          </View>
        )}
      />
      <View className="mt-4 flex-row items-center justify-center gap-1.5">
        {data.map((_, i) => (
          <View
            key={i}
            className={cn(
              'h-1.5 rounded-full',
              i === index ? 'w-4 bg-primary' : 'w-1.5 bg-muted',
            )}
          />
        ))}
      </View>
    </View>
  );
}
