/**
 * Analyst Chat Question Router
 *
 * Classifies every inbound message into one of five intent lanes BEFORE any LLM
 * call. The route determines which data retrieval paths fire, ensuring the model
 * reasons on verified facts rather than guessing.
 *
 * Lanes:
 *   event_intelligence  – "What major events moved markets?"
 *   market_question     – "Why did rates move today?"
 *   company_question    – "What happened with NVIDIA earnings?"
 *   financial_model     – "Generate a DCF for Google"
 *   general_finance     – "How does a leveraged recap work?"
 */
import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { detectCoreTemplatePrompt } from '@/lib/analyst/coreModelTemplates';
import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';

export type AnalystIntent =
  | 'event_intelligence'
  | 'market_question'
  | 'company_question'
  | 'financial_model'
  | 'general_finance';

export type AnalystRoute = {
  intent: AnalystIntent;
  tickers: string[];
  requiresLiveData: boolean;
  requiresNews: boolean;
  requiresFinancials: boolean;
  prefersEarningsContext: boolean;
  requiresQuarterReportContext: boolean;
};

const TICKER_STOPWORDS = new Set([
  'A', 'I', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'IF', 'IN',
  'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'OK', 'ON', 'OR', 'SO', 'TO', 'UP',
  'US', 'WE',
  'USD', 'EPS', 'DCF', 'LBO', 'IPO', 'ETF', 'CEO', 'CFO', 'CPI', 'GDP',
  'PCE', 'FED', 'ECB', 'BOE', 'BOJ', 'IMF', 'SEC',
  'THE', 'AND', 'FOR', 'WITH', 'WHAT', 'WHY', 'HOW', 'NOW', 'WHO', 'DID',
  'ARE', 'WAS', 'HAS', 'HAD', 'CAN', 'NOT', 'BUT', 'ALL', 'ANY', 'FEW',
  'HER', 'HIS', 'ITS', 'LET', 'MAY', 'NEW', 'OLD', 'OUR', 'OUT', 'OWN',
  'SAY', 'SHE', 'TOO', 'USE', 'WAY', 'YET',
  'JUST', 'LIKE', 'MAKE', 'OVER', 'SUCH', 'TAKE', 'THAN', 'THEM', 'THEN',
  'VERY', 'WHEN', 'ALSO', 'BACK', 'BEEN', 'COME', 'FROM', 'GIVE', 'GOOD',
  'HAVE', 'HERE', 'HIGH', 'KNOW', 'LAST', 'LONG', 'LOOK', 'MOST', 'MUCH',
  'MUST', 'NAME', 'ONLY', 'RATE', 'SOME', 'TELL', 'THAT', 'THIS', 'TIME',
  'WELL', 'WILL', 'WORK', 'YEAR',
]);

