/**
 * CapitalBase daily brief.
 *
 * One read-mostly loop, meant to run every weekday morning: re-consult the
 * resident agents (TradingAgents research debate + Senior Investment
 * Committee) on the user's held names, run a discovery scan for new ideas,
 * and compose the whole thing into a markdown brief — theses included — that
 * a scheduler can deliver (the bundled GitHub Action posts it as an issue).
 *
 * Nothing is executed: both scans run with execute:false, so the strongest
 * side effect is the pending InvestmentDecisions the scan normally persists
 * for its picks. Those ids are surfaced in the brief so a broker session can
 * act on them and report back via /api/pm/trading-agent/executed.
 */

import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { runTradingAgentScan } from '@/lib/pm/tradingAgent/scanUniverse';
import { isPersonalityKey, type PersonalityKey } from '@/lib/pm/tradingAgent/personality';
import type {
  TickerAnalysis,
  TradingAgentPick,
  TradingAgentScanRun,
} from '@/lib/pm/tradingAgent/types';

/** Scan cap is 8; leave the discovery scan small so both fit one invocation. */
const HOLDINGS_CANDIDATES_CAP = 8;
const DEFAULT_DISCOVERY_CANDIDATES = 4;

const DEFAULT_THEMES = [
  'swing trade, 1-4 week horizon',
  'needs a near-term catalyst',
];

export type DailyBriefInput = {
  origin: string;
  requestHeaders?: Headers;
  /** Held tickers to re-consult; falls back to DAILY_BRIEF_HOLDINGS, then pm_positions. */
  holdings?: string[];
  personality?: PersonalityKey;
};

export type DailyBrief = {
  ranAt: string;
  /** The rendered brief, ready to email / post / print. */
  markdown: string;
  /** Full agent read on the held names (null when no holdings were resolvable). */
  holdingsRun: TradingAgentScanRun | null;
  discoveryRun: TradingAgentScanRun;
  holdings: string[];
};

function envList(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map(entry => entry.trim().toUpperCase())
    .filter(Boolean);
}

