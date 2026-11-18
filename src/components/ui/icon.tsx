import type { LucideIcon } from './icons';

export type { LucideIcon };

export type IconProps = {
  icon: LucideIcon;
  size?: number;
  /** Theme color value, e.g. `theme.colors.text`. */
  color: string;
  strokeWidth?: number;
  fill?: string;
  accessibilityLabel?: string;
  testID?: string;
};

/** Thin Lucide wrapper with Folio's default stroke. */
export function Icon({
  icon: Glyph,
  size = 24,
  color,
  strokeWidth = 1.75,
  fill,
  accessibilityLabel,
  testID,
}: IconProps) {
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth={false}
      // An explicit `fill={undefined}` overrides Lucide's default `none`, and react-native-svg
      // then paints the shape black. Always pass a real value.
      fill={fill ?? 'none'}
      accessible={accessibilityLabel != null}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      role={accessibilityLabel ? 'img' : undefined}
      testID={testID}
    />
  );
}
