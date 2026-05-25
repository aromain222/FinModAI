import type { PortfolioPosition, PMAlert, InvestmentDecision, PositionThesis } from '@/lib/pm/types';
import { notifyWeeklyMemo } from './notifier';

const COLORS = {
  daily:   0x5865F2,
  weekly:  0x00D26A,
  monthly: 0xFF8C00,
} as const;

type BriefType = 'daily' | 'weekly' | 'monthly';

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

async function postEmbed(embed: DiscordEmbed): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch { /* best-effort */ }
}

function driftEmoji(pos: PortfolioPosition): string {
  if (pos.thesisIntegrity === 'broken') return '🔴';
  if (pos.thesisIntegrity === 'weakening') return '🟠';
  if (pos.thesisIntegrity === 'strengthening') return '🟢';
  return '⚪';
}

function sinceDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function recentAlerts(alerts: PMAlert[], sinceDays: number): PMAlert[] {
  const cutoff = sinceDate(sinceDays);
  return alerts.filter(a => a.createdAt >= cutoff && !a.acknowledged);
}

function recentDecisions(decisions: InvestmentDecision[], sinceDays: number): InvestmentDecision[] {
  const cutoff = sinceDate(sinceDays);
  return decisions.filter(d => d.createdAt >= cutoff);
}

function thesisSummary(theses: PositionThesis[]): { strengthening: string[]; weakening: string[]; broken: string[] } {
  return {
    strengthening: theses.filter(t => t.thesisStatus === 'strengthening').map(t => t.ticker),
    weakening:     theses.filter(t => t.thesisStatus === 'weakening').map(t => t.ticker),
    broken:        theses.filter(t => t.thesisStatus === 'broken').map(t => t.ticker),
  };
}

function pendingDecisions(decisions: InvestmentDecision[]): InvestmentDecision[] {
  return decisions.filter(d => d.approvalStatus === 'pending');
}

// ── Brief builders ────────────────────────────────────────────────────────────

export async function sendDailyBrief(data: {
  positions: PortfolioPosition[];
  alerts: PMAlert[];
  decisions: InvestmentDecision[];
  theses: PositionThesis[];
}): Promise<void> {
  const { positions, alerts, decisions, theses } = data;
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch');
  const todayAlerts = recentAlerts(alerts, 1);
  const pending = pendingDecisions(decisions);
  const thesis = thesisSummary(theses);
  const link = appUrl();

  const fields: DiscordField[] = [];

  if (active.length > 0) {
    const posLines = active.slice(0, 8).map(p =>
      `${driftEmoji(p)} **${p.ticker}** ${p.agentConsensus ? `· ${p.agentConsensus}` : ''}`,
    ).join('\n');
    fields.push({ name: `Positions (${active.length})`, value: posLines });
  }

  if (todayAlerts.length > 0) {
    const highCrit = todayAlerts.filter(a => a.severity === 'high' || a.severity === 'critical');
    fields.push({
      name: `Alerts today (${todayAlerts.length})`,
      value: highCrit.length > 0
        ? highCrit.slice(0, 4).map(a => `⚠️ ${a.ticker ?? 'Portfolio'}: ${a.title}`).join('\n')
        : `${todayAlerts.length} new alert${todayAlerts.length === 1 ? '' : 's'}, none critical`,
    });
  }

  if (pending.length > 0) {
    fields.push({
      name: `Pending approvals (${pending.length})`,
      value: pending.slice(0, 4).map(d => `• ${d.ticker} ${d.action.toUpperCase()} — ${d.confidence}% conf`).join('\n'),
    });
  }

  const thesisLines: string[] = [];
  if (thesis.broken.length > 0) thesisLines.push(`🔴 Broken: ${thesis.broken.join(', ')}`);
  if (thesis.weakening.length > 0) thesisLines.push(`🟠 Weakening: ${thesis.weakening.join(', ')}`);
  if (thesis.strengthening.length > 0) thesisLines.push(`🟢 Strengthening: ${thesis.strengthening.join(', ')}`);
  if (thesisLines.length > 0) fields.push({ name: 'Thesis health', value: thesisLines.join('\n') });

  const description = active.length === 0
    ? 'No active positions. Head to the ranked board to find setups.'
    : `${active.length} position${active.length === 1 ? '' : 's'} tracked · ${todayAlerts.length} alert${todayAlerts.length === 1 ? '' : 's'} today · ${pending.length} pending approval${pending.length === 1 ? '' : 's'}`;

  await postEmbed({
    title: '📊 Daily Portfolio Brief',
    url: link ? `${link}/portfolio` : undefined,
    description,
    color: COLORS.daily,
    fields,
    footer: { text: 'CapitalBase PM OS · End of Day' },
    timestamp: new Date().toISOString(),
  });
}

