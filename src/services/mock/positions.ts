import type { Position, Source } from '../types';

/**
 * MOCK IBKR positions (quantities only). Crypto comes from the Tangem wallet via `/wallets`.
 * Stock values are priced from `mockStockPriceSource` until Flex Query is connected.
 */
export const MOCK_SOURCES: Source[] = [
  { id: 'ibkr', name: 'Interactive Brokers', kind: 'broker', detail: 'Flex Query · U1234567' },
];

export const MOCK_POSITIONS: Position[] = [
  { id: 'ibkr-vwce', sourceId: 'ibkr', symbol: 'VWCE', name: 'Vanguard FTSE All-World', assetClass: 'stocks', instrument: 'etf', quantity: 310 },
  { id: 'ibkr-cspx', sourceId: 'ibkr', symbol: 'CSPX', name: 'iShares Core S&P 500', assetClass: 'stocks', instrument: 'etf', quantity: 28 },
  { id: 'ibkr-nvda', sourceId: 'ibkr', symbol: 'NVDA', name: 'NVIDIA', assetClass: 'stocks', instrument: 'stock', quantity: 64 },
  { id: 'ibkr-aapl', sourceId: 'ibkr', symbol: 'AAPL', name: 'Apple', assetClass: 'stocks', instrument: 'stock', quantity: 40 },
  { id: 'ibkr-msft', sourceId: 'ibkr', symbol: 'MSFT', name: 'Microsoft', assetClass: 'stocks', instrument: 'stock', quantity: 22 },
];


