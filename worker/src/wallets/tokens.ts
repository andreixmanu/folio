export type Erc20Token = {
  symbol: string;
  name: string;
  contract: string;
  decimals: number;
};

/** Easy-to-extend ERC-20 list (Ethereum mainnet). */
export const ERC20_TOKENS: readonly Erc20Token[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
  },
];
