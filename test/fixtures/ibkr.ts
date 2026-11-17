import { IBKR_SOURCE, ibkrQuotes, mapIbkrToPositions, type IbkrPosition, type IbkrPositionsResponse } from '@/services/ibkr';

/** Fake `GET /positions` payload (made-up quantities and prices; no real account data). */
function row(symbol: string, description: string, subCategory: string, quantity: number, markPriceBase: number): IbkrPosition {
  return {
    symbol,
    description,
    isin: null,
    conid: symbol.toLowerCase(),
    currency: 'EUR',
    assetCategory: 'STK',
    subCategory,
    listingExchange: null,
    quantity,
    markPrice: markPriceBase,
    positionValue: quantity * markPriceBase,
    costBasisPrice: null,
    costBasisMoney: null,
    fxRateToBase: 1,
    unrealizedPnl: null,
    valueBase: quantity * markPriceBase,
    markPriceBase,
    reportDate: '2026-11-16',
  };
}

export const IBKR_FIXTURE: IbkrPositionsResponse = {
  source: 'ibkr',
  asOf: '2026-11-16',
  generatedAt: '2026-11-17T08:46:23',
  fetchedAt: '2026-11-17T08:50:00.000Z',
  stale: false,
  baseCurrency: 'EUR',
  cash: [],
  positions: [
    row('VWCE', 'Vanguard FTSE All-World', 'ETF', 310, 132.86),
    row('CSPX', 'iShares Core S&P 500', 'ETF', 28, 612.4),
    row('NVDA', 'NVIDIA', 'COMMON', 64, 171.22),
    row('AAPL', 'Apple', 'COMMON', 40, 218.05),
    row('MSFT', 'Microsoft', 'COMMON', 22, 431.9),
  ],
  totalValueBase: 0,
};

export const FIXTURE_IBKR_POSITIONS = mapIbkrToPositions(IBKR_FIXTURE);
export const FIXTURE_STOCK_QUOTES = ibkrQuotes(IBKR_FIXTURE);
export { IBKR_SOURCE };
