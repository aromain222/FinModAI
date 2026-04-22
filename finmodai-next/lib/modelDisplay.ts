export function getModelDisplayLabel(modelType: string): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
    case 'three-statement':
      return 'Forecast Model';
    case 'DCF':
    case 'dcf':
      return 'Discounted Cash Flow';
    case 'LBO':
    case 'lbo':
      return 'LBO Underwriting';
    case 'COMPS':
    case 'comps':
      return 'Trading Comparables';
    case 'FOOTBALL_FIELD':
    case 'football-field':
      return 'Valuation Football Field';
    case 'PRECEDENTS':
    case 'precedents':
      return 'Precedent Transactions';
    case 'DEBT_CAPACITY_LITE':
    case 'debt-capacity-lite':
      return 'Debt Capacity / Credit Stats';
    case 'CAP_TABLE':
    case 'cap-table':
      return 'Cap Table';
    case 'SAAS_OPERATING_MODEL':
    case 'saas-operating-model':
      return 'SaaS Operating Model';
    case 'MERGER':
    case 'merger':
      return 'Merger / Accretion Dilution';
    default:
      return modelType.replace(/_/g, ' ');
  }
}

export function getModelBadgeLabel(modelType: string): string {
  return getModelDisplayLabel(modelType).toUpperCase();
}

export function replaceThreeStatementLabel(value: string): string {
  return value.replace(/Three[- ]Statement Model/gi, 'Forecast Model');
}
