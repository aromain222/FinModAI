import { getMacroSnapshot } from './macroData';

export interface ReportMacroSnapshot {
  fedFundsRate: number;
  inflationRate: number;
  sectorLeaders: string[];
  sectorLaggards: string[];
  creditSpreads: {
    label: string;
    direction: 'widening' | 'tightening' | 'stable';
    levelBps: number;
  };
}

export function buildReportMacroSnapshot(): ReportMacroSnapshot {
  const snapshot = getMacroSnapshot('1M');
  const sectorLeaders = ['Technology +120bps vs SPX', 'Industrials +80bps'];
  const sectorLaggards = ['Consumer Discretionary -60bps', 'Utilities -40bps'];

  return {
    fedFundsRate: snapshot.indicators.fedFunds.value,
    inflationRate: snapshot.indicators.cpi.value,
    sectorLeaders,
    sectorLaggards,
    creditSpreads: {
      label: 'BBB corporate spreads',
      direction: snapshot.indicators.vix.value > 17 ? 'widening' : 'stable',
      levelBps: snapshot.indicators.treasury10y.value * 100 - snapshot.indicators.fedFunds.value * 100,
    },
  };
}

