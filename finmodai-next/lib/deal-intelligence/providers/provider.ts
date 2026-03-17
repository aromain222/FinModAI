import type { WeeklyDealIntelligence } from '@/lib/deal-intelligence/types';

export type DealIntelligenceRefreshContext = {
  reason: 'manual' | 'scheduled' | 'startup';
  triggeredAtIso: string;
};

/**
 * Provider boundary for Deal Intelligence data reads.
 * Keep UI consumers source-agnostic by returning canonical weekly brief objects.
 */
export interface DealIntelligenceDataProvider {
  listWeeklyBriefs(): Promise<WeeklyDealIntelligence[]>;
  refreshWeeklyBriefs?(context: DealIntelligenceRefreshContext): Promise<void>;
}
