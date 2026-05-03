import { getOpenAIKeyCandidates, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

export type AiStrategicContextParams = {
  companyName: string;
  ticker?: string | null;
  sector?: string | null;
  source?: string | null;
  revenueLtm?: number | null;
  ebitdaLtm?: number | null;
  netIncomeLtm?: number | null;
  marketCap?: number | null;
  revenueGrowth?: number[];
  ebitMargin?: number[];
  capexPctRevenue?: number[] | null;
  modelNotes?: string[];
};

export async function generateAiStrategicContext(
  params: AiStrategicContextParams,
  apiKeys?: string[],
): Promise<string | null> {
  const keys = apiKeys ?? getOpenAIKeyCandidates('user');
  if (keys.length === 0) return null;

  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4-pro', 'gpt-5.4');
  const systemPrompt = [
    'You write neutral strategic framing for buy-side investment analysis.',
    'Return plain text only, 2 sentences maximum.',
    'Do not give a recommendation, signal, target price, valuation conclusion, or directional opinion.',
    'Explain what the company strategically is, what economic ecosystem it sits in, and the neutral diligence questions that matter.',
    'Be specific to the company. Avoid generic sector boilerplate.',
  ].join(' ');

  const userPrompt = JSON.stringify(
    {
      company: params.companyName,
      ticker: params.ticker,
      sector: params.sector,
      source: params.source,
      baseMetrics: {
        revenueLtm: params.revenueLtm ?? null,
        ebitdaLtm: params.ebitdaLtm ?? null,
        netIncomeLtm: params.netIncomeLtm ?? null,
        marketCap: params.marketCap ?? null,
      },
      assumptions: {
        revenueGrowth: params.revenueGrowth ?? [],
        ebitMargin: params.ebitMargin ?? [],
        capexPctRevenue: params.capexPctRevenue ?? null,
      },
      modelNotes: (params.modelNotes ?? []).slice(0, 4),
    },
    null,
    2,
  );

  try {
    const request = generateTextWithProviderFallback({
      clientType: 'user',
      preferredProvider: 'anthropic',
      temperature: 0.25,
      maxTokens: 170,
      openAiModels: models,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    const response = await Promise.race([request, timeout]);
    return sanitizeStrategicContext(response?.text);
  } catch {
    return null;
  }
}

export function sanitizeStrategicContext(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (trimmed.length < 80) return null;
  if (/\b(?:buy|sell|long|short|undervalued|overvalued|target price|price target)\b/i.test(trimmed)) {
    return null;
  }
  return trimmed.length > 650 ? `${trimmed.slice(0, 647).trimEnd()}...` : trimmed;
}

export function buildDeterministicStrategicContext(params: {
  ticker?: string | null;
  companyName: string;
  sector?: string | null;
  revenueGrowth0?: number | null;
  ebitMargin0?: number | null;
}): string {
  const ticker = params.ticker?.trim().toUpperCase() ?? '';
  const company = params.companyName.trim() || ticker || 'The company';
  const sector = params.sector?.trim().toLowerCase() ?? '';
  const growth = params.revenueGrowth0 ?? 0;
  const margin = params.ebitMargin0 ?? 0;

  if (ticker === 'NVDA' || /nvidia/i.test(company)) {
    return 'Strategic context: NVIDIA is a core supplier of AI infrastructure; hyperscaler and enterprise AI capex runs through its accelerators, networking, and CUDA ecosystem. The neutral diligence question is how durable that infrastructure dependency remains as GPU supply, pricing, custom silicon, and AI workload economics evolve.';
  }
  if (ticker === 'GOOGL' || /alphabet|google/i.test(company)) {
    return 'Strategic context: Alphabet is anchored by Search and YouTube cash flow, with Cloud and Gemini shaping its AI transition. The neutral diligence question is how AI search changes monetization, traffic acquisition economics, Cloud competitiveness, and the margin profile of the core advertising engine.';
  }
  if (ticker === 'MSFT' || /microsoft/i.test(company)) {
    return 'Strategic context: Microsoft sits at the enterprise AI distribution layer through Azure, Office, GitHub, and Copilot. The neutral diligence question is whether AI attach rates, cloud share, and software pricing power offset the infrastructure investment needed to serve that demand.';
  }
  if (ticker === 'AMZN' || /amazon/i.test(company)) {
    return 'Strategic context: Amazon combines retail scale with AWS, logistics, advertising, and AI infrastructure. The neutral diligence question is how AWS growth, retail margin discipline, fulfillment intensity, and advertising mix translate scale into free cash flow.';
  }
  if (ticker === 'META' || /meta platforms|facebook/i.test(company)) {
    return 'Strategic context: Meta is a scaled attention and ad-pricing platform funding a large AI and Reality Labs investment cycle. The neutral diligence question is how AI affects engagement, ad targeting, content costs, infrastructure intensity, and the return profile of long-dated platform bets.';
  }
  if (ticker === 'AAPL' || /apple/i.test(company)) {
    return 'Strategic context: Apple is a global installed-base and services monetization business more than a pure hardware cycle. The neutral diligence question is how replacement demand, Services mix, China exposure, and on-device AI influence ecosystem retention and margins.';
  }
  if (ticker === 'TSLA' || /tesla/i.test(company)) {
    return 'Strategic context: Tesla spans EV manufacturing, charging, autonomy, energy storage, and robotics narratives. The neutral diligence question is how much of the business should be underwritten as auto volume/margin versus software, autonomy, energy, and platform optionality.';
  }
  if (/semiconductor|chip|ai|technology/.test(`${sector} ${company}`.toLowerCase()) && growth >= 0.15 && margin >= 0.3) {
    return `Strategic context: ${company} screens as a high-growth technology platform where ecosystem relevance, product cycles, and substitution risk matter as much as near-term earnings. The neutral diligence question is whether growth durability and margin structure are company-specific or cycle-dependent.`;
  }
  if (/semiconductor|chip/.test(sector)) {
    return `Strategic context: ${company} operates in a semiconductor value chain shaped by design wins, foundry capacity, customer concentration, pricing cycles, and product transitions. The neutral diligence question is where the company sits in the stack and how durable its margins are through supply-demand cycles.`;
  }
  if (/software|technology|internet|communication/.test(sector)) {
    return `Strategic context: ${company} should be assessed through platform depth, customer retention, pricing power, distribution control, and AI-related product shifts. The neutral diligence question is whether growth comes from durable usage and monetization or from cyclical spending and multiple expansion.`;
  }
  if (/consumer|retail|discretionary|staples/.test(sector)) {
    return `Strategic context: ${company} is tied to brand strength, channel position, pricing power, input costs, and consumer demand elasticity. The neutral diligence question is whether volume, mix, and margin structure can hold through changing household spending conditions.`;
  }
  if (/financial|bank|insurance|asset/.test(sector)) {
    return `Strategic context: ${company} is shaped by balance sheet quality, credit conditions, rate sensitivity, capital returns, and regulatory constraints. The neutral diligence question is how earnings power changes across credit, funding, and market cycles.`;
  }
  if (/health|pharma|biotech|medical/.test(sector)) {
    return `Strategic context: ${company} is shaped by product pipelines, reimbursement, patent duration, clinical or regulatory risk, and commercial execution. The neutral diligence question is how much of future value depends on currently visible cash flows versus pipeline optionality.`;
  }
  if (/energy|oil|gas|utility|utilities/.test(sector)) {
    return `Strategic context: ${company} is exposed to commodity prices, regulation, capital intensity, reserve or asset quality, and cost discipline. The neutral diligence question is how resilient cash generation is across price cycles and policy regimes.`;
  }
  if (/industrial|materials|aerospace|transport/.test(sector)) {
    return `Strategic context: ${company} is tied to order cycles, operating leverage, supply-chain execution, input costs, and end-market capital spending. The neutral diligence question is whether current margins and backlog convert into durable cash flow through the cycle.`;
  }
  return `Strategic context: ${company}'s valuation should be interpreted through its market position, competitive advantages, reinvestment needs, balance sheet flexibility, and durability of returns. The neutral diligence question is which drivers are structural versus cyclical.`;
}
