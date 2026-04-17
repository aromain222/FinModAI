import {
  createAndProcessFinancialExtractionJob,
} from '@/lib/data/financial-extraction/orchestrator';
import { getFinancialExtractionJob, listFinancialExtractionJobs } from '@/lib/data/financial-extraction/persistence';

export const financialExtractionRouteDeps = {
  createAndProcessFinancialExtractionJob,
  getFinancialExtractionJob,
  listFinancialExtractionJobs,
};
