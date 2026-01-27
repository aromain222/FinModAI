import type { ChartSpec } from '@/types/chartSpecs';

export function mergerCharts(results: any): ChartSpec[] {
  const charts: ChartSpec[] = [];

  const epsSeries = results?.epsBridge ?? results?.accretionSeries;
  if (Array.isArray(epsSeries) && epsSeries.length) {
    const data = epsSeries.map((row: any) => ({
      year: row.year ?? row.period ?? row.date ?? '',
      eps: row.eps ?? row.value ?? null,
    }));
    charts.push({
      type: 'bar',
      title: 'EPS Accretion/Dilution',
      xKey: 'year',
      series: [{ key: 'eps', label: 'EPS Impact' }],
      data,
    });
  }

  const synergySeries = results?.synergySeries ?? results?.synergies;
  if (Array.isArray(synergySeries) && synergySeries.length) {
    const data = synergySeries.map((row: any) => ({
      year: row.year ?? row.period ?? row.date ?? '',
      synergy: row.value ?? row.synergy ?? null,
    }));
    charts.push({
      type: 'line',
      title: 'Synergies Ramp',
      xKey: 'year',
      series: [{ key: 'synergy', label: 'Synergies' }],
      data,
    });
  }

  const sourcesUses = results?.sourcesUses;
  if (Array.isArray(sourcesUses) && sourcesUses.length) {
    const totals = sourcesUses.reduce<Record<string, number>>((acc, row: any) => {
      const label = row.type ?? row.label ?? row.name ?? 'Item';
      acc[label] = (acc[label] ?? 0) + Number(row.amount ?? 0);
      return acc;
    }, {});
    const data = Object.entries(totals).map(([label, value]) => ({ label, value }));
    charts.push({
      type: 'bar',
      title: 'Sources & Uses',
      xKey: 'label',
      series: [{ key: 'value', label: 'Amount' }],
      data,
    });
  }

  return charts;
}
