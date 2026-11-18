import {
  formatMoney,
  formatMoneyParts,
  formatPercent,
  formatQuantity,
  formatRelativeTime,
  formatRelativeTimeIt,
} from '@/lib/format';

// Intl output uses non-breaking spaces before the currency symbol.
const normalize = (s: string) => s.replace(/\u00a0|\u202f/g, ' ');

describe('format', () => {
  test('formatMoney uses Italian separators and groups thousands', () => {
    expect(normalize(formatMoney(161757.44))).toBe('161.757,44 €');
    expect(normalize(formatMoney(9501.8))).toBe('9.501,80 €');
    expect(normalize(formatMoney(-12.5))).toBe('−12,50 €');
    expect(normalize(formatMoney(12.5, 'EUR', { signed: true }))).toBe('+12,50 €');
  });

  test('formatMoneyParts splits integer, fraction and currency', () => {
    const parts = formatMoneyParts(161757.44);
    expect(parts.sign).toBe('');
    expect(parts.integer).toBe('161.757');
    expect(parts.fraction).toBe(',44');
    expect(parts.currency).toBe('€');
    expect(normalize(parts.formatted)).toBe('161.757,44 €');

    const negative = formatMoneyParts(-12.5);
    expect(negative.sign).toBe('−');
    expect(negative.integer).toBe('12');
    expect(negative.fraction).toBe(',50');

    const signed = formatMoneyParts(12.5, 'EUR', { signed: true });
    expect(signed.sign).toBe('+');
  });

  test('formatPercent signs values', () => {
    expect(formatPercent(2.345)).toBe('+2,35%');
    expect(formatPercent(-0.87)).toBe('−0,87%');
    expect(formatPercent(0)).toBe('0,00%');
    expect(formatPercent(51.4, { signed: false, decimals: 0 })).toBe('51%');
    expect(formatPercent(2.345, { decimals: 2 })).toBe('+2,35%');
  });

  test('formatQuantity adapts precision', () => {
    expect(formatQuantity(0.4215)).toBe('0,4215');
    expect(formatQuantity(2400)).toBe('2.400');
  });

  test('formatRelativeTime', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    expect(formatRelativeTime('2026-01-01T11:48:00Z', now)).toBe('12 min fa');
    expect(formatRelativeTime('2026-01-01T09:00:00Z', now)).toBe('3 h fa');
    expect(formatRelativeTime('2025-12-30T12:00:00Z', now)).toBe('2 g fa');
  });

  test('formatRelativeTimeIt', () => {
    const now = new Date('2026-11-16T22:30:00Z');
    expect(formatRelativeTimeIt(now, now)).toBe('ora');
    expect(formatRelativeTimeIt('2026-11-16T22:29:30Z', now)).toBe('ora');
    expect(formatRelativeTimeIt('2026-11-16T22:25:00Z', now)).toBe('5 min fa');
    expect(formatRelativeTimeIt('2026-11-16T20:30:00Z', now)).toBe('2 h fa');
    expect(formatRelativeTimeIt('2026-11-15T20:00:00Z', now)).toBe('ieri');
    expect(formatRelativeTimeIt('2026-11-13T22:30:00Z', now)).toBe('3 g fa');
    // 27h that crosses two midnights in Rome is not "ieri".
    expect(formatRelativeTimeIt('2026-11-14T21:00:00Z', new Date('2026-11-16T00:00:00Z'))).toBe('2 g fa');
  });
});
