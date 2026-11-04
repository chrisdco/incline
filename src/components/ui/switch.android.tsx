import { View } from 'react-native';
import { Host, Switch as ComposeSwitch } from '@expo/ui/jetpack-compose';

import { useThemeHex } from '@/lib/theme';

/**
 * Material 3 switch (Jetpack Compose) tinted from our tokens. The universal
 * @expo/ui Switch takes no colors, so Android fell back to M3's baseline
 * slate-blue and ignored the accent. On = accent track, white thumb;
 * off = neutral track with a border (SYSTEM.md §4: accent means "on").
 */
export function Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const hex = useThemeHex();
  return (
    <View accessible accessibilityLabel={accessibilityLabel} accessibilityRole="switch" accessibilityState={{ checked: value, disabled: !!disabled }}>
      <Host matchContents>
        <ComposeSwitch
          value={value}
          onCheckedChange={onValueChange}
          enabled={!disabled}
          colors={{
            checkedTrackColor: hex.primary,
            checkedThumbColor: '#ffffff',
            checkedBorderColor: hex.primary,
            uncheckedTrackColor: hex.surface3,
            uncheckedThumbColor: hex.mutedForeground,
            uncheckedBorderColor: hex.border,
          }}
        />
      </Host>
    </View>
  );
}
