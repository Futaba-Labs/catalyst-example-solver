export const assetMap: Record<
  string,
  {
    coingecko: string;
    binance: string;
    coinbase: string;
  }
> = {
  btc: {
    coingecko: 'bitcoin',
    binance: 'btc',
    coinbase: 'btc',
  },
  usdc: {
    coingecko: 'usd-coin',
    binance: 'usdc',
    coinbase: 'usdc',
  },
};
