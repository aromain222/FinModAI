import { inferTickerFromPrompt } from '@/lib/analyst/retrieval';
import type { CompanyQuery } from '@/lib/data/company/types';

const COMPANY_ALIASES: Array<{ pattern: RegExp; ticker: string; companyName: string }> = [
  { pattern: /\balphabet\b|\bgoogle\b|\bgoogl\b/i, ticker: 'GOOGL', companyName: 'Alphabet Inc.' },
  { pattern: /\bamazon\b|\bamzn\b/i, ticker: 'AMZN', companyName: 'Amazon.com, Inc.' },
  { pattern: /\boracle\b|\borcl\b/i, ticker: 'ORCL', companyName: 'Oracle Corporation' },
  { pattern: /\bbroadcom\b|\bavgo\b/i, ticker: 'AVGO', companyName: 'Broadcom Inc.' },
  { pattern: /\bnvidia\b|\bnvda\b/i, ticker: 'NVDA', companyName: 'NVIDIA Corporation' },
  { pattern: /\bapple\b|\baapl\b/i, ticker: 'AAPL', companyName: 'Apple Inc.' },
  { pattern: /\bmicrosoft\b|\bmsft\b/i, ticker: 'MSFT', companyName: 'Microsoft Corporation' },
  { pattern: /\bmeta\b|\bfacebook\b|\bmeta platforms\b/i, ticker: 'META', companyName: 'Meta Platforms, Inc.' },
  { pattern: /\bsnowflake\b|\bsnow\b/i, ticker: 'SNOW', companyName: 'Snowflake Inc.' },
  { pattern: /\btesla\b|\btsla\b/i, ticker: 'TSLA', companyName: 'Tesla, Inc.' },
  { pattern: /\bmastercard\b/i, ticker: 'MA', companyName: 'Mastercard Incorporated' },
  { pattern: /\bvisa\b/i, ticker: 'V', companyName: 'Visa Inc.' },
  { pattern: /\bcostco\b|\bcost\b/i, ticker: 'COST', companyName: 'Costco Wholesale Corporation' },
  { pattern: /\bwalmart\b|\bwmt\b/i, ticker: 'WMT', companyName: 'Walmart Inc.' },
  { pattern: /\bsalesforce\b|\bcrm\b/i, ticker: 'CRM', companyName: 'Salesforce, Inc.' },
  { pattern: /\bservicenow\b|\bservice now\b/i, ticker: 'NOW', companyName: 'ServiceNow, Inc.' },
  { pattern: /\bnetflix\b|\bnflx\b/i, ticker: 'NFLX', companyName: 'Netflix, Inc.' },
  { pattern: /\bjpmorgan\b|\bjp morgan\b|\bjpm\b/i, ticker: 'JPM', companyName: 'JPMorgan Chase & Co.' },
  { pattern: /\bsofi\b/i, ticker: 'SOFI', companyName: 'SoFi Technologies, Inc.' },
];

function normalizeTicker(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z.]{1,10}$/.test(cleaned) ? cleaned : undefined;
}

function extractCompanyNameFromPrompt(prompt: string): string | undefined {
  const match =
    prompt.match(/(?:for|of|on|analyze)\s+([A-Za-z0-9.'& -]+?)(?:\s+(?:with|at|growing|using|based|assuming|starting|raising)\b|$)/i) ||
    prompt.match(/(?:model|analysis)\s+for\s+([A-Za-z0-9.'& -]+)$/i);

  const value = match?.[1]?.trim().replace(/[.,]+$/, '');
  if (!value) return undefined;
  if (/^(a|an|the)\s+/i.test(value)) return undefined;
  if (/^(company|business|startup|saas company)$/i.test(value)) return undefined;
  return value;
}

export function extractCompanyQuery(input: CompanyQuery): { ticker?: string; companyName?: string } {
  const ticker = normalizeTicker(input.ticker);
  const companyName = input.companyName?.trim() || undefined;
  const prompt = input.prompt?.trim() || '';

  if (ticker || companyName) {
    return { ticker, companyName };
  }

  if (prompt) {
    const inferredTicker = normalizeTicker(inferTickerFromPrompt(prompt));
    if (inferredTicker) {
      const alias = COMPANY_ALIASES.find((candidate) => candidate.ticker === inferredTicker);
      return {
        ticker: inferredTicker,
        companyName: alias?.companyName,
      };
    }

    for (const alias of COMPANY_ALIASES) {
      if (alias.pattern.test(prompt)) {
        return { ticker: alias.ticker, companyName: alias.companyName };
      }
    }

    const extractedName = extractCompanyNameFromPrompt(prompt);
    if (extractedName) return { companyName: extractedName };
  }

  return {};
}
