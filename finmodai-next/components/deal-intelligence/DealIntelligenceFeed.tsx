import { DealIntelligenceTerminal } from '@/components/deal-intelligence/DealIntelligenceTerminal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatWeekDateRange } from '@/lib/deal-intelligence/formatters';
import { getWeeklyDealIntelligenceBriefs } from '@/lib/deal-intelligence/service';

export async function DealIntelligenceFeed() {
  const briefs = await getWeeklyDealIntelligenceBriefs();
  const totalDeals = briefs.reduce((sum, brief) => sum + brief.allDeals.length, 0);
  const latestBrief = briefs[0] ?? null;
  const avgDealsPerWeek = briefs.length > 0 ? Math.round((totalDeals / briefs.length) * 10) / 10 : 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <Card className="border-[var(--cb-border)] bg-[var(--cb-surface)]">
        <CardHeader className="space-y-2 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Deal Intelligence</p>
              <CardTitle className="mt-1 text-2xl leading-tight tracking-tight text-[var(--cb-text-primary)] sm:text-3xl">
                Condensed Multi-Feed Briefing
              </CardTitle>
            </div>
            {latestBrief ? (
              <div className="rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--cb-text-muted)]">Current Week</p>
                <p className="text-xs font-semibold text-[var(--cb-text-primary)]">{latestBrief.week}</p>
                <p className="text-xs text-[var(--cb-text-muted)]">{formatWeekDateRange(latestBrief.startDate, latestBrief.endDate)}</p>
              </div>
            ) : null}
          </div>
          <p className="max-w-4xl text-sm text-[var(--cb-text-secondary)]">
            Weekly deal flow organized by professional lens for faster scanning across venture, banking, consulting, capital markets, buyouts,
            and macro risk.
          </p>
        </CardHeader>

        <CardContent className="grid gap-2 border-t border-[var(--cb-border-subtle)] pt-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Weeks Covered</p>
            <p className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">{briefs.length}</p>
          </div>
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Tracked Deals</p>
            <p className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">{totalDeals}</p>
          </div>
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Avg Deals / Week</p>
            <p className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">{avgDealsPerWeek}</p>
          </div>
        </CardContent>
      </Card>

      {briefs.length > 0 ? (
        <DealIntelligenceTerminal briefs={briefs} />
      ) : (
        <Card className="border-[var(--cb-border)] bg-[var(--cb-surface)]">
          <CardContent className="p-6 text-sm text-[var(--cb-text-muted)]">
            No weekly deal briefs are currently available.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
