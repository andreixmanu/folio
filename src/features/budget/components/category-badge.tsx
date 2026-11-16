import {
  ArrowLeftRight,
  Banknote,
  Ellipsis,
  HeartPulse,
  House,
  Plane,
  Repeat,
  ShoppingBag,
  ShoppingBasket,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  type LucideIcon,
} from '@/components/ui/icons';
import { IconBadge } from '@/components/ui';
import { useTheme } from '@/theme';

import { CATEGORY_BY_ID, type CategoryIconName, type CategoryId } from '../model';

const CATEGORY_ICONS = {
  ShoppingBasket,
  UtensilsCrossed,
  TrainFront,
  ShoppingBag,
  House,
  Repeat,
  HeartPulse,
  Ticket,
  Plane,
  Banknote,
  ArrowLeftRight,
  Ellipsis,
} as const satisfies Record<CategoryIconName, LucideIcon>;

/** Category colour for the active scheme. The badge tint is derived from it. */
export function categoryColor(categoryId: CategoryId, scheme: 'dark' | 'light'): string {
  return CATEGORY_BY_ID[categoryId].color[scheme];
}

/** Rounded category mark: Lucide glyph on a tint taken from the category colour. */
export function CategoryBadge({ categoryId, size = 36 }: { categoryId: CategoryId; size?: number }) {
  const theme = useTheme();
  const category = CATEGORY_BY_ID[categoryId];
  return (
    <IconBadge icon={CATEGORY_ICONS[category.icon]} color={categoryColor(categoryId, theme.scheme)} size={size} />
  );
}
