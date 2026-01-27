import 'server-only';

import type {
  ModelAndVizArtifact,
  ForecastBlueprintArtifact,
  MarketImpactBriefArtifact,
  UiBlock,
} from '@/lib/ai/schemas';
import type { EvaluationOutput } from '@/lib/modeling/evaluator';

/**
 * Block-Based Rendering
 * Deterministic transformers for converting artifacts to renderable blocks
 */

const safeText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));

/**
 * Transform MODEL_AND_VIZ artifact to blocks
 * Uses EvaluationOutput if available, otherwise falls back to artifact.evaluation
 */
export function modelToBlocks(
  artifact: ModelAndVizArtifact,
  evaluationOutput?: EvaluationOutput
): UiBlock[] {
  const blocks: UiBlock[] = [];

  // Get objective metric
  const objectiveMetric = artifact.model.objective_metric_key && artifact.model.objective_metric_label
    ? { key: artifact.model.objective_metric_key, label: artifact.model.objective_metric_label }
    : artifact.model.outputs.length > 0
    ? { key: artifact.model.outputs[0].key, label: artifact.model.outputs[0].label }
    : { key: '', label: '' };

  // Use evaluationOutput if provided, otherwise use artifact.evaluation
  const rows = evaluationOutput?.rows || artifact.evaluation?.rows || [];
  const series = evaluationOutput?.series || {};
  const charts = evaluationOutput?.charts || artifact.charts || [];
  const summary = evaluationOutput?.validation || artifact.evaluation?.summary || [];

  // Add decision signal as text block if available
  if (evaluationOutput?.decision_signal) {
    const signal = evaluationOutput.decision_signal;
    const directionEmoji = signal.direction === 'up' ? '📈' : signal.direction === 'down' ? '📉' : '➡️';
    blocks.push({
      kind: 'text',
      title: 'Decision Signal',
      content: `${directionEmoji} ${signal.explanation}`,
    });
  }

  // Add sanity check warnings if available
  if (evaluationOutput?.sanity && evaluationOutput.sanity.issues.length > 0) {
    const warnings = evaluationOutput.sanity.issues
      .filter(i => i.severity === 'warning')
      .map(i => `⚠️ ${i.message}`)
      .join('\n');
    if (warnings) {
      blocks.push({
        kind: 'text',
        title: 'Sanity Checks',
        content: warnings,
      });
    }
  }

  // Add summary table with key outputs
  if (summary.length > 0 || rows.length > 0) {
    const summaryRows: string[][] = [];
    
    // Add from summary if available
    if (summary.length > 0 && Array.isArray(summary)) {
      summary.forEach((item: any) => {
        const value = typeof item.value === 'number' ? item.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : item.value ?? '—';
        const unit = item.unit ? ` ${item.unit}` : '';
        const isObjective = item.key === objectiveMetric.key;
        summaryRows.push([isObjective ? `⭐ ${item.label}` : item.label, `${value}${unit}`]);
      });
    } else if (rows.length > 0) {
      // Build summary from rows (use last row for final values)
      const lastRow = rows[rows.length - 1];
      artifact.model.outputs.forEach(output => {
        const value = lastRow[output.key];
        const displayValue = typeof value === 'number' 
          ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : value ?? '—';
        const unit = output.unit ? ` ${output.unit}` : '';
        const isObjective = output.key === objectiveMetric.key;
        summaryRows.push([isObjective ? `⭐ ${output.label}` : output.label, `${displayValue}${unit}`]);
      });
    }

    // Sort: objective metric first
    summaryRows.sort((a, b) => {
      const aIsObjective = a[0].startsWith('⭐');
      const bIsObjective = b[0].startsWith('⭐');
      if (aIsObjective && !bIsObjective) return -1;
      if (!aIsObjective && bIsObjective) return 1;
      return 0;
    });

    if (summaryRows.length > 0) {
      blocks.push({
        kind: 'table',
        title: 'Key Outputs',
        columns: ['Metric', 'Value'],
        rows: summaryRows,
      });
    }
  }

  // Add data table (full time series)
  if (rows.length > 0) {
    const columns = ['period', ...artifact.model.outputs.map(o => o.key)];
    const tableRows = rows.map(row => 
      columns.map(col => {
        const value = row[col];
        if (typeof value === 'number') {
          return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        return value ?? '—';
      })
    );

    blocks.push({
      kind: 'table',
      title: 'Time Series Data',
      columns: ['Period', ...artifact.model.outputs.map(o => o.label)],
      rows: tableRows,
    });
  }

  // Add charts (support multi-line for scenarios)
  if (charts.length > 0) {
    // Sort charts: prioritize objective metric chart
    const sortedCharts = [...charts].sort((a, b) => {
      const aHasObjective = Array.isArray(a.yKey) 
        ? a.yKey.some(key => key.includes(objectiveMetric.key))
        : a.yKey === objectiveMetric.key;
      const bHasObjective = Array.isArray(b.yKey)
        ? b.yKey.some(key => key.includes(objectiveMetric.key))
        : b.yKey === objectiveMetric.key;
      if (aHasObjective && !bHasObjective) return -1;
      if (!aHasObjective && bHasObjective) return 1;
      return 0;
    });

    sortedCharts.forEach(chart => {
      blocks.push({
        kind: 'chart',
        title: chart.name,
        chartType: chart.chartType,
        xKey: chart.xKey,
        yKey: chart.yKey, // Can be string or string[] for multi-line
        data: chart.data || rows, // Use chart data if provided, otherwise use rows
        // Include scenarios array for multi-line charts
        ...(chart.scenarios && { scenarios: chart.scenarios }),
      });
    });
  }

  // Add model structure as code block
  if (artifact.model.equations && artifact.model.equations.length > 0) {
    const equationsCode = artifact.model.equations
      .map(eq => `${eq.label} (${eq.key}): ${eq.definition}`)
      .join('\n');
    
    blocks.push({
      kind: 'code',
      title: 'Model Equations',
      language: 'javascript',
      content: equationsCode,
    });
  }

  return blocks;
}

/**
 * Transform FORECAST_BLUEPRINT artifact to blocks
 */
export function forecastToBlocks(artifact: ForecastBlueprintArtifact): UiBlock[] {
  const horizon = artifact.horizon
    ? `${safeText(artifact.horizon.start)} → ${safeText(artifact.horizon.end)} (${safeText(artifact.horizon.frequency)})`
    : '';

  return [
    {
      kind: 'text',
      title: 'Overview',
      content: [
        artifact.objective ? `Objective: ${safeText(artifact.objective)}` : '',
        artifact.target_metric ? `Target metric: ${safeText(artifact.target_metric)}` : '',
        horizon ? `Horizon: ${horizon}` : '',
      ].filter(Boolean).join('\n'),
    },
    {
      kind: 'table',
      title: 'Key Drivers',
      columns: ['Driver', 'Direction', 'Rationale'],
      rows: (artifact.key_drivers ?? []).map((d) => [d.name, d.directionality, d.rationale]),
    },
    {
      kind: 'table',
      title: 'Assumptions',
      columns: ['Assumption', 'Default', 'Sensitivity'],
      rows: (artifact.assumptions ?? []).map((a) => [a.name, a.default, a.sensitivity]),
    },
    {
      kind: 'table',
      title: 'Data Needed',
      columns: ['Source', 'Field', 'Notes'],
      rows: (artifact.data_needed ?? []).map((d) => [d.source, d.field, d.notes]),
    },
    {
      kind: 'table',
      title: 'Model Structure',
      columns: ['Step', 'Description'],
      rows: (artifact.model_structure ?? []).map((s) => [s.step, s.description]),
    },
    {
      kind: 'table',
      title: 'Output Tables',
      columns: ['Table', 'Columns'],
      rows: (artifact.output_tables ?? []).map((t) => [t.name, (t.columns ?? []).join(', ')]),
    },
    {
      kind: 'table',
      title: 'Chart Specs',
      columns: ['Chart', 'X', 'Y', 'Note'],
      rows: (artifact.charts ?? []).map((c) => [c.name, c.x, c.y, c.note]),
    },
  ];
}

/**
 * Transform MARKET_IMPACT_BRIEF artifact to blocks
 */
export function impactBriefToBlocks(artifact: MarketImpactBriefArtifact): UiBlock[] {
  return [
    { 
      kind: 'text', 
      title: 'Event Summary', 
      content: safeText(artifact.event_summary) 
    },
    {
      kind: 'table',
      title: 'Transmission Channels',
      columns: ['Channel', 'Mechanism'],
      rows: (artifact.transmission_channels ?? []).map((c) => [c.channel, c.mechanism]),
    },
    {
      kind: 'table',
      title: 'Likely Impacts',
      columns: ['Asset / Sector', 'Direction', 'Why'],
      rows: (artifact.likely_impacts ?? []).map((i) => [i.asset_or_sector, i.direction, i.why]),
    },
    {
      kind: 'table',
      title: 'Watchlist',
      columns: ['Metric', 'Why'],
      rows: (artifact.watchlist ?? []).map((w) => [w.metric, w.why]),
    },
    {
      kind: 'text',
      title: 'Next Actions',
      content: (artifact.next_actions ?? []).map((a) => `• ${safeText(a)}`).join('\n'),
    },
  ];
}

