/**
 * Market Snapshot Prompt
 * 
 * System and user prompts for generating Market Snapshot analysis
 */

export type MarketSnapshotInput = {
  macroInputs: {
    cpi?: number;
    unemployment?: number;
    fedFunds?: number;
    spy1w?: number;
    spy1m?: number;
  };
  headlines: Array<{ title: string; source?: string; publishedAt?: string }>;
  dataGaps: string[];
};

export function buildMarketSnapshotPrompt(input: MarketSnapshotInput): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a senior macro strategist providing institutional-quality market analysis.

CRITICAL RULES:
1. Use ONLY the provided macro inputs and headlines - NEVER hallucinate facts, numbers, or events
2. If data is missing, acknowledge it clearly but do not invent values
3. Summary must be 3-5 sentences maximum, plain English
4. Confidence must reflect data completeness: "low" if gaps are large, "medium" if some data missing, "high" only with complete data
5. keyDrivers: maximum 3 items, each as {label: "short noun phrase", detail: "one-line explanation"}
6. risksAndGaps: maximum 3 items, include provided data gaps if relevant
7. watchNext: maximum 4 items, generic macro watch items if no calendar data (e.g., "Watch credit spreads", "Monitor Fed communications")
8. Never include system metadata, debug text, or "coming soon" language
9. Tone must be based ONLY on provided data: risk_on (bullish), risk_off (bearish), or neutral
10. All text must be plain strings - no markdown, no formatting

Your analysis should:
- Explain what the macro data means in context
- Identify key market drivers from the data and headlines
- Highlight risks and data limitations transparently
- Provide actionable watch items
- Use only factual information provided`;

  const macroFacts: string[] = [];
  if (input.macroInputs.cpi !== undefined) {
    macroFacts.push(`CPI (YoY): ${input.macroInputs.cpi.toFixed(2)}%`);
  }
  if (input.macroInputs.unemployment !== undefined) {
    macroFacts.push(`Unemployment: ${input.macroInputs.unemployment.toFixed(2)}%`);
  }
  if (input.macroInputs.fedFunds !== undefined) {
    macroFacts.push(`Fed Funds Rate: ${input.macroInputs.fedFunds.toFixed(2)}%`);
  }
  if (input.macroInputs.spy1w !== undefined) {
    macroFacts.push(`SPY 1-week change: ${input.macroInputs.spy1w >= 0 ? '+' : ''}${input.macroInputs.spy1w.toFixed(2)}%`);
  }
  if (input.macroInputs.spy1m !== undefined) {
    macroFacts.push(`SPY 1-month change: ${input.macroInputs.spy1m >= 0 ? '+' : ''}${input.macroInputs.spy1m.toFixed(2)}%`);
  }

  const headlineText = input.headlines.length > 0
    ? input.headlines.map((h, idx) => `${idx + 1}. ${h.title}${h.source ? ` (${h.source})` : ''}${h.publishedAt ? ` - ${h.publishedAt}` : ''}`).join('\n')
    : 'No headlines provided';

  const gapsText = input.dataGaps.length > 0
    ? `Data Gaps:\n${input.dataGaps.map(g => `- ${g}`).join('\n')}`
    : 'No data gaps reported';

  const userPrompt = `Generate a Market Snapshot analysis using ONLY the provided facts.

Macro Data:
${macroFacts.length > 0 ? macroFacts.join('\n') : 'No macro data provided'}

Headlines:
${headlineText}

${gapsText}

Return STRICT JSON matching this schema:
{
  "title": "Market Snapshot",
  "tone": "risk_on" | "neutral" | "risk_off",
  "summary": "3-5 sentence plain English summary (max 300 words)",
  "confidence": "high" | "medium" | "low",
  "keyDrivers": [
    {"label": "short noun phrase", "detail": "one-line explanation"}
  ],
  "risksAndGaps": [
    {"label": "risk or gap name", "detail": "one-line explanation"}
  ],
  "watchNext": [
    {"label": "what to watch", "date": "YYYY-MM-DD or null", "why": "reason"}
  ]
}

Constraints:
- summary: 3-5 sentences, plain English, max 300 words
- keyDrivers: max 3 items
- risksAndGaps: max 3 items (include relevant data gaps)
- watchNext: max 4 items (use null for date if no specific calendar date)
- confidence: "low" if data gaps are large, otherwise based on data completeness
- tone: risk_on (bullish conditions), risk_off (bearish conditions), or neutral
- Use ONLY provided facts - never invent numbers or events`;

  return { systemPrompt, userPrompt };
}

