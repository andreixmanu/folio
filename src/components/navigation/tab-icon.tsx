import type { LucideIcon } from '@/components/ui/icons';
import type { ColorValue } from 'react-native';

import { Icon } from '@/components/ui';

export function TabIcon({
  icon,
  size,
  color,
  focused,
  testID,
}: {
  icon: LucideIcon;
  size: number;
  color: ColorValue;
  focused: boolean;
  testID?: string;
}) {
  return (
    <Icon
      icon={icon}
      size={size}
      color={typeof color === 'string' ? color : '#000'}
      strokeWidth={focused ? 2.25 : 1.75}
      testID={testID}
    />
  );
}