export async function sendWeeklyBrief(data: {
  positions: PortfolioPosition[];
  alerts: PMAlert[];
  decisions: InvestmentDecision[];
  theses: PositionThesis[];
}): Promise<void> {
  const { positions, alerts, decisions, theses } = data;
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch');
  const weekAlerts = recentAlerts(alerts, 7);
  const weekDecisions = recentDecisions(decisions, 7);
  const thesis = thesisSummary(theses);
  const link = appUrl();

  const approved = weekDecisions.filter(d => d.approvalStatus === 'approved');
  const rejected = weekDecisions.filter(d => d.approvalStatus === 'rejected');
  const pending = pendingDecisions(decisions);

  const fields: DiscordField[] = [];

  fields.push({
    name: 'Portfolio',
    value: `${active.length} active position${active.length === 1 ? '' : 's'}`,
    inline: true,
  });
  fields.push({
    name: 'Decisions this week',
    value: `${approved.length} approved · ${rejected.length} rejected · ${pending.length} pending`,
    inline: true,
  });
  fields.push({
    name: 'Alerts this week',
    value: `${weekAlerts.length} total`,
    inline: true,
  });

  const thesisLines: string[] = [];
  if (thesis.broken.length > 0) thesisLines.push(`🔴 Broken: ${thesis.broken.join(', ')}`);
  if (thesis.weakening.length > 0) thesisLines.push(`🟠 Weakening: ${thesis.weakening.join(', ')}`);
  if (thesis.strengthening.length > 0) thesisLines.push(`🟢 Strengthening: ${thesis.strengthening.join(', ')}`);
  if (thesisLines.length > 0) fields.push({ name: 'Thesis health', value: thesisLines.join('\n') });

  if (approved.length > 0) {
    fields.push({
      name: 'Approved this week',
      value: approved.slice(0, 5).map(d => `✅ ${d.ticker} ${d.action.toUpperCase()}`).join('\n'),
    });
  }

  if (pending.length > 0) {
    fields.push({
      name: 'Still pending',
      value: pending.slice(0, 4).map(d => `⏳ ${d.ticker} ${d.action.toUpperCase()} — ${d.confidence}%`).join('\n'),
    });
  }

  await postEmbed({
    title: '📋 Weekly Portfolio Brief',
    url: link ? `${link}/portfolio?tab=workflow` : undefined,
    description: `Week ending ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
    color: COLORS.weekly,
    fields,
    footer: { text: 'CapitalBase PM OS · Weekly Review' },
    timestamp: new Date().toISOString(),
  });
}

export async function sendMonthlyBrief(data: {
  positions: PortfolioPosition[];
  alerts: PMAlert[];
  decisions: InvestmentDecision[];
  theses: PositionThesis[];
}): Promise<void> {
  const { positions, alerts, decisions, theses } = data;
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch');
  const exited = positions.filter(p => p.status === 'exited' || p.status === 'closed');
  const monthAlerts = recentAlerts(alerts, 30);
  const monthDecisions = recentDecisions(decisions, 30);
  const thesis = thesisSummary(theses);
  const link = appUrl();

  const approved = monthDecisions.filter(d => d.approvalStatus === 'approved');
  const rejected = monthDecisions.filter(d => d.approvalStatus === 'rejected');

  const fields: DiscordField[] = [
    { name: 'Active positions', value: `${active.length}`, inline: true },
    { name: 'Exited this month', value: `${exited.length}`, inline: true },
    { name: 'Total alerts', value: `${monthAlerts.length}`, inline: true },
    { name: 'Decisions', value: `${approved.length} approved · ${rejected.length} rejected`, inline: true },
  ];

  const thesisLines: string[] = [];
  if (thesis.broken.length > 0) thesisLines.push(`🔴 Broken: ${thesis.broken.join(', ')}`);
  if (thesis.weakening.length > 0) thesisLines.push(`🟠 Weakening: ${thesis.weakening.join(', ')}`);
  if (thesis.strengthening.length > 0) thesisLines.push(`🟢 Strengthening: ${thesis.strengthening.join(', ')}`);
  if (thesisLines.length > 0) fields.push({ name: 'Thesis health', value: thesisLines.join('\n') });

  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  await postEmbed({
    title: `📅 Monthly Portfolio Brief — ${month}`,
    url: link ? `${link}/portfolio?tab=workflow` : undefined,
    description: `End-of-month snapshot across ${active.length} position${active.length === 1 ? '' : 's'}.`,
    color: COLORS.monthly,
    fields,
    footer: { text: 'CapitalBase PM OS · Monthly Review' },
    timestamp: new Date().toISOString(),
  });
}

export { notifyWeeklyMemo };
