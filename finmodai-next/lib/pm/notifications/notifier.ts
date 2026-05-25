import type { PMAlert, InvestmentDecision, PositionThesis, WeeklyMemo } from '@/lib/pm/types';

// Discord embed colors
const COLORS = {
  red:    0xFF4444,
  orange: 0xFF8C00,
  amber:  0xFFB300,
  green:  0x00D26A,
  blue:   0x5865F2,
  gray:   0x687080,
} as const;

type DiscordField = { name: string; value: string; inline?: boolean };

type DiscordEmbed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields?: DiscordField[];
  footer?: { text: string };
  timestamp?: string;
};

function appUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (!base) return '';
  return base.startsWith('http') ? base : `https://${base}`;
}

function workflowUrl(): string {
  const base = appUrl();
  return base ? `${base}/portfolio?tab=workflow` : '';
}

function webhookUrl(): string | null {
  return process.env.DISCORD_WEBHOOK_URL ?? null;
}

async function post(embed: DiscordEmbed): Promise<void> {
  const url = webhookUrl();
  if (!url) return; // no-op when not configured

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Never throw — notifications are best-effort
  }
}

function severityColor(severity: PMAlert['severity']): number {
  if (severity === 'critical') return COLORS.red;
  if (severity === 'high') return COLORS.orange;
  if (severity === 'medium') return COLORS.amber;
  return COLORS.gray;
}

function actionEmoji(action: string): string {
  const a = action.toLowerCase();
  if (a === 'exit' || a === 'sell' || a === 'short') return '🔴';
  if (a === 'trim') return '🟠';
  if (a === 'add' || a === 'buy' || a === 'cover') return '🟢';
  if (a === 'hold' || a === 'watch') return '🟡';
  return '⚪';
}

// ── Public notification functions ─────────────────────────────────────────────

