import { demoWeeklyDealBriefs } from '@/lib/deal-intelligence/demoWeeklyBriefs';
import type { DealIntelligenceDataProvider } from '@/lib/deal-intelligence/providers/provider';
import type { WeeklyDealIntelligence } from '@/lib/deal-intelligence/types';

/**
 * Demo-only provider.
 * This is intentionally deterministic so UI reviews and demos are stable across reloads.
 */
export class DemoDealIntelligenceProvider implements DealIntelligenceDataProvider {
  async listWeeklyBriefs(): Promise<WeeklyDealIntelligence[]> {
    return demoWeeklyDealBriefs;
  }
}

export const demoDealIntelligenceProvider = new DemoDealIntelligenceProvider();
