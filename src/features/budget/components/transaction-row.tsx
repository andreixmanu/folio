import { ListRow } from '@/components/ui';

import { formatDayLabel } from '../analytics';
import { displayMerchant } from '../merchant';
import { CATEGORY_BY_ID, counterpartyRaw, type RecurringCadence, type RecurringPayment, type Transaction } from '../model';

import { CategoryBadge } from './category-badge';
import { MoneyText } from './money-text';

const CADENCE_LABEL: Record<RecurringCadence, string> = {
  weekly: 'Ogni settimana',
  monthly: 'Ogni mese',
  quarterly: 'Ogni trimestre',
  yearly: 'Ogni anno',
};

function merchantLabel(tx: Transaction): string {
  return displayMerchant(counterpartyRaw(tx) || tx.merchantKey || tx.remittanceInformation) || 'Movimento';
}

/** One movement: merchant, category, day, and a signed amount. */
export function TransactionRow({
  tx,
  today,
  masked = false,
  onPress,
  testID,
}: {
  tx: Transaction;
  /** Civil today, `YYYY-MM-DD`, so the row can say Oggi or Ieri. */
  today: string;
  masked?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const category = CATEGORY_BY_ID[tx.categoryId ?? 'other'];
  const when = formatDayLabel(tx.bookingDate, today);
  const subtitle = tx.status === 'pending' ? `${category.label} · ${when} · In sospeso` : `${category.label} · ${when}`;
  return (
    <ListRow
      leading={<CategoryBadge categoryId={category.id} />}
      title={merchantLabel(tx)}
      subtitle={subtitle}
      accessory={<MoneyText amount={tx.amount.amount} currency={tx.amount.currency} masked={masked} />}
      onPress={onPress}
      testID={testID}
    />
  );
}

/** A coming recurring charge. The amount is shown as money leaving the account. */
export function RecurringPaymentRow({
  payment,
  today,
  masked = false,
  testID,
}: {
  payment: RecurringPayment;
  today: string;
  masked?: boolean;
  testID?: string;
}) {
  return (
    <ListRow
      leading={<CategoryBadge categoryId={payment.categoryId} />}
      title={payment.displayName}
      subtitle={`${CADENCE_LABEL[payment.cadence]} · ${formatDayLabel(payment.nextDate, today)}`}
      accessory={<MoneyText amount={-payment.averageAmount} masked={masked} />}
      testID={testID}
    />
  );
}
