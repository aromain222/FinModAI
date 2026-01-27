import type { ChartSpec } from '@/types/chartSpecs';

export function compsCharts(results: any): ChartSpec[] {
  const charts: ChartSpec[] = [];
  const comps = results?.compsTable ?? results?.comps ?? [];
  if (Array.isArray(comps) && comps.length) {
    const data = comps.map((row: any) => ({
      name: row.name ?? row.ticker ?? row.company ?? '',
      evEbitda: row.evEbitda ?? row.ev_ebitda ?? null,
      pe: row.pe ?? row.peRatio ?? null,
    }));
    charts.push({
      type: 'bar',
      title: 'Peer Multiples',
      xKey: 'name',
      series: [
        { key: 'evEbitda', label: 'EV/EBITDA' },
        { key: 'pe', label: 'P/E' },
      ],
      data,
    });
  }

  if (results?.impliedPriceLow || results?.impliedPriceHigh || results?.impliedPriceMid) {
    const data = [
      {
        label: 'Implied Price',
        low: results.impliedPriceLow ?? null,
        mid: results.impliedPriceMid ?? null,
        high: results.impliedPriceHigh ?? null,
      },
    ];
    charts.push({
      type: 'bar',
      title: 'Implied Price Range',
      xKey: 'label',
      series: [
        { key: 'low', label: 'Low' },
        { key: 'mid', label: 'Mid' },
        { key: 'high', label: 'High' },
      ],
      data,
    });
  }

  return charts;
}
