import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { PLACEHOLDER_COLOR } from '@/constants/config';
import { IconButton } from '@/components/ui/icon-button';

export function Input({ className, ...props }: TextInputProps) {
  return (
    <TextInput
      className={cn(
        'h-12 rounded-2xl border border-input bg-background px-4 text-base text-foreground',
        className,
      )}
      placeholderTextColor={PLACEHOLDER_COLOR}
      {...props}
    />
  );
}

/** `Input` with a show/hide toggle (44 pt target, labelled for screen readers). */
export function PasswordInput({ className, ...props }: Omit<TextInputProps, 'secureTextEntry'>) {
  const [visible, setVisible] = useState(false);
  return (
    <View className="justify-center">
      <Input {...props} secureTextEntry={!visible} className={cn('pr-12', className)} />
      <IconButton
        icon={visible ? EyeOff : Eye}
        size={20}
        color="muted-foreground"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((v) => !v)}
        className="absolute right-0"
      />
    </View>
  );
}
