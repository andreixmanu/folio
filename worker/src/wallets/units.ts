/**
 * Convert a raw integer amount to a JS number via a decimal string, so values
 * like 2e18 wei never go through `Number(raw) / 10**decimals`.
 */
export function formatUnits(raw: bigint, decimals: number): number {
  const negative = raw < 0n;
  const value = negative ? -raw : raw;
  const places = BigInt(decimals);
  const base = 10n ** places;
  const whole = value / base;
  const frac = value % base;
  const fracStr = frac.toString().padStart(decimals, '0');
  const signed = negative ? '-' : '';
  return Number(`${signed}${whole.toString()}.${fracStr}`);
}
