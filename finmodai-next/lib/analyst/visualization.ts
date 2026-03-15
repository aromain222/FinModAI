import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';

type PlotTrace = Record<string, unknown>;
type PlotLayout = Record<string, unknown>;

export type AnalystVisualizationPanel = {
  id: string;
  title: string;
  subtitle?: string;
  data: PlotTrace[];
  layout?: PlotLayout;
  height?: number;
};

export type AnalystVisualizationPayload = {
  title: string;
  subtitle: string;
  contextType: 'dcf' | 'model' | 'stock';
  contextLabel: string;
  notes: string[];
  panels: AnalystVisualizationPanel[];
};

function formatModelTypeLabel(modelType: AnalystGeneratedModelPayload['modelType']): string {
  return modelType.replace(/_/g, ' ');
}

function buildModelVisualization(payload: AnalystGeneratedModelPayload): AnalystVisualizationPayload | null {
  const inputs = payload.extractedInputs as Record<string, unknown>;

  if (payload.modelType === 'THREE_STATEMENT') {
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    const ebitMargin = Array.isArray(inputs.ebitMargin) ? inputs.ebitMargin : [];
    const years = Array.from({ length: Math.max(revenueGrowth.length, ebitMargin.length) }, (_, idx) => `Y${idx + 1}`);
    if (years.length === 0) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone chart generated from the current model assumptions.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['Edit titles, annotate the chart, or zoom into the forecast path without reopening the full model card.'],
      panels: [
        {
          id: 'forecast-assumptions',
          title: 'Forecast Assumption Paths',
          subtitle: 'Revenue growth and EBIT margin by forecast year.',
          height: 280,
          data: [
            {
              type: 'scatter',
              mode: 'lines+markers',
              name: 'Revenue Growth',
              x: years,
              y: years.map((_, idx) => (typeof revenueGrowth[idx] === 'number' ? Number(revenueGrowth[idx]) * 100 : 0)),
              line: { color: '#2563eb', width: 2.5, shape: 'spline' },
              marker: { color: '#2563eb', size: 6 },
              hovertemplate: '%{x}<br>Revenue Growth: %{y:.1f}%<extra></extra>',
            },
            {
              type: 'scatter',
              mode: 'lines+markers',
              name: 'EBIT Margin',
              x: years,
              y: years.map((_, idx) => (typeof ebitMargin[idx] === 'number' ? Number(ebitMargin[idx]) * 100 : 0)),
              line: { color: '#16a34a', width: 2.5, shape: 'spline' },
              marker: { color: '#16a34a', size: 6 },
              hovertemplate: '%{x}<br>EBIT Margin: %{y:.1f}%<extra></extra>',
            },
          ],
          layout: {
            xaxis: { type: 'category' },
            yaxis: { ticksuffix: '%' },
          },
        },
      ],
    };
  }

  if (payload.modelType === 'COMPS') {
    const peers = Array.isArray(inputs.peers) ? (inputs.peers as Array<Record<string, unknown>>) : [];
    const peerRows = peers
      .slice(0, 8)
      .map((peer) => ({
        label: String(peer.ticker ?? peer.name ?? 'Peer'),
        revenue: typeof peer.revenue === 'number' ? Number(peer.revenue) : 0,
        ebitda: typeof peer.ebitda === 'number' ? Number(peer.ebitda) : 0,
      }))
      .filter((row) => row.revenue > 0 || row.ebitda > 0);
    if (peerRows.length === 0) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone peer chart generated from the current comps output.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['Peer operating scale is shown separately so the chart can be edited and annotated without changing the workbook payload.'],
      panels: [
        {
          id: 'peer-operating-scale',
          title: 'Peer Operating Scale',
          subtitle: 'Revenue and EBITDA across the selected peer set.',
          height: 300,
          data: [
            {
              type: 'bar',
              name: 'Revenue',
              x: peerRows.map((row) => row.label),
              y: peerRows.map((row) => row.revenue),
              marker: { color: '#2563eb' },
              hovertemplate: '%{x}<br>Revenue: $%{y:,.0f}M<extra></extra>',
            },
            {
              type: 'bar',
              name: 'EBITDA',
              x: peerRows.map((row) => row.label),
              y: peerRows.map((row) => row.ebitda),
              marker: { color: '#16a34a' },
              hovertemplate: '%{x}<br>EBITDA: $%{y:,.0f}M<extra></extra>',
            },
          ],
          layout: {
            barmode: 'group',
            xaxis: { type: 'category' },
            yaxis: { tickprefix: '$', ticksuffix: 'M' },
          },
        },
      ],
    };
  }

  if (payload.modelType === 'PRECEDENTS') {
    const transactions = Array.isArray(inputs.transactions) ? (inputs.transactions as Array<Record<string, unknown>>) : [];
    const rows = transactions
      .slice(0, 8)
      .map((transaction) => ({
        label: String(transaction.target ?? transaction.transaction ?? 'Deal'),
        revenueMultiple: typeof transaction.revenueMultiple === 'number' ? Number(transaction.revenueMultiple) : 0,
        ebitdaMultiple: typeof transaction.ebitdaMultiple === 'number' ? Number(transaction.ebitdaMultiple) : 0,
      }))
      .filter((row) => row.revenueMultiple > 0 || row.ebitdaMultiple > 0);
    if (rows.length === 0) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone transaction multiple chart generated from the current precedent set.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['Use this chart artifact when the user wants just the visual read-through, not the full precedent model card.'],
      panels: [
        {
          id: 'transaction-multiples',
          title: 'Transaction Multiples',
          subtitle: 'EV / Revenue and EV / EBITDA across selected deals.',
          height: 300,
          data: [
            {
              type: 'bar',
              name: 'EV / Revenue',
              x: rows.map((row) => row.label),
              y: rows.map((row) => row.revenueMultiple),
              marker: { color: '#2563eb' },
              hovertemplate: '%{x}<br>EV / Revenue: %{y:.1f}x<extra></extra>',
            },
            {
              type: 'bar',
              name: 'EV / EBITDA',
              x: rows.map((row) => row.label),
              y: rows.map((row) => row.ebitdaMultiple),
              marker: { color: '#f59e0b' },
              hovertemplate: '%{x}<br>EV / EBITDA: %{y:.1f}x<extra></extra>',
            },
          ],
          layout: {
            barmode: 'group',
            xaxis: { type: 'category' },
            yaxis: { ticksuffix: 'x' },
          },
        },
      ],
    };
  }

  if (payload.modelType === 'LBO') {
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    if (revenueGrowth.length === 0) return null;
    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone underwriting chart generated from the current LBO assumptions.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['This chart isolates the underwriting curve so it can be annotated separately from the full deal model.'],
      panels: [
        {
          id: 'underwriting-growth',
          title: 'Underwriting Growth Path',
          subtitle: 'Revenue growth by year under the current LBO case.',
          height: 280,
          data: [
            {
              type: 'scatter',
              mode: 'lines+markers',
              name: 'Revenue Growth',
              x: revenueGrowth.map((_, idx) => `Y${idx + 1}`),
              y: revenueGrowth.map((value) => (typeof value === 'number' ? Number(value) * 100 : 0)),
              line: { color: '#2563eb', width: 2.5, shape: 'spline' },
              marker: { color: '#2563eb', size: 6 },
              hovertemplate: '%{x}<br>Revenue Growth: %{y:.1f}%<extra></extra>',
            },
          ],
          layout: {
            xaxis: { type: 'category' },
            yaxis: { ticksuffix: '%' },
          },
        },
      ],
    };
  }

  if (payload.modelType === 'CAP_TABLE') {
    const founderShares = typeof inputs.founderShares === 'number' ? Number(inputs.founderShares) : 0;
    const raiseAmount = typeof inputs.raiseAmount === 'number' ? Number(inputs.raiseAmount) : 0;
    const preMoney = typeof inputs.preMoney === 'number' ? Number(inputs.preMoney) : 0;
    if (founderShares === 0 && raiseAmount === 0 && preMoney === 0) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone financing structure chart generated from the current cap table inputs.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['This lets the user discuss dilution visually without carrying the full cap table card into the thread.'],
      panels: [
        {
          id: 'financing-structure',
          title: 'Financing Structure Snapshot',
          subtitle: 'Founder shares, raise amount, and pre-money value in the current round.',
          height: 280,
          data: [
            {
              type: 'bar',
              name: 'Founder Shares',
              x: ['Round'],
              y: [founderShares],
              marker: { color: '#2563eb' },
              hovertemplate: 'Founder Shares: %{y:,.0f}<extra></extra>',
            },
            {
              type: 'bar',
              name: 'Raise Amount',
              x: ['Round'],
              y: [raiseAmount],
              marker: { color: '#16a34a' },
              hovertemplate: 'Raise Amount: $%{y:,.0f}<extra></extra>',
            },
            {
              type: 'bar',
              name: 'Pre-Money',
              x: ['Round'],
              y: [preMoney],
              marker: { color: '#f59e0b' },
              hovertemplate: 'Pre-Money: $%{y:,.0f}<extra></extra>',
            },
          ],
          layout: {
            barmode: 'group',
            xaxis: { type: 'category' },
          },
        },
      ],
    };
  }

  if (payload.modelType === 'SAAS_OPERATING_MODEL') {
    const growthRate = typeof inputs.growthRate === 'number' ? Number(inputs.growthRate) * 100 : 0;
    const grossMargin = typeof inputs.grossMargin === 'number' ? Number(inputs.grossMargin) * 100 : 0;
    const churn = typeof inputs.churn === 'number' ? Number(inputs.churn) * 100 : 0;
    const cac = typeof inputs.cac === 'number' ? Number(inputs.cac) : 0;
    const arpu = typeof inputs.arpu === 'number' ? Number(inputs.arpu) : 0;
    if ([growthRate, grossMargin, churn, cac, arpu].every((value) => value === 0)) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone SaaS driver chart generated from the current model assumptions.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['This chart isolates the operating drivers so the user can visualize and annotate them separately from the workbook card.'],
      panels: [
        {
          id: 'saas-driver-snapshot',
          title: 'Operating Driver Snapshot',
          subtitle: 'Growth, margin, churn, CAC, and ARPU under the current case.',
          height: 300,
          data: [
            {
              type: 'bar',
              name: 'Value',
              x: ['Growth', 'Gross Margin', 'Churn', 'CAC', 'ARPU'],
              y: [growthRate, grossMargin, churn, cac, arpu],
              marker: { color: ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6'] },
              hovertemplate: '%{x}: %{y:,.1f}<extra></extra>',
            },
          ],
          layout: {
            xaxis: { type: 'category' },
          },
        },
      ],
    };
  }

  return {
    title: `${payload.title} Visualization`,
    subtitle: 'No dedicated chart template exists yet for this model type.',
    contextType: 'model',
    contextLabel: `${formatModelTypeLabel(payload.modelType)} model`,
    notes: ['This model type still needs a bespoke standalone chart template.'],
    panels: [],
  };
}

