import { View } from 'react-native';

import { AskScreen } from '@/components/ai';

/** Android: opened by the floating AI button as a sheet. */
export default function AskSheet() {
  return (
    <View className="flex-1 bg-background">
      <AskScreen />
    </View>
  );
}
