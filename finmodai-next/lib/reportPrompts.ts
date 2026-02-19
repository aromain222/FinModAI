export type ReportModelType = 'dcf' | 'lbo' | 'comps' | 'merger' | 'operating' | 'three-statement' | 'scorecard';

export interface ReportContext {
  ticker: string;
  modelType: ReportModelType;
  data: Record<string, any>;
}
