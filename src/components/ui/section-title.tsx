import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './text';

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.xs,
      }}>
      <AppText variant="headline">{title}</AppText>
      {right}
    </View>
  );
}
