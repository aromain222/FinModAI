export type TimeSeriesPoint = { t: number; v: number };

export type SourceResult<T = TimeSeriesPoint[]> = {
  ok: boolean;
  data?: T;
  error?: {
    status?: number;
    message: string;
    raw?: any;
  };
  source: string;
};

export type OrchestratorMeta = {
  sourceUsed: string;
  attemptedSources: string[];
  failures: Array<{ source: string; message: string; status?: number }>;
};

export type OrchestratorResponse<T = TimeSeriesPoint[]> = {
  data: T;
  meta: OrchestratorMeta;
};
