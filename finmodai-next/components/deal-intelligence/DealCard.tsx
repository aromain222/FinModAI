import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDealSize, getDealCategoryLabel } from '@/lib/deal-intelligence/formatters';
import { cn } from '@/lib/utils';
import type { DealEntry } from '@/lib/deal-intelligence/types';

type DealCardProps = {
  deal: DealEntry;
  featured?: boolean;
  variant?: 'compact' | 'hero';
  showCategoryBadge?: boolean;
};

export function DealCard({ deal, featured = false, variant = 'compact', showCategoryBadge = true }: DealCardProps) {
  const isHero = variant === 'hero';

  return (
    <Card
      className={cn(
        'h-full border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] shadow-none',
        featured && 'border-[var(--cb-border)] bg-[var(--cb-surface-subtle)]',
        isHero && 'relative overflow-hidden'
      )}
    >
      <CardHeader className={cn('pb-2', isHero ? 'space-y-3 p-5 sm:p-6' : 'space-y-2 p-4')}>
        {isHero && (
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--cb-border)] to-transparent" />
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {showCategoryBadge && (
            <Badge
              variant="outline"
              className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cb-text-muted)]"
            >
              {getDealCategoryLabel(deal.category)}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cb-text-muted)]"
          >
            {deal.dealType}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cb-text-muted)]"
          >
            {formatDealSize(deal.dealSize)} {deal.currency}
          </Badge>
        </div>
        <CardTitle className={cn('leading-tight text-[var(--cb-text-primary)]', isHero ? 'text-xl tracking-tight sm:text-2xl' : 'text-sm')}>
          {deal.title}
        </CardTitle>
        {deal.counterparty && (
          <p className={cn('text-[var(--cb-text-muted)]', isHero ? 'text-sm' : 'text-xs')}>
            Counterparty: <span className="font-medium text-[var(--cb-text-secondary)]">{deal.counterparty}</span>
          </p>
        )}
      </CardHeader>
      <CardContent className={cn('pt-0', isHero ? 'space-y-4 px-5 pb-5 sm:px-6 sm:pb-6' : 'space-y-2 px-4 pb-4')}>
        <p className={cn('leading-relaxed text-[var(--cb-text-body)]', isHero ? 'text-sm' : 'text-xs')}>
          {deal.summary}
        </p>
        <p className={cn('leading-relaxed text-[var(--cb-text-secondary)]', isHero ? 'text-sm' : 'text-xs')}>
          <span className="font-semibold text-[var(--cb-text-primary)]">Why it matters:</span> {deal.whyItMatters}
        </p>
        {deal.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {deal.tags.map((tag) => (
              <Badge
                key={`${deal.id}-${tag}`}
                variant="outline"
                className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--cb-text-muted)]"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