function briefThemes(): string[] {
  const configured = (process.env.DAILY_BRIEF_THEMES ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_THEMES;
}

function briefPersonality(requested?: PersonalityKey): PersonalityKey | undefined {
  if (requested) return requested;
  const fromEnv = process.env.DAILY_BRIEF_PERSONALITY;
  return fromEnv && isPersonalityKey(fromEnv) ? fromEnv : undefined;
}

/**
 * The user's book, best effort: explicit request → DAILY_BRIEF_HOLDINGS env
 * (the external-broker case, where the real positions live outside
 * pm_positions) → active pm_positions.
 */
export async function resolveBriefHoldings(requested?: string[]): Promise<string[]> {
  if (requested && requested.length > 0) {
    return requested.map(ticker => ticker.trim().toUpperCase()).filter(Boolean).slice(0, HOLDINGS_CANDIDATES_CAP);
  }
  const fromEnv = envList('DAILY_BRIEF_HOLDINGS');
  if (fromEnv.length > 0) return fromEnv.slice(0, HOLDINGS_CANDIDATES_CAP);
  try {
    const positions = await listPositions({ limit: 100 });
    return positions
      .filter(position => position.status === 'active')
      .map(position => position.ticker.toUpperCase())
      .slice(0, HOLDINGS_CANDIDATES_CAP);
  } catch {
    return [];
  }
}

function confidenceLine(analysis: TickerAnalysis): string {
  const { consensus } = analysis;
  return `**${consensus.action.toUpperCase()}** — ${consensus.agreement} ${consensus.stance}, confidence ${consensus.confidence}/100`;
}

function blockquote(text: string): string {
  return text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');
}

function tickerSection(analysis: TickerAnalysis): string {
  return [`### ${analysis.candidate.ticker}: ${confidenceLine(analysis)}`, '', blockquote(analysis.story)].join('\n');
}

function pickLines(pick: TradingAgentPick): string {
  return [
    `- **${pick.ticker}** — ${pick.consensus.action} at confidence ${pick.consensus.confidence}/100 ` +
      `(selection score ${pick.selectionScore})`,
    `  - Sizing: $${pick.sizing.notional.toLocaleString()} (${pick.sizing.allocationPct}% of book). ${pick.sizing.reasoning}`,
    `  - Why: ${pick.selectionReason}`,
    `  - Decision id: \`${pick.decision.id}\``,
  ].join('\n');
}

/** Render the two runs into the morning brief. */
export function composeBriefMarkdown(params: {
  ranAt: string;
  holdings: string[];
  holdingsRun: TradingAgentScanRun | null;
  discoveryRun: TradingAgentScanRun;
}): string {
  const { ranAt, holdings, holdingsRun, discoveryRun } = params;
  const day = ranAt.slice(0, 10);
  const lines: string[] = [];

  lines.push(`# CapitalBase daily brief — ${day}`);
  lines.push('');
  lines.push(
    `${discoveryRun.personality.name} on the desk. Sizing against $${Math.round(discoveryRun.equity.equity).toLocaleString()} ` +
      `(${discoveryRun.equity.source}). ${discoveryRun.trackRecord.summary}`,
  );
  for (const lesson of discoveryRun.trackRecord.lessons) {
    lines.push(`- Journal: ${lesson}`);
  }
  lines.push('');

  lines.push('## Your book — today\'s agent reads');
  lines.push('');
  if (!holdingsRun) {
    lines.push('_No holdings configured. Set DAILY_BRIEF_HOLDINGS (comma-separated tickers) or hold positions in pm_positions._');
  } else {
    lines.push(`Re-consulted the agents on: ${holdings.join(', ')}.`);
    lines.push('');
    for (const analysis of holdingsRun.scanned) {
      lines.push(tickerSection(analysis));
      lines.push('');
    }
    if (holdingsRun.bookActions.length > 0) {
      lines.push('### Book defense');
      lines.push('');
      for (const action of holdingsRun.bookActions) {
        lines.push(pickLines(action));
      }
      lines.push('');
    }
  }

  lines.push('## Discovery — new ideas');
  lines.push('');
  if (discoveryRun.picks.length === 0) {
    lines.push('Nothing cleared the investment bar today.');
    lines.push('');
  } else {
    for (const pick of discoveryRun.picks) {
      lines.push(pickLines(pick));
    }
    lines.push('');
  }
  const passedOver = discoveryRun.scanned.filter(
    analysis => !discoveryRun.picks.some(pick => pick.ticker === analysis.candidate.ticker),
  );
  if (passedOver.length > 0) {
    lines.push('Passed over:');
    for (const analysis of passedOver) {
      lines.push(`- ${analysis.candidate.ticker}: ${analysis.consensus.agreement} ${analysis.consensus.stance} at ${analysis.consensus.confidence}/100 — ${analysis.consensus.rationale}`);
    }
    lines.push('');
  }
  lines.push('<details><summary>Full discovery theses</summary>');
  lines.push('');
  for (const analysis of discoveryRun.scanned) {
    lines.push(tickerSection(analysis));
    lines.push('');
  }
  lines.push('</details>');
  lines.push('');

  lines.push('## Acting on this brief');
  lines.push('');
  lines.push('Nothing was executed — picks above are pending decisions. To act through an external broker, place the order there, then report the fill:');
  lines.push('');
  lines.push('```bash');
  lines.push('curl -s -X POST "$CAPITALBASE_URL/api/pm/trading-agent/executed" \\');
  lines.push("  -H 'content-type: application/json' \\");
  lines.push('  -d \'{"decisionId":"<decision id above>","broker":"robinhood","status":"filled","notional":<usd>,"fillPrice":<price>}\'');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Run the whole morning loop. The two scans are independent, so they run in
 * parallel to stay inside one serverless invocation.
 */
export async function runDailyBrief(input: DailyBriefInput): Promise<DailyBrief> {
  const ranAt = new Date().toISOString();
  const holdings = await resolveBriefHoldings(input.holdings);
  const themes = briefThemes();
  const personality = briefPersonality(input.personality);

  const [holdingsRun, discoveryRun] = await Promise.all([
    holdings.length > 0
      ? runTradingAgentScan({
          origin: input.origin,
          requestHeaders: input.requestHeaders,
          universe: holdings,
          maxCandidates: Math.min(holdings.length, HOLDINGS_CANDIDATES_CAP),
          maxPicks: 3,
          themes: [...themes, 'already held — judge whether to add, hold, or exit'],
          personality,
          execute: false,
        })
      : Promise.resolve(null),
    runTradingAgentScan({
      origin: input.origin,
      requestHeaders: input.requestHeaders,
      maxCandidates: DEFAULT_DISCOVERY_CANDIDATES,
      themes,
      personality,
      execute: false,
    }),
  ]);

  return {
    ranAt,
    markdown: composeBriefMarkdown({ ranAt, holdings, holdingsRun, discoveryRun }),
    holdingsRun,
    discoveryRun,
    holdings,
  };
}
