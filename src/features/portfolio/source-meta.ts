import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { SourceKind } from '@/services/types';

export const SOURCE_ICONS: Record<SourceKind, ComponentProps<typeof Ionicons>['name']> = {
  broker: 'business',
  wallet: 'wallet',
  exchange: 'swap-horizontal',
};

export const SOURCE_COLORS: Record<string, string> = {
  ibkr: '#D81F26',
  ledger: '#B98CFF',
  metamask: '#F6851B',
  binance: '#F0B90B',
};
