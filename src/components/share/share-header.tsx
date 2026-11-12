/**
 * Share screen header: one exit (#207). The screens are pushed, not modal
 * (view-shot can't capture native modals on Android), so the exit is the
 * back arrow; a right-hand spacer of the same width keeps the title centred.
 */
import { View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

import { Body } from '@/components/common/text';
import { IconButton } from '@/components/ui/icon-button';
import { motionControl } from '@/styles/motion';

const SPACER = { width: motionControl.minHeight } as const;

export function ShareHeader({ onClose, title = 'Share' }: { onClose: () => void; title?: string }) {
  return (
    <View className="flex-row items-center justify-between px-2 pb-1 pt-2">
      <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={onClose} />
      <Body accessibilityRole="header" className="text-base font-semibold text-foreground">
        {title}
      </Body>
      <View style={SPACER} />
    </View>
  );
}
