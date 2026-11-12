/**
 * Icon-only button with a guaranteed 44 pt target (`motionControl.minHeight`)
 * and a required screen-reader label (#203). Use for header back/close/menu
 * icons instead of a bare `Pressable className="p-1"`, which lands at ~32 pt.
 */
import { type LucideIcon } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Tappable, type TappableProps } from '@/components/ui/tappable';
import { cn } from '@/lib/cn';
import type { IconColor } from '@/lib/icon-color';
import { motionControl } from '@/styles/motion';

const TARGET = { minWidth: motionControl.minHeight, minHeight: motionControl.minHeight } as const;

export type IconButtonProps = Omit<TappableProps, 'children' | 'accessibilityLabel'> & {
  icon: LucideIcon;
  /** Spoken name of the action ("Go back", "More options"). Required. */
  accessibilityLabel: string;
  size?: number;
  color?: IconColor | string;
};

export function IconButton({
  icon,
  accessibilityLabel,
  size = 24,
  color = 'foreground',
  className,
  style,
  ...rest
}: IconButtonProps) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      pressRetentionOffset={motionControl.pressRetentionOffset}
      className={cn('items-center justify-center rounded-full', className)}
      style={[TARGET, style]}
      {...rest}>
      <Icon icon={icon} size={size} color={color} />
    </Tappable>
  );
}
