import { ArrowLeftRight, Building2, Landmark, Wallet, type LucideIcon } from '@/components/ui/icons';

import type { SourceKind } from '@/services/types';

export const SOURCE_ICONS: Record<SourceKind, LucideIcon> = {
  broker: Landmark,
  wallet: Wallet,
  exchange: ArrowLeftRight,
  bank: Building2,
};

export const SOURCE_COLORS: Record<string, string> = {
  ibkr: '#D81F26',
  tangem: '#35C2FF',
};