export async function notifyAlert(alert: PMAlert, reason?: string): Promise<void> {
  if (alert.severity === 'low' || alert.severity === 'info') return;

  const ticker = alert.ticker ?? 'Portfolio';
  const emoji = alert.impactDirection === 'bullish' ? '📈' :
                alert.impactDirection === 'bearish' ? '📉' : '⚠️';

  const fields: DiscordField[] = [
    { name: 'Severity', value: alert.severity.toUpperCase(), inline: true },
    { name: 'Suggested', value: alert.suggestedAction, inline: true },
  ];

  if (alert.confidence) {
    fields.push({ name: 'Confidence', value: `${alert.confidence}%`, inline: true });
  }

  if (reason) {
    fields.push({ name: 'Why', value: reason.slice(0, 500) });
  } else if (alert.summary && alert.summary !== alert.title) {
    fields.push({ name: 'Details', value: alert.summary.slice(0, 500) });
  }

  await post({
    title: `${emoji} ${ticker} — ${alert.title}`,
    color: severityColor(alert.severity),
    fields,
    footer: { text: 'CapitalBase PM OS' },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyScoreDrop(params: {
  ticker: string;
  fromScore: number;
  toScore: number;
  action: string;
  confidence: number;
  reason: string;
}): Promise<void> {
  const { ticker, fromScore, toScore, action, confidence, reason } = params;
  const delta = toScore - fromScore;
  const emoji = actionEmoji(action);

  await post({
    title: `${emoji} ${ticker} — ${action} Signal`,
    description: reason.slice(0, 800),
    color: action === 'Exit' ? COLORS.red : action === 'Trim' ? COLORS.orange : COLORS.amber,
    fields: [
      { name: 'Score', value: `${fromScore} → ${toScore} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Confidence', value: `${confidence}%`, inline: true },
    ],
    footer: { text: 'CapitalBase Portfolio Monitor' },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyTargetHit(params: {
  ticker: string;
  score: number;
  targetScore: number;
  direction: 'up' | 'down';
  reason?: string;
}): Promise<void> {
  const { ticker, score, targetScore, direction, reason } = params;
  const emoji = direction === 'up' ? '🎯' : '🔴';
  const label = direction === 'up' ? 'Score Target Hit' : 'Score Floor Breached';

  await post({
    title: `${emoji} ${ticker} — ${label}`,
    description: reason?.slice(0, 500),
    color: direction === 'up' ? COLORS.green : COLORS.red,
    fields: [
      { name: 'Current Score', value: `${score}`, inline: true },
      { name: 'Target', value: `${targetScore}`, inline: true },
    ],
    footer: { text: 'CapitalBase Portfolio Monitor' },
    timestamp: new Date().toISOString(),
  });
}

export async function notifySignalFlip(params: {
  ticker: string;
  agentName: string;
  fromStance: string;
  toStance: string;
  conviction: number;
  reasoning: string;
}): Promise<void> {
  const { ticker, agentName, fromStance, toStance, conviction, reasoning } = params;
  const isPositive = toStance === 'bullish';
  const emoji = isPositive ? '📈' : '📉';

  await post({
    title: `${emoji} ${ticker} — Agent Signal Flip`,
    description: reasoning.slice(0, 600),
    color: isPositive ? COLORS.green : COLORS.red,
    fields: [
      { name: 'Agent', value: agentName, inline: true },
      { name: 'Stance', value: `${fromStance} → ${toStance}`, inline: true },
      { name: 'Conviction', value: `${conviction}%`, inline: true },
    ],
    footer: { text: 'CapitalBase PM OS' },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyApprovalNeeded(decision: InvestmentDecision): Promise<void> {
  const emoji = actionEmoji(decision.action);
  const link = workflowUrl();

  await post({
    title: `${emoji} ${decision.ticker} — Approval Needed`,
    url: link || undefined,
    description: decision.rationale.slice(0, 600),
    color: COLORS.blue,
    fields: [
      { name: 'Action', value: decision.action.toUpperCase(), inline: true },
      { name: 'Confidence', value: `${decision.confidence}%`, inline: true },
      ...(link ? [{ name: 'Review', value: `[Open Approval Queue](${link})` }] : []),
    ],
    footer: { text: 'CapitalBase PM OS · Approval Queue' },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyDecisionUpdate(params: {
  ticker: string;
  action: string;
  outcome: 'approved' | 'rejected' | 'deferred';
  note?: string;
}): Promise<void> {
  const { ticker, action, outcome, note } = params;
  const emoji = outcome === 'approved' ? '✅' : outcome === 'rejected' ? '❌' : '⏸️';
  const color = outcome === 'approved' ? COLORS.green : outcome === 'rejected' ? COLORS.red : COLORS.gray;
  const link = workflowUrl();

  await post({
    title: `${emoji} ${ticker} ${action.toUpperCase()} — ${outcome.charAt(0).toUpperCase() + outcome.slice(1)}`,
    url: link || undefined,
    description: note?.slice(0, 400),
    color,
    footer: { text: 'CapitalBase PM OS · Decision Log' },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyThesisBreak(params: {
  ticker: string;
  thesis: PositionThesis;
  reason: string;
}): Promise<void> {
  const { ticker, thesis, reason } = params;

  await post({
    title: `🔴 ${ticker} — Thesis Broken`,
    description: reason.slice(0, 600),
    color: COLORS.red,
    fields: [
      { name: 'Conviction', value: `${thesis.convictionScore}/100`, inline: true },
      { name: 'Status', value: thesis.thesisStatus, inline: true },
    ],
    footer: { text: 'CapitalBase PM OS' },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyWeeklyMemo(memo: WeeklyMemo): Promise<void> {
  const summary = memo.portfolioSummary ?? memo.portfolioPerformance ?? 'Weekly memo ready.';

  const fields: DiscordField[] = [];
  if (memo.topPerformers?.length) fields.push({ name: '📈 Top performers', value: memo.topPerformers.join(', '), inline: true });
  if (memo.laggards?.length) fields.push({ name: '📉 Laggards', value: memo.laggards.join(', '), inline: true });
  if (memo.thesisBreaks?.length) fields.push({ name: '🔴 Thesis breaks', value: memo.thesisBreaks.join(', ') });
  if (memo.nextWeekWatchlist?.length) fields.push({ name: '👁 Watch next week', value: memo.nextWeekWatchlist.join(', ') });

  await post({
    title: '📋 Weekly PM Memo Ready',
    description: summary.slice(0, 600),
    color: COLORS.blue,
    fields,
    footer: { text: `CapitalBase PM OS · ${memo.weekStart ?? ''} – ${memo.weekEnd ?? ''}` },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyTest(): Promise<void> {
  await post({
    title: '✅ CapitalBase Discord Notifications Active',
    description: 'Your webhook is connected. You\'ll receive alerts for thesis breaks, score drops, conviction flips, approval requests, and weekly memos.',
    color: COLORS.green,
    fields: [
      { name: 'Triggers', value: 'High/critical alerts · Score exit signals · Signal flips · Approvals · Weekly memo', },
    ],
    footer: { text: 'CapitalBase PM OS' },
    timestamp: new Date().toISOString(),
  });
}
