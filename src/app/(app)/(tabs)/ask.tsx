import { SafeAreaView } from 'react-native-safe-area-context';

import { AskScreen } from '@/components/ai';

/** iOS: the separate AI tab (search role). Android opens `/ai` as a sheet instead. */
export default function AskTab() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AskScreen />
    </SafeAreaView>
  );
}
