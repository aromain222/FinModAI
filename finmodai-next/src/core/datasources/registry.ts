import type { DataSourceId, HydrateParamsMap } from '@/src/core/contracts/modelInputs';
import type { HydrationResult } from '@/src/core/contracts/modelOutputs';
import { hydrateFromTicker } from '@/src/core/datasources/ticker';
import { hydrateFromManual } from '@/src/core/datasources/manual';

export type DataSourceDefinition<TParams = unknown> = {
  id: DataSourceId;
  name: string;
  hydrate: (params: TParams) => Promise<HydrationResult>;
};

export const dataSourceRegistry: {
  ticker: DataSourceDefinition<HydrateParamsMap['ticker']>;
  manual: DataSourceDefinition<HydrateParamsMap['manual']>;
} = {
  ticker: {
    id: 'ticker',
    name: 'Public Ticker',
    hydrate: hydrateFromTicker,
  },
  manual: {
    id: 'manual',
    name: 'Private Manual Inputs',
    hydrate: hydrateFromManual,
  },
};

export function getDataSource<T extends DataSourceId>(
  id: T
): DataSourceDefinition<HydrateParamsMap[T]> | null {
  return (dataSourceRegistry as any)[id] || null;
}
