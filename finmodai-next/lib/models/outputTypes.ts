export interface ModelOutput {
  ticker: string;
  modelType: string;
  generatedAt: string;
}

export interface DCFOutput extends ModelOutput {
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number;
}

export interface LBOOutput extends ModelOutput {
  irr: number;
  moic: number;
}

export interface CompsOutput extends ModelOutput {
  peers: string[];
  medianMultiple: number;
}

export interface MergerOutput extends ModelOutput {
  accretionDilution: number;
}

export interface OperatingOutput extends ModelOutput {
  revenue: number;
  ebitda: number;
}

export interface ThreeStatementOutput extends ModelOutput {
  incomeStatement: Record<string, any>;
  balanceSheet: Record<string, any>;
  cashFlowStatement: Record<string, any>;
}