function buildDcfVisualization(payload: AnalystDcfDemoPayload): AnalystVisualizationPayload {
  const scenarioBars = [
    { name: 'Bear', value: payload.scenarios.bear.pricePerShare ?? 0, fill: '#dc2626' },
    { name: 'Base', value: payload.scenarios.base.pricePerShare ?? 0, fill: '#2563eb' },
    { name: 'Bull', value: payload.scenarios.bull.pricePerShare ?? 0, fill: '#16a34a' },
  ];

  return {
    title: `${payload.companyName} DCF Visualization`,
    subtitle: 'Standalone chart package generated from the current DCF output.',
    contextType: 'dcf',
    contextLabel: `${payload.companyName} (${payload.ticker})`,
    notes: ['This chart artifact is separate from the DCF card so the user can focus on the visuals without the workbook framing.'],
    panels: [
      {
        id: 'dcf-forecast',
        title: 'Base Forecast',
        subtitle: 'Revenue and FCFF under the current base case.',
        height: 280,
        data: [
          {
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Revenue',
            x: payload.forecast.map((row) => row.year),
            y: payload.forecast.map((row) => row.revenue),
            line: { color: '#2563eb', width: 2.5, shape: 'spline' },
            marker: { color: '#2563eb', size: 6 },
            hovertemplate: '%{x}<br>Revenue: $%{y:,.0f}M<extra></extra>',
            yaxis: 'y',
          },
          {
            type: 'scatter',
            mode: 'lines+markers',
            name: 'FCFF',
            x: payload.forecast.map((row) => row.year),
            y: payload.forecast.map((row) => row.fcff),
            line: { color: '#16a34a', width: 2.5, shape: 'spline' },
            marker: { color: '#16a34a', size: 6 },
            hovertemplate: '%{x}<br>FCFF: $%{y:,.0f}M<extra></extra>',
            yaxis: 'y2',
          },
        ],
        layout: {
          xaxis: { type: 'category' },
          yaxis: { tickprefix: '$', ticksuffix: 'M', title: 'Revenue' },
          yaxis2: {
            overlaying: 'y',
            side: 'right',
            tickprefix: '$',
            ticksuffix: 'M',
            title: 'FCFF',
          },
        },
      },
      {
        id: 'dcf-scenarios',
        title: 'Scenario Value / Share',
        subtitle: 'Bear, base, and bull value per share.',
        height: 260,
        data: [
          {
            type: 'bar',
            name: 'Scenario Value / Share',
            x: scenarioBars.map((entry) => entry.name),
            y: scenarioBars.map((entry) => entry.value),
            marker: { color: scenarioBars.map((entry) => entry.fill) },
            hovertemplate: '%{x}<br>Value / Share: $%{y:.2f}<extra></extra>',
          },
        ],
        layout: {
          xaxis: { type: 'category' },
          yaxis: { tickprefix: '$' },
        },
      },
    ],
  };
}

