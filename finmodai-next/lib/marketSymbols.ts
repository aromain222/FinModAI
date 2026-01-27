/**
 * Maps broad index names to liquid ETF proxies for data providers that lack index tickers.
 * Example: S&P 500 -> SPY, Dow -> DIA, Nasdaq 100 -> QQQ.
 */
export function resolveMarketSymbol(symbol: string): string {
  const key = symbol.toUpperCase();
  if (['SPX', 'SP500', 'S&P500', 'S&P 500', 'SP'].includes(key)) return 'SPY';
  if (['DJI', 'DOW', 'DOWJONES', 'DOW JONES'].includes(key)) return 'DIA';
  if (['NDX', 'NASDAQ', 'NASDAQ100', 'NASDAQ 100', 'IXIC'].includes(key)) return 'QQQ';
  return key;
}
