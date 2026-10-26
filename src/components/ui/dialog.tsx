import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Text } from '@/components/common/text';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal transparent animationType="fade" visible={open} onRequestClose={() => onOpenChange(false)}>
      <Pressable className="flex-1 items-center justify-center bg-black/50 p-6" onPress={() => onOpenChange(false)}>
        <Pressable
          className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl"
          onPress={(e) => e.stopPropagation()}>
          {title ? <Text className="text-lg font-semibold text-foreground">{title}</Text> : null}
          {description ? <Text className="mt-1 text-sm text-muted-foreground">{description}</Text> : null}
          {children ? <View className="mt-4">{children}</View> : null}
          {footer ? <View className="mt-5 flex-row justify-end gap-3">{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