function buildStockVisualization(payload: StockLookupResult): AnalystVisualizationPayload {
  return {
    title: `${payload.companyName ?? payload.ticker} Visualization`,
    subtitle: 'Standalone market chart generated from the current company context.',
    contextType: 'stock',
    contextLabel: `${payload.companyName ?? payload.ticker} (${payload.ticker})`,
    notes: ['This chart artifact is separate from the stock card so the user can work directly with the visual.'],
    panels: [
      {
        id: 'stock-chart',
        title: payload.chart.kind === 'price' ? 'Recent Price Trend' : 'Fundamental Snapshot',
        subtitle:
          payload.chart.kind === 'price'
            ? 'Recent available price series.'
            : 'Revenue, EBITDA, and net income snapshot.',
        height: 260,
        data:
          payload.chart.kind === 'price'
            ? [
                {
                  type: 'scatter',
                  mode: 'lines+markers',
                  name: payload.ticker,
                  x: payload.chart.points.map((point) => point.label),
                  y: payload.chart.points.map((point) => point.value),
                  line: { color: '#10b981', width: 2.5, shape: 'spline' },
                  marker: { color: '#10b981', size: 5 },
                  hovertemplate: '%{x}<br>Price: $%{y:.2f}<extra></extra>',
                },
              ]
            : [
                {
                  type: 'bar',
                  name: 'Value',
                  x: payload.chart.points.map((point) => point.label),
                  y: payload.chart.points.map((point) => point.value),
                  marker: { color: '#2563eb', opacity: 0.9 },
                  hovertemplate: '%{x}<br>Value: $%{y:,.0f}M<extra></extra>',
                },
              ],
        layout: {
          xaxis: { type: 'category' },
          yaxis: payload.chart.kind === 'price' ? { tickprefix: '$' } : { tickprefix: '$', ticksuffix: 'M' },
        },
      },
    ],
  };
}

export function buildVisualizationFromCurrentArtifact(input: {
  currentModel?: AnalystGeneratedModelPayload | null;
  currentDcf?: AnalystDcfDemoPayload | null;
  currentStock?: StockLookupResult | null;
}): AnalystVisualizationPayload | null {
  if (input.currentDcf) return buildDcfVisualization(input.currentDcf);
  if (input.currentModel) return buildModelVisualization(input.currentModel);
  if (input.currentStock) return buildStockVisualization(input.currentStock);
  return null;
}
