import {
  ArrowLeftRight,
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Car,
  Coffee,
  Dog,
  Dumbbell,
  Ellipsis,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  Music,
  PiggyBank,
  Plane,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Star,
  Tag,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from '@/components/ui/icons';
import { IconBadge } from '@/components/ui';
import { useTheme } from '@/theme';

import { resolveCategory, type Category, type CategoryIconName, type CategoryId } from '../model';
import { useCategory } from '../use-categories';

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
  PiggyBank,
  Gift,
  Car,
  Baby,
  Dog,
  GraduationCap,
  Dumbbell,
  Shirt,
  Wrench,
  Smartphone,
  Coffee,
  Briefcase,
  Music,
  Gamepad2,
  BookOpen,
  Heart,
  Star,
  Tag,
} as const satisfies Record<CategoryIconName, LucideIcon>;

/** Category colour for the active scheme. The badge tint is derived from it. */
export function categoryColor(
  categoryId: CategoryId,
  scheme: 'dark' | 'light',
  custom: readonly Category[] = [],
): string {
  return resolveCategory(categoryId, custom).color[scheme];
}

export function categoryIcon(name: CategoryIconName): LucideIcon {
  return CATEGORY_ICONS[name];
}

/** Rounded category mark: Lucide glyph on a tint taken from the category colour. */
export function CategoryBadge({ categoryId, size = 36 }: { categoryId: CategoryId; size?: number }) {
  const theme = useTheme();
  const category = useCategory(categoryId);
  return (
    <IconBadge icon={CATEGORY_ICONS[category.icon]} color={category.color[theme.scheme]} size={size} />
  );
}
