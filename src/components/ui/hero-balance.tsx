import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { formatMoney, formatMoneyParts, MASK } from '@/lib/format';
import { timings } from '@/theme';

import { AppText } from './text';

export type HeroBalanceProps = {
  value: number;
  currency?: string;
  masked?: boolean;
  /** Value the counter starts from on first mount. */
  from?: number;
  testID?: string;
};

/**
 * Wallet-home total: large integer, smaller decimals, currency on the same baseline.
 * Tweens with the same calm counter as `AnimatedNumber`.
 */
export function HeroBalance({
  value,
  currency = 'EUR',
  masked = false,
  from = 0,
  testID,
}: HeroBalanceProps) {
  const progress = useSharedValue(from);
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    progress.set(withTiming(value, timings.counter));
  }, [progress, value]);

  useAnimatedReaction(
    () => progress.get(),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setDisplay, current);
    },
  );

  const finalText = masked ? MASK : formatMoney(value, currency);
  const parts = formatMoneyParts(display, currency);

  return (
    <View
      testID={testID}
      accessibilityLabel={finalText}
      style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
      {masked ? (
        <AppText variant="hero" tabular>
          {MASK}
        </AppText>
      ) : (
        <>
          <AppText variant="hero" tabular>
            {parts.sign}
            {parts.integer}
          </AppText>
          {parts.fraction ? (
            <AppText variant="heroFraction" tabular>
              {parts.fraction}
            </AppText>
          ) : null}
          {parts.currency ? (
            <AppText variant="heroFraction" style={{ marginLeft: 6 }}>
              {parts.currency}
            </AppText>
          ) : null}
        </>
      )}
    </View>
  );
}
