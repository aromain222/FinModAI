import type { ModelType, ReportAudience } from './reportTypes';
import type { ReportMacroSnapshot } from './reportMacro';

export interface ReportInput {
  ticker: string;
  companyName: string;
  modelType: ModelType;
  sector?: string;
  country?: string;
  impliedValuePerShare?: number;
  currentPrice?: number;
  upsidePct?: number;
  wacc?: number;
  revenueCagr?: number;
  ebitdaMarginTrend?: string;
  leverageAtEntry?: number;
  leverageAtExit?: number;
  lboIrr?: number;
  lboMoic?: number;
  peerMultiplesSummary?: string;
  notes?: string;
  macroSnapshot?: ReportMacroSnapshot;
}

export function getAudienceForModelType(modelType: ModelType): ReportAudience {
  switch (modelType) {
    case 'dcf':
      return 'public_equity';
    case 'lbo':
      return 'private_equity';
    case 'comps':
      return 'investment_banking';
    case 'three-statement':
    default:
      return 'fpna';
  }
}

export function buildReportSystemPrompt(modelType: ModelType): string {
  switch (modelType) {
    case 'dcf':
      return 'You are a senior sell-side equity research analyst and valuation expert. Your job is to write professional, concise, technically sound reports for public equity PMs and investment bankers. Speak in neutral, analytical language and focus on valuation drivers.';
    case 'lbo':
      return 'You are a private equity investment professional crafting short IC memos and deal commentary. Evaluate leverage, coverage, and IRR/MOIC dynamics in a pragmatic, partner-ready tone.';
    case 'comps':
      return 'You are an investment banking analyst writing trading comps commentary for ECM and M&A execution teams. Discuss relative valuation, peer positioning, and catalysts.';
    case 'three-statement':
    default:
      return 'You are an FP&A / lender-style analyst focused on cash generation, leverage, and coverage. Provide practical insights that credit committees and finance leaders can use.';
  }
}

export function buildReportUserPrompt(input: ReportInput): string {
  const parts: string[] = [];
  parts.push(
    `Company: ${input.companyName} (${input.ticker})`,
    `Model Type: ${input.modelType}`,
    input.sector ? `Sector: ${input.sector}` : '',
    input.country ? `Country: ${input.country}` : '',
    input.impliedValuePerShare !== undefined
      ? `Implied value per share: ${input.impliedValuePerShare.toFixed(2)}`
      : '',
    input.currentPrice !== undefined ? `Current price: ${input.currentPrice.toFixed(2)}` : '',
    input.upsidePct !== undefined ? `Upside vs spot: ${input.upsidePct.toFixed(1)}%` : '',
    input.wacc !== undefined ? `WACC: ${(input.wacc * 100).toFixed(1)}%` : '',
    input.revenueCagr !== undefined ? `Revenue CAGR (forecast window): ${input.revenueCagr.toFixed(1)}%` : '',
    input.ebitdaMarginTrend ? `EBITDA margin trend: ${input.ebitdaMarginTrend}` : '',
    input.leverageAtEntry !== undefined ? `LBO entry leverage: ${input.leverageAtEntry.toFixed(1)}x` : '',
    input.leverageAtExit !== undefined ? `LBO exit leverage: ${input.leverageAtExit.toFixed(1)}x` : '',
    input.lboIrr !== undefined ? `LBO IRR: ${input.lboIrr.toFixed(1)}%` : '',
    input.lboMoic !== undefined ? `LBO MOIC: ${input.lboMoic.toFixed(2)}x` : '',
    input.peerMultiplesSummary ? `Peer multiples: ${input.peerMultiplesSummary}` : '',
    input.notes ? `Additional notes: ${input.notes}` : '',
  );

  if (input.macroSnapshot) {
    const macro = input.macroSnapshot;
    parts.push(
      'Macro snapshot:',
      `• Fed Funds rate: ${macro.fedFundsRate.toFixed(2)}%`,
      `• Inflation (CPI): ${macro.inflationRate.toFixed(1)}%`,
      `• Sector leaders: ${macro.sectorLeaders.join('; ')}`,
      `• Sector laggards: ${macro.sectorLaggards.join('; ')}`,
      `• Credit spreads: ${macro.creditSpreads.label} ${macro.creditSpreads.levelBps.toFixed(0)} bps (${macro.creditSpreads.direction})`,
    );
  }

  const jsonSchema = `Return ONLY valid JSON matching this shape without prose:
{
  "ticker": "${input.ticker}",
  "companyName": "${input.companyName}",
  "modelType": "${input.modelType}",
  "audience": "<auto infer>",
  "generatedAt": "<ISO timestamp>",
  "title": "string",
  "subtitle": "string",
  "oneLineSummary": "string",
  "keyTakeaways": ["bullet 1", "bullet 2"],
  "companySnapshot": {
    "businessModel": "string",
    "revenueDrivers": ["driver 1", "driver 2"],
    "marginProfile": "string",
    "capitalStructure": "string"
  },
  "valuationSummary": {
    "headline": "string",
    "baseCase": "string",
    "bullCase": "string",
    "bearCase": "string",
    "upsideDownsideCommentary": "string"
  },
  "macroContext": {
    "regimeLabel": "string",
    "themes": ["theme 1", "theme 2"]
  },
  "riskAndMitigants": {
    "risks": ["risk 1", "risk 2"],
    "mitigants": ["mitigant 1", "mitigant 2"]
  },
  "processNotes": "string"
}`;

  return `${parts.filter(Boolean).join('\n')}\n\n${jsonSchema}`;
}
