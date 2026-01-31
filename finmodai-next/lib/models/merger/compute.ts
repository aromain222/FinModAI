import { MergerModelInput } from './schema';

export async function computeMergerModel(inputs: MergerModelInput): Promise<Record<string, any>> {
  return {
    acquirer: inputs.acquirerTicker,
    target: inputs.targetTicker,
    accretionDilution: 0.05
  };
}
