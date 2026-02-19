/**
 * Institutional investment memo prompt template.
 * Used to generate professional memos from model outputs, company data, and macro/market context.
 */

export interface InvestmentMemoContext {
  modelType: string;
  company: {
    name: string;
    ticker: string;
    sector?: string;
  };
  enterpriseValue?: string | number;
  equityValue?: string | number;
  impliedPrice?: string | number;
  assumptions?: string;
  macroSnapshot?: string;
  marketContext?: string;
}

export const INVESTMENT_MEMO_PROMPT_TEMPLATE = `You are a senior equity research analyst writing an institutional-quality investment memo.

Context:
Model Type: {{modelType}}
Company: {{company.name}} ({{company.ticker}})
Sector: {{company.sector}}

Valuation Outputs:
Enterprise Value: {{enterpriseValue}}
Equity Value: {{equityValue}}
Implied Price: {{impliedPrice}}

Key Assumptions:
{{assumptions}}

Macro Context:
{{macroSnapshot}}

Market Context:
{{marketContext}}

Write a professional investment memo structured as:

1. Investment Overview
2. Valuation Summary
3. Key Drivers
4. Risks
5. Macro & Market Context
6. Conclusion

Tone: Institutional. Concise. No fluff. No emojis.`;

function escapeForPrompt(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value.trim() || '—';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'name' in value && 'ticker' in value) {
    const c = value as { name: string; ticker: string; sector?: string };
    return `${c.name} (${c.ticker})${c.sector != null ? `, Sector: ${c.sector}` : ''}`;
  }
  return String(value);
}

/**
 * Fills the investment memo prompt template with the given context.
 * Use the returned string as the user prompt for an LLM to generate the memo.
 */
export function fillInvestmentMemoPrompt(context: InvestmentMemoContext): string {
  const sector = context.company?.sector ?? '—';

  const replacements: Record<string, string> = {
    '{{modelType}}': String(context.modelType || '—'),
    '{{company.name}}': String(context.company?.name ?? '—'),
    '{{company.ticker}}': String(context.company?.ticker ?? '—'),
    '{{company.sector}}': sector,
    '{{enterpriseValue}}': escapeForPrompt(context.enterpriseValue),
    '{{equityValue}}': escapeForPrompt(context.equityValue),
    '{{impliedPrice}}': escapeForPrompt(context.impliedPrice),
    '{{assumptions}}': (context.assumptions && context.assumptions.trim()) || 'Not provided.',
    '{{macroSnapshot}}': (context.macroSnapshot && context.macroSnapshot.trim()) || 'Macro data not available.',
    '{{marketContext}}': (context.marketContext && context.marketContext.trim()) || 'Market performance data not available.',
  };

  let out = INVESTMENT_MEMO_PROMPT_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(key).join(value);
  }
  return out;
}
