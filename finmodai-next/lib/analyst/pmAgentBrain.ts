import { retrievePmPlaybookForEvent, type RetrievedPmPlaybook } from '@/lib/analyst/pmPlaybook';

export type PmAgentBrainOutput = {
  playbook: RetrievedPmPlaybook;
  pmView: string;
  whatIsPriced: string;
  estimateRevisionRisk: string;
  multipleImpact: string;
  positioningRisk: string;
  timeHorizon: string;
  forecastOverlayPct: number;
  confidence: number;
  invalidationSignal: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 1): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function directionScore(text: string): number {
  const lower = text.toLowerCase();
  const positive =
    /\b(accelerat|beat|beats|raise|raises|raised|strong|improv|margin expansion|dovish|cooler inflation|demand|approval|buyback|partnership)\b/.test(lower);
  const negative =
    /\b(miss|misses|cut|cuts|downgrade|probe|lawsuit|antitrust|regulat|capex pressure|margin pressure|hawkish|hotter inflation|weak|delay|risk)\b/.test(lower);
  if (positive && !negative) return 1;
  if (negative && !positive) return -1;
  if (positive && negative) return 0;
  return 0;
}

function baseOverlayForPlaybook(id: RetrievedPmPlaybook['id']): number {
  switch (id) {
    case 'search_antitrust':
      return -1.4;
    case 'ai_capex':
      return -0.4;
    case 'cloud_growth':
      return 0.6;
    case 'cpi_fed':
      return 0;
    case 'earnings_guidance':
      return 0;
    case 'semiconductor_demand':
      return 0.8;
    case 'generic_catalyst':
    default:
      return 0;
  }
}

function invalidationForPlaybook(id: RetrievedPmPlaybook['id'], ticker: string): string {
  switch (id) {
    case 'ai_capex':
      return 'Invalidate if higher AI spend is matched by visible revenue acceleration, Cloud margin leverage, or clearer long-term ROI.';
    case 'search_antitrust':
      return 'Invalidate if remedies remain procedural and do not affect Search distribution, data advantages, TAC, or monetization control.';
    case 'cpi_fed':
      return 'Invalidate if the release does not move real yields, Fed-cut odds, or mega-cap tech factor positioning.';
    case 'earnings_guidance':
      return 'Invalidate if the print does not change forward estimates, guidance quality, or management credibility.';
    case 'cloud_growth':
      return 'Invalidate if Cloud growth and margins move together positively enough to offset capex concerns.';
    case 'semiconductor_demand':
      return 'Invalidate if order durability, pricing, and supply visibility remain stronger than the market expected.';
    case 'generic_catalyst':
    default:
      return `Invalidate if the catalyst fails to change ${ticker} estimates, risk premium, multiple, or investor positioning.`;
  }
}

function pmViewForPlaybook(playbook: RetrievedPmPlaybook, ticker: string): string {
  switch (playbook.id) {
    case 'ai_capex':
      return `${ticker} should move on whether investors see AI capex as productive growth investment or lower FCF conversion. The key is ROI evidence, not the spend number alone.`;
    case 'search_antitrust':
      return `${ticker} should move if the headline changes confidence in Search terminal economics. This is mainly a risk-premium and terminal-multiple channel.`;
    case 'cpi_fed':
      return `${ticker} should move through rates beta: real yields, Fed-cut odds, and mega-cap tech multiple duration matter more than company estimates.`;
    case 'earnings_guidance':
      return `${ticker} should move if guidance forces estimate revisions. The setup is about forward numbers, not just reported results.`;
    case 'cloud_growth':
      return `${ticker} should move if Cloud growth and margin leverage change the market's view of the growth runway and AI infrastructure ROI.`;
    case 'semiconductor_demand':
      return `${ticker} should move if demand durability changes forward revenue visibility or peak-cycle risk perception.`;
    case 'generic_catalyst':
    default:
      return `${ticker} should move only if this catalyst changes estimates, the multiple, risk premium, or positioning inside the forecast window.`;
  }
}

export function runPmAgentBrainForEvent(params: {
  ticker: string;
  title: string;
  impact: string;
  kind?: string | null;
  horizonLabel: string;
  rankScore?: number | null;
  playbook?: RetrievedPmPlaybook;
}): PmAgentBrainOutput {
  const playbook =
    params.playbook ??
    retrievePmPlaybookForEvent({
      ticker: params.ticker,
      title: params.title,
      impact: params.impact,
      kind: params.kind,
    });
  const text = `${params.title} ${params.impact}`;
  const directional = directionScore(text);
  const rankBoost = typeof params.rankScore === 'number' && Number.isFinite(params.rankScore)
    ? clamp((params.rankScore - 20) / 30, 0, 0.35)
    : 0;
  const overlay = clamp(baseOverlayForPlaybook(playbook.id) + directional * (0.7 + rankBoost), -5, 5);
  const confidence = clamp(0.42 + playbook.score * 0.22 + rankBoost, 0.25, 0.82);

  return {
    playbook,
    pmView: pmViewForPlaybook(playbook, params.ticker),
    whatIsPriced: playbook.whatPriced,
    estimateRevisionRisk: playbook.estimateRevisionRisk,
    multipleImpact: playbook.multipleImpact,
    positioningRisk: playbook.positioningRisk,
    timeHorizon: playbook.timeHorizon || params.horizonLabel,
    forecastOverlayPct: round(overlay),
    confidence: round(confidence, 2),
    invalidationSignal: invalidationForPlaybook(playbook.id, params.ticker),
  };
}
