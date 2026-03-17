import { normalizeDealCurrency } from '@/lib/deal-intelligence/formatters';
import {
  DEAL_CATEGORIES,
  type DealCategory,
  type DealEntry,
  type DealEntryRow,
  type WeeklyDealBrief,
  type WeeklyDealIntelligenceRow,
} from '@/lib/deal-intelligence/types';

const categorySet = new Set<DealCategory>(DEAL_CATEGORIES);

function normalizeDealCategory(value: string | null | undefined): DealCategory {
  const normalized = (value ?? '').trim();
  if (categorySet.has(normalized as DealCategory)) {
    return normalized as DealCategory;
  }
  return 'M&A';
}

/**
 * Map untrusted storage rows into UI-safe canonical objects.
 * Future Supabase providers should use this adapter.
 */
export function mapDealEntryRowToDealEntry(row: DealEntryRow): DealEntry {
  return {
    id: row.id,
    week: row.week,
    title: row.title,
    date: row.date,
    company: row.company,
    counterparty: row.counterparty,
    dealType: row.deal_type,
    category: normalizeDealCategory(row.category),
    dealSize: row.deal_size,
    currency: normalizeDealCurrency(row.currency),
    sector: row.sector?.trim() || 'General',
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    tags: row.tags ?? [],
    featured: row.featured ?? false,
    feedFrames: row.feed_frames ?? undefined,
  };
}

export function mapWeeklyRowToWeeklyBrief(
  weekRow: WeeklyDealIntelligenceRow,
  dealRows: DealEntryRow[]
): WeeklyDealBrief {
  return {
    id: weekRow.id,
    week: weekRow.week,
    title: weekRow.title,
    date: weekRow.date,
    startDate: weekRow.start_date,
    endDate: weekRow.end_date,
    marketSignal: {
      tone: weekRow.market_signal_tone,
      headline: weekRow.market_signal_headline,
      detail: weekRow.market_signal_detail,
    },
    analystTake: weekRow.analyst_take,
    deals: dealRows.map(mapDealEntryRowToDealEntry),
  };
}
