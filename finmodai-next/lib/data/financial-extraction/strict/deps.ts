import { resolveFinancialExtractionCompany } from '@/lib/data/financial-extraction/companyResolver';
import { runSourceDiscoveryAgent } from '@/lib/data/sourceDiscoveryAgent';

export const strictFinancialPipelineDeps = {
  runSourceDiscoveryAgent,
  resolvePublicCompany: async (input: { ticker: string; companyIdentifier: string | null }) => {
    return resolveFinancialExtractionCompany({
      lane: 'public',
      ticker: input.ticker,
      companyIdentifier: input.companyIdentifier ?? undefined,
    });
  },
};
