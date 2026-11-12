import { formatMoney, formatPercent, formatQuantity, formatRelativeTime } from '@/lib/format';

// Intl output uses non-breaking spaces before the currency symbol.
const normalize = (s: string) => s.replace(/\u00a0|\u202f/g, ' ');

describe('format', () => {
  test('formatMoney uses Italian separators and groups thousands', () => {
    expect(normalize(formatMoney(161757.44))).toBe('161.757,44 €');
    expect(normalize(formatMoney(9501.8))).toBe('9.501,80 €');
    expect(normalize(formatMoney(-12.5))).toBe('−12,50 €');
    expect(normalize(formatMoney(12.5, 'EUR', { signed: true }))).toBe('+12,50 €');
  });

  test('formatPercent signs values', () => {
    expect(formatPercent(2.345)).toBe('+2,35%');
    expect(formatPercent(-0.87)).toBe('−0,87%');
    expect(formatPercent(0)).toBe('0,00%');
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
});
