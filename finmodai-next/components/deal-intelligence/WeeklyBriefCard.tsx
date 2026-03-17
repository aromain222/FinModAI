import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DealCard } from '@/components/deal-intelligence/DealCard';
import { formatDealSize, formatWeekDateRange } from '@/lib/deal-intelligence/formatters';
import { type DealEntry, type MarketSignalTone, type WeeklyDealBriefWithResolvedDeal } from '@/lib/deal-intelligence/types';

function toneStyles(tone: MarketSignalTone): string {
  if (tone === 'Risk-On') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (tone === 'Risk-Off') return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
}

function disclosedVolumeUsdM(deals: DealEntry[]): number {
  return deals.reduce((sum, deal) => sum + (deal.dealSize ?? 0), 0);
}

function disclosedVolumeLabel(deals: DealEntry[]): string {
  const hasDisclosedDeal = deals.some((deal) => (deal.dealSize ?? 0) > 0);
  if (!hasDisclosedDeal) return 'All Undisclosed';
  return `${formatDealSize(disclosedVolumeUsdM(deals))} Disclosed`;
}

type DealSectionProps = {
  title: string;
  subtitle?: string;
  deals: DealEntry[];
  showCategoryBadge?: boolean;
};

function DealSection({ title, subtitle, deals, showCategoryBadge = false }: DealSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cb-border-subtle)] pb-2">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-[var(--cb-text-primary)]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-[var(--cb-text-muted)]">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] uppercase tracking-[0.1em] text-[var(--cb-text-muted)]"
          >
            {deals.length} Deal{deals.length === 1 ? '' : 's'}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] uppercase tracking-[0.1em] text-[var(--cb-text-muted)]"
          >
            {disclosedVolumeLabel(deals)}
          </Badge>
        </div>
      </div>

      {deals.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} showCategoryBadge={showCategoryBadge} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-4 text-xs text-[var(--cb-text-muted)]">
          No notable deals captured for this section in the current week.
        </div>
      )}
    </section>
  );
}

type WeeklyBriefCardProps = {
  brief: WeeklyDealBriefWithResolvedDeal;
};

export function WeeklyBriefCard({ brief }: WeeklyBriefCardProps) {
  const sections: Array<{
    title: string;
    subtitle?: string;
    deals: DealEntry[];
    showCategoryBadge?: boolean;
  }> = [
    { title: 'Venture Funding', deals: brief.dealFlow['Venture Funding'] ?? [] },
    { title: 'M&A', deals: brief.dealFlow['M&A'] ?? [] },
    { title: 'Private Equity / Buyouts', deals: brief.dealFlow['Private Equity / Buyouts'] ?? [] },
    {
      title: 'Capital Markets',
      subtitle: 'Equity and debt issuance activity',
      deals: [...(brief.dealFlow.ECM ?? []), ...(brief.dealFlow.DCM ?? [])],
      showCategoryBadge: true,
    },
    { title: 'Strategic Partnerships', deals: brief.dealFlow['Strategic Partnership'] ?? [] },
    { title: 'Restructuring', deals: brief.dealFlow.Restructuring ?? [] },
  ];

  return (
    <Card id={brief.week} className="scroll-mt-24 overflow-hidden border-[var(--cb-border)] bg-[var(--cb-surface)]">
      <CardHeader className="space-y-5 border-b border-[var(--cb-border-subtle)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
              Week of
            </p>
            <CardTitle className="text-[1.4rem] leading-tight tracking-tight text-[var(--cb-text-primary)] sm:text-[1.65rem]">{brief.title}</CardTitle>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
              {formatWeekDateRange(brief.startDate, brief.endDate)}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Badge
              variant="outline"
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${toneStyles(brief.marketSignal.tone)}`}
            >
              {brief.marketSignal.tone}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cb-text-muted)]"
            >
              {brief.allDeals.length} Tracked Deals
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8 px-4 pb-4 pt-5 sm:px-6 sm:pb-6">
        <section className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cb-text-muted)]">Market Signal</p>
              <p className="mt-1 text-sm font-semibold text-[var(--cb-text-primary)]">{brief.marketSignal.headline}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--cb-text-secondary)]">{brief.marketSignal.detail}</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--cb-border-subtle)] pb-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Deal Of The Week</h3>
          </div>
          {brief.dealOfWeek ? (
            <DealCard deal={brief.dealOfWeek} featured variant="hero" showCategoryBadge />
          ) : (
            <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-4 text-sm text-[var(--cb-text-muted)]">
              Deal of the week is unavailable for this period.
            </div>
          )}
        </section>

        {sections.map((section) => (
          <DealSection
            key={`${brief.week}-${section.title}`}
            title={section.title}
            subtitle={section.subtitle}
            deals={section.deals}
            showCategoryBadge={section.showCategoryBadge}
          />
        ))}

        <section className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cb-text-muted)]">Analyst Take</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--cb-text-secondary)]">{brief.analystTake}</p>
        </section>
      </CardContent>
    </Card>
  );
}
