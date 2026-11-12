import { View } from 'react-native';

import { SegmentedControl } from '@/components/common/segmented-control';

export type PrScope = 'all' | 'gym';

/**
 * "All gyms / This gym" for an exercise's records (#243). Only shown when the
 * exercise has sets at 2+ gyms; All (the aggregate) stays the default.
 */
export function GymPrScopeToggle({
  gymName,
  value,
  onChange,
}: {
  gymName: string;
  value: PrScope;
  onChange: (next: PrScope) => void;
}) {
  return (
    <View className="mb-4">
      <SegmentedControl<PrScope>
        values={[
          { value: 'all', label: 'All gyms' },
          { value: 'gym', label: gymName.length > 0 && gymName.length <= 14 ? gymName : 'This gym' },
        ]}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}
