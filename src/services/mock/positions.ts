import type { Position, PositionsSource, Source } from '../types';

/**
 * MOCK positions (quantities only). Wallets/IBKR aren't connected yet; crypto values are
 * priced live from Kraken, stocks from `mockStockPriceSource`.
 */
export const MOCK_SOURCES: Source[] = [
  { id: 'ibkr', name: 'Interactive Brokers', kind: 'broker', detail: 'Flex Query · U1234567' },
  { id: 'ledger', name: 'Ledger', kind: 'wallet', detail: 'Bitcoin · bc1q…7x2k' },
  { id: 'metamask', name: 'MetaMask', kind: 'wallet', detail: 'Ethereum · 0x3f…a91c' },
  { id: 'binance', name: 'Binance', kind: 'exchange', detail: 'API sola lettura' },
];

export const MOCK_POSITIONS: Position[] = [
  { id: 'ibkr-vwce', sourceId: 'ibkr', symbol: 'VWCE', name: 'Vanguard FTSE All-World', assetClass: 'stocks', instrument: 'etf', quantity: 310 },
  { id: 'ibkr-cspx', sourceId: 'ibkr', symbol: 'CSPX', name: 'iShares Core S&P 500', assetClass: 'stocks', instrument: 'etf', quantity: 28 },
  { id: 'ibkr-nvda', sourceId: 'ibkr', symbol: 'NVDA', name: 'NVIDIA', assetClass: 'stocks', instrument: 'stock', quantity: 64 },
  { id: 'ibkr-aapl', sourceId: 'ibkr', symbol: 'AAPL', name: 'Apple', assetClass: 'stocks', instrument: 'stock', quantity: 40 },
  { id: 'ibkr-msft', sourceId: 'ibkr', symbol: 'MSFT', name: 'Microsoft', assetClass: 'stocks', instrument: 'stock', quantity: 22 },
  { id: 'ledger-btc', sourceId: 'ledger', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', instrument: 'coin', quantity: 0.4215 },
  { id: 'metamask-eth', sourceId: 'metamask', symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', instrument: 'coin', quantity: 3.82 },
  { id: 'binance-sol', sourceId: 'binance', symbol: 'SOL', name: 'Solana', assetClass: 'crypto', instrument: 'coin', quantity: 46.5 },
  { id: 'binance-btc', sourceId: 'binance', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', instrument: 'coin', quantity: 0.085 },
];

export const mockPositionsSource: PositionsSource = {
  async getSources() {
    return MOCK_SOURCES;
  },
  async getPositions() {
    return MOCK_POSITIONS;
  },
};
