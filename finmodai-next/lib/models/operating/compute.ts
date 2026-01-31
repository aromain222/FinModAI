import { OperatingModelInput } from './schema';

export async function computeOperatingModel(inputs: OperatingModelInput): Promise<Record<string, any>> {
  return {
    ticker: inputs.ticker,
    revenue: inputs.revenue,
    projections: []
  };
}
