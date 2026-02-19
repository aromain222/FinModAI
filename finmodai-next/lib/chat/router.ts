import { chatWindowSchema, type ChatIntent, type ChatWindow } from '@/lib/chat/schemas';

const TICKER_STOPWORDS = new Set([
  'A',
  'I',
  'USD',
  'EPS',
  'DCF',
  'COMPS',
  'THE',
  'AND',
  'FOR',
  'WITH',
  'WHAT',
  'WHY',
  'HOW',
  'NOW',
  'SPY',
  'VIX',
  'DXY',
]);

export type RoutedQuery = {
  intent: ChatIntent;
  window: ChatWindow;
  tickers: string[];
  asksWhy: boolean;
};

export function selectWindow(explicitWindow: string | undefined, message: string): ChatWindow {
  const parsed = chatWindowSchema.safeParse((explicitWindow || '').toLowerCase());
  if (parsed.success) return parsed.data;

  const text = message.toLowerCase();
  if (/\btoday\b|\blatest\b|\bright now\b|\bjust happened\b/.test(text)) return '1d';
  if (/\bthis week\b|\bweek\b/.test(text)) return '1w';
  if (/\bthis month\b|\bmonth\b/.test(text)) return '1m';
  return '3d';
}

export function extractTickers(message: string): string[] {
  const matches = message.toUpperCase().match(/\b[A-Z]{1,5}\b/g) ?? [];
  const unique = Array.from(new Set(matches));
  return unique.filter((token) => !TICKER_STOPWORDS.has(token));
}

export function classifyIntent(message: string, tickers: string[]): ChatIntent {
  const text = message.toLowerCase();

  const isCompanyModel =
    tickers.length > 0 &&
    /\bdcf\b|\bcomps?\b|\bthree[-\s]?statement\b|\bvaluation\b|\bfundamental\b|\brevenue\b|\bebitda\b|\bnet income\b|\bmodel\b|\btarget price\b/.test(
      text
    );
  if (isCompanyModel) return 'company_model';

  const isNewsRecent =
    /\bnews\b|\bheadline\b|\bevent\b|\bcatalyst\b|\bwhy did\b|\bwhat happened\b|\brecent\b|\blatest\b|\btoday\b|\bthis week\b/.test(
      text
    );
  if (isNewsRecent) return 'news_recent';

  const isMarketLive =
    /\bmarket\b|\bspy\b|\bs&p\b|\bmovers?\b|\bsector\b|\bbreadth\b|\brates\b|\bvix\b|\bdxy\b|\boil\b|\bgold\b/.test(
      text
    );
  if (isMarketLive) return 'market_live';

  return 'general_finance';
}

export function routeChatQuery(message: string, explicitWindow?: string): RoutedQuery {
  const tickers = extractTickers(message);
  const intent = classifyIntent(message, tickers);
  const window = selectWindow(explicitWindow, message);
  const asksWhy = /\bwhy\b|\bbecause\b|\bdriver\b|\bcatalyst\b/.test(message.toLowerCase());
  return { intent, window, tickers, asksWhy };
}

