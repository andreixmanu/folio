import { AppText, type AppTextProps } from '@/components/ui';
import { formatMoney, MASK } from '@/lib/format';

export type MoneyTextProps = Omit<AppTextProps, 'children' | 'color'> & {
  /** Signed euros. */
  amount: number;
  currency?: string;
  masked?: boolean;
  /**
   * `flow` paints income (positive) in the positive colour.
   * `balance` keeps a positive stock in the default colour and only marks an overdraft.
   */
  tone?: 'flow' | 'balance';
  /** Colour used when the amount is not highlighted. Defaults to the primary text colour. */
  color?: AppTextProps['color'];
};

/** Signed euro amount. Income is green; an ordinary outflow stays in the text colour. */
export function MoneyText({
  amount,
  currency = 'EUR',
  masked = false,
  tone = 'flow',
  color,
  style,
  ...rest
}: MoneyTextProps) {
  const highlight = tone === 'flow' ? amount > 0 : amount < 0;
  const text = masked ? MASK : formatMoney(amount, currency, { signed: tone === 'flow' && amount > 0 });
  const resolved = highlight ? (tone === 'flow' ? 'positive' : 'negative') : (color ?? 'text');
  return (
    <AppText {...rest} color={resolved} tabular accessibilityLabel={text} style={style}>
      {text}
    </AppText>
  );
}
