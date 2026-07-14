import type { PMAlert, PortfolioPosition, PositionThesis } from '@/lib/pm/types';

export type PortfolioChatContext = {
  builtAt: string;
  totalMarketValue: number | null;
  positions: Array<{
    ticker: string;
    companyName: string | null;
    shares: number | null;
    currentPrice: number | null;
    costBasis: number | null;
    marketValue: number | null;
    weightPct: number | null;
    unrealizedReturnPct: number | null;
    account: string | null;
    theme: string | null;
    role: string | null;
    targetPrice: number | null;
    stopLoss: number | null;
    thesis: {
      summary: string;
      whyWeOwnIt: string;
      conviction: number;
      status: string;
      primaryDriver: string | null;
      mainRisk: string | null;
      catalysts: string[];
      addConditions: string[];
      sellConditions: string[];
      invalidationConditions: string[];
      lastReviewedAt: string | null;
      evidenceWarnings: string[];
    } | null;
  }>;
  unresolvedAlerts: Array<{
    ticker: string | null;
    severity: string;
    title: string;
    summary: string;
    suggestedAction: string;
    createdAt: string;
  }>;
  limitations: string[];
};

function round(value: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function latestThesisByTicker(theses: PositionThesis[]): Map<string, PositionThesis> {
  const latest = new Map<string, PositionThesis>();
  for (const thesis of theses) {
    const ticker = thesis.ticker.toUpperCase();
    const current = latest.get(ticker);
    if (!current || thesis.updatedAt > current.updatedAt) latest.set(ticker, thesis);
  }
  return latest;
}

export function buildPortfolioChatContext(params: {
  positions: PortfolioPosition[];
  theses: PositionThesis[];
  alerts: PMAlert[];
  builtAt?: string;
}): PortfolioChatContext {
  const active = params.positions.filter(position => position.status === 'active' || position.status === 'trimmed');
  const latestTheses = latestThesisByTicker(params.theses);
  const values = active.map(position => (
    position.shares !== null && position.currentPrice !== null
      ? position.shares * position.currentPrice
      : position.notionalExposure
  ));
  const knownTotal = values.every(value => value !== null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;

  const positions = active.map((position, index) => {
    const thesis = latestTheses.get(position.ticker.toUpperCase()) ?? null;
    const marketValue = values[index];
    const costValue = position.shares !== null && position.costBasis !== null
      ? position.shares * position.costBasis
      : null;
    return {
      ticker: position.ticker,
      companyName: position.companyName,
      shares: position.shares,
      currentPrice: position.currentPrice,
      costBasis: position.costBasis,
      marketValue: marketValue === null ? null : round(marketValue),
      weightPct: knownTotal && marketValue !== null ? round((marketValue / knownTotal) * 100, 1) : position.currentAllocation,
      unrealizedReturnPct: marketValue !== null && costValue !== null && costValue > 0
        ? round(((marketValue - costValue) / costValue) * 100, 1)
        : null,
      account: position.account ?? null,
      theme: position.portfolioTheme,
      role: position.portfolioRole,
      targetPrice: position.targetPrice ?? null,
      stopLoss: position.stopLoss ?? null,
      thesis: thesis ? {
        summary: thesis.currentThesis ?? thesis.thesisSummary,
        whyWeOwnIt: thesis.whyWeOwnIt,
        conviction: thesis.convictionScore,
        status: thesis.integrityStatus ?? thesis.thesisStatus,
        primaryDriver: thesis.primaryDriver ?? null,
        mainRisk: thesis.mainRisk ?? null,
        catalysts: thesis.catalysts.slice(0, 5),
        addConditions: thesis.addConditions.slice(0, 4),
        sellConditions: thesis.sellConditions.slice(0, 4),
        invalidationConditions: thesis.invalidationConditions.slice(0, 4),
        lastReviewedAt: thesis.lastReviewedAt ?? thesis.updatedAt,
        evidenceWarnings: thesis.researchEvidence?.warnings.slice(0, 4) ?? [],
      } : null,
    };
  }).sort((a, b) => (b.weightPct ?? -1) - (a.weightPct ?? -1));

  const limitations = [
    ...(knownTotal === null ? ['Some holdings lack shares or current prices, so portfolio weights may be incomplete.'] : []),
    ...(positions.some(position => position.thesis === null) ? ['Some active holdings do not have a saved CapitalBase thesis.'] : []),
    'Prices and theses are snapshots from the stored portfolio; treat them as stale unless their timestamps are current.',
  ];

  return {
    builtAt: params.builtAt ?? new Date().toISOString(),
    totalMarketValue: knownTotal === null ? null : round(knownTotal),
    positions,
    unresolvedAlerts: params.alerts
      .filter(alert => !alert.resolvedAt && !alert.acknowledged)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)
      .map(alert => ({
        ticker: alert.ticker,
        severity: alert.severity,
        title: alert.title,
        summary: alert.summary,
        suggestedAction: alert.suggestedAction,
        createdAt: alert.createdAt,
      })),
    limitations,
  };
}

export function portfolioChatSystemPrompt(context: PortfolioChatContext): string {
  return `You are CapitalBase, the user's portfolio research partner. Answer conversationally, like a sharp buy-side PM—not a generic assistant.

You have a server-built snapshot of the user's actual stored portfolio. Use it as the source of truth. Never claim a holding, weight, price, thesis, catalyst, or return that is not in the snapshot. When data is missing or stale, say so directly.

PM reasoning order:
1. Answer the user's exact question first.
2. Explain what is priced or assumed in the saved thesis.
3. Identify the estimate, multiple/risk-premium, macro, or positioning channel.
4. Explain portfolio-level concentration and correlation effects.
5. State what would confirm or invalidate the view.
6. End with a practical research action when useful: hold/watch, work up, add only on confirmation, trim/review, or pass.

Use a 1-3 month horizon unless the user asks for another horizon. Distinguish facts from inference. Predictions must be ranges or scenarios, never certainty. Do not submit or imply an order. Avoid boilerplate disclaimers and avoid pretending you have live news when it is not supplied. If asked about current events not present in the snapshot, say that fresh market/news research is needed.

PORTFOLIO SNAPSHOT AS OF ${context.builtAt}:
${JSON.stringify(context)}`;
}
