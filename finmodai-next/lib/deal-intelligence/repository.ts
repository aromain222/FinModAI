/**
 * Compatibility shim.
 * New code should import from `service.ts`; existing callers keep working unchanged.
 */
export {
  getWeeklyDealIntelligenceBriefs,
  refreshWeeklyDealIntelligence,
} from '@/lib/deal-intelligence/service';
