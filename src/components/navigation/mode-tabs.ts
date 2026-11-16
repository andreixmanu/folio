import {
  ChartColumn,
  ChartPie,
  LayoutDashboard,
  Newspaper,
  PiggyBank,
  ReceiptText,
  Settings,
  Sparkles,
  type LucideIcon,
} from '@/components/ui/icons';
import type { AppMode } from '@/store/mode-store';

export type ModeTab = {
  name: string;
  label: string;
  icon: LucideIcon;
};

/** Static tab faces used by the drag ghost. Order matches each group's navigator. */
export const MODE_TABS: Record<AppMode, readonly ModeTab[]> = {
  invest: [
    { name: 'portfolio', label: 'Portafoglio', icon: ChartPie },
    { name: 'news', label: 'Notizie', icon: Newspaper },
    { name: 'assistant', label: 'Assistente', icon: Sparkles },
    { name: 'settings', label: 'Impostazioni', icon: Settings },
  ],
  budget: [
    { name: 'overview', label: 'Panoramica', icon: LayoutDashboard },
    { name: 'transactions', label: 'Movimenti', icon: ReceiptText },
    { name: 'analytics', label: 'Analisi', icon: ChartColumn },
    { name: 'budgets', label: 'Budget', icon: PiggyBank },
    { name: 'budget-settings', label: 'Opzioni', icon: Settings },
  ],
};

export function otherMode(mode: AppMode): AppMode {
  return mode === 'invest' ? 'budget' : 'invest';
}
