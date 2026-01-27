export type ModelKind = 'dcf' | 'lbo' | 'comps' | 'three_statement';

export interface ModelReportSection {
  id: string;
  title: string;
  body: string;
}

export interface ModelReport {
  id?: string;
  ticker: string;
  companyName?: string;
  modelKind: ModelKind;
  asOfDate: string;
  runtimeSeconds?: number;
  keyOutputs?: {
    impliedPrice?: number;
    upsidePct?: number;
    entryMultiple?: number;
    exitMultiple?: number;
    irrPct?: number;
    moic?: number;
  };
  sections: ModelReportSection[];
}