const WELL_KNOWN_NAMES: Array<{ pattern: RegExp; ticker: string }> = [
  { pattern: /\bsofi\b/i, ticker: 'SOFI' },
  { pattern: /\balphabet\b|\bgoogle\b|\bgoogl\b/i, ticker: 'GOOGL' },
  { pattern: /\bapple\b/i, ticker: 'AAPL' },
  { pattern: /\bmicrosoft\b/i, ticker: 'MSFT' },
  { pattern: /\bnvidia\b/i, ticker: 'NVDA' },
  { pattern: /\badvanced micro devices\b|\bamd\b/i, ticker: 'AMD' },
  { pattern: /\bamazon(?:'s|s)?\b/i, ticker: 'AMZN' },
  { pattern: /\bmeta\b|\bfacebook\b/i, ticker: 'META' },
  { pattern: /\btesla\b/i, ticker: 'TSLA' },
  { pattern: /\bnetflix\b/i, ticker: 'NFLX' },
  { pattern: /\bautodesk\b/i, ticker: 'ADSK' },
  { pattern: /\bjpmorgan\b|\bjpm\b/i, ticker: 'JPM' },
  { pattern: /\bgoldman\b/i, ticker: 'GS' },
  { pattern: /\bmorgan stanley\b/i, ticker: 'MS' },
  { pattern: /\bbank of america\b|\bbofa\b/i, ticker: 'BAC' },
  { pattern: /\bciti\b|\bcitigroup\b/i, ticker: 'C' },
  { pattern: /\bwalmart\b/i, ticker: 'WMT' },
  { pattern: /\bcostco\b/i, ticker: 'COST' },
  { pattern: /\bberkshire\b/i, ticker: 'BRK.B' },
  { pattern: /\bpalantir\b/i, ticker: 'PLTR' },
  { pattern: /\bcrowdstrike\b/i, ticker: 'CRWD' },
  { pattern: /\bsnowflake\b/i, ticker: 'SNOW' },
  { pattern: /\brtx\b|\braytheon\b/i, ticker: 'RTX' },
  { pattern: /\bboeing\b/i, ticker: 'BA' },
  { pattern: /\bcoinbase\b/i, ticker: 'COIN' },
  { pattern: /\broadblock\b|\bblock\b.*\bpayment/i, ticker: 'XYZ' },
  { pattern: /\bbroadcom\b/i, ticker: 'AVGO' },
];

export function extractTickers(message: string): string[] {
  const found = new Set<string>();

  for (const { pattern, ticker } of WELL_KNOWN_NAMES) {
    if (pattern.test(message)) found.add(ticker);
  }

  const upperMatches = message.match(/\b[A-Z]{2,5}\b/g) ?? [];
  for (const token of upperMatches) {
    if (!TICKER_STOPWORDS.has(token)) found.add(token);
  }

  return Array.from(found);
}

export function classifyIntent(message: string, tickers: string[]): AnalystIntent {
  const text = message.toLowerCase();
  const detectedModelType = classifyPrompt(message);
  const detectedCoreTemplate = detectCoreTemplatePrompt(message);
  const extractedCompany = extractCompanyQuery({ prompt: message });
  const hasCompanyContext = tickers.length > 0 || Boolean(extractedCompany.ticker || extractedCompany.companyName);
  const isValuationOrTradeAnalysisRequest =
    hasCompanyContext &&
    /\b(valuation impact|model impact|intrinsic value|undervalued|under valued|overvalued|over valued|worth|target price|price target|trade recommendation|position size|stop loss|margin of safety|upside|downside|buy|sell|long|short)\b/.test(text);
  const isInvestmentAnalysisRequest =
    hasCompanyContext &&
    (
      isValuationOrTradeAnalysisRequest ||
      /\b(as an investment|investment case|investment view|bull case|bear case|base case|intrinsic value|undervalued|overvalued|worth)\b/.test(text) ||
      (
        /\b(analy[sz]e|evaluate|assess|underwrite|frame)\b/.test(text) &&
        /\b(if|assuming|assume|under|knowing|scenario|next\s+\d+\s+years?|for\s+the\s+next\s+\d+\s+years?)\b/.test(text)
      )
    );

  const isModelRequest =
    isInvestmentAnalysisRequest ||
    detectedCoreTemplate !== null ||
    detectedModelType !== null ||
    (
      /\b(generate|build|create|draft|run|export|download|show)\b/.test(text) &&
      /\b(model|dcf|lbo|three[- ]?statement|3[- ]?statement|financial statements?|income statement|balance sheet|cash flow(?: statement)?|comps?|financial model|merger model|operating model|cap\s?table|seed round|series a|series b|series c|pre-money|saas|arr|runway|burn rate|asc 606|revenue recognition|inventory|cogs|cohort|irr|moic|waterfall)\b/.test(text)
    );
  if (isModelRequest) return 'financial_model';

  const isEventIntelligence =
    /\b(major events?|what moved|market.?moving|macro events?|what happened.*market|catalyst|geopolitical|risk.?off|risk.?on)\b/.test(text) &&
    tickers.length === 0;
  if (isEventIntelligence) return 'event_intelligence';

  const isStockPerformanceQuestion =
    /\b(how\s+is|how's|what'?s)\b.*\b(performing|trading|doing)\b/.test(text) ||
    /\b(stock|shares?)\b.*\b(performing|trading|doing)\b/.test(text) ||
    /\b(performance|price action|trading update)\b/.test(text);
  if (isStockPerformanceQuestion && hasCompanyContext) {
    return 'company_question';
  }

  const isCompanyQuestion =
    hasCompanyContext &&
    /\b(earning|revenue|eps|guidance|quarter|annual|report|miss|beat|result|outlook|margin|growth|business|model|valuation|target|upgrade|downgrade|buy|sell|hold|performing|trading|price|stock|shares?)\b/.test(text);
  if (isCompanyQuestion) return 'company_question';

  const isMarketQuestion =
    /\b(market|spy|s&p|nasdaq|dow|rates?|yield|curve|vix|dxy|dollar|oil|gold|commodit|sector|breadth|rally|selloff|sell.off|correction|bear|bull|fed|fomc|inflation|cpi|pce|gdp|jobs|payrolls|unemployment)\b/.test(text);
  if (isMarketQuestion) return 'market_question';

  if (tickers.length > 0) return 'company_question';

  return 'general_finance';
}

function isCompanyFrameworkQuestion(message: string, tickers: string[]): boolean {
  const text = message.toLowerCase();
  if (tickers.length === 0) return false;
  return (
    /\b(revenue|margin|assumption|assumptions|framework|underwrite|underwriting|drivers|driver|segment|segments)\b/.test(text) &&
    /\b(create|build|show|give|map|state|explain|outline|frame|analy[sz]e|assess)\b/.test(text)
  );
}

function isGenericEarningsSummaryQuestion(message: string, tickers: string[]): boolean {
  const text = message.toLowerCase();
  if (tickers.length === 0) return false;
  const hasEarningsAnchor =
    /\b(earnings|quarter|quarterly|results|reported|print|release)\b/.test(text);
  const hasSummaryVerb =
    /\b(tell me about|walk me through|summarize|summary|recap|what happened|how were|how did|talk me through|brief me on)\b/.test(text);
  return hasEarningsAnchor && hasSummaryVerb;
}

function isQuarterReportQuestion(message: string, tickers: string[]): boolean {
  const text = message.toLowerCase();
  if (tickers.length === 0) return false;
  return (
    /\b(q[1-4]|quarter|quarterly|earnings|results)\b/.test(text) &&
    /\b(report|financials|release|remarks|transcript|commentary|filing|numbers|pull|get|latest)\b/.test(text)
  );
}

export function routeAnalystQuery(message: string, explicitTicker?: string): AnalystRoute {
  const tickers = extractTickers(message);
  if (explicitTicker && !tickers.includes(explicitTicker.toUpperCase())) {
    tickers.unshift(explicitTicker.toUpperCase());
  }

  const intent = classifyIntent(message, tickers);
  const prefersEarningsContext =
    intent === 'company_question' &&
    (isCompanyFrameworkQuestion(message, tickers) || isGenericEarningsSummaryQuestion(message, tickers));
  const requiresQuarterReportContext = intent === 'company_question' && isQuarterReportQuestion(message, tickers);

  return {
    intent,
    tickers,
    requiresLiveData: intent !== 'general_finance' && intent !== 'financial_model',
    requiresNews: intent === 'event_intelligence' || intent === 'market_question',
    requiresFinancials: intent === 'company_question' || intent === 'financial_model',
    prefersEarningsContext,
    requiresQuarterReportContext,
  };
}
