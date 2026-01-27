import {
  type AgentOutput,
  type ChecklistArtifact,
  type DcfDriversArtifact,
  type ForecastBlueprintArtifact,
  type MarketImpactBriefArtifact,
  type ModelAndVizArtifact,
  type OutputType,
  type PythonNotebookArtifact,
  type ScenarioEngineArtifact,
  type SlideOutlineArtifact,
  type SqlQueryArtifact,
  type UiBlock,
} from '@/lib/ai/schemas';
import { modelToBlocks, forecastToBlocks, impactBriefToBlocks } from '@/lib/render/blocks';
import type { EvaluationOutput } from '@/lib/modeling/evaluator';

const safeText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));

const joinNonEmpty = (parts: Array<string | null | undefined>, sep = '\n') =>
  parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(sep);

// Re-export deterministic transformers
export { modelToBlocks, forecastToBlocks, impactBriefToBlocks } from '@/lib/render/blocks';

// Legacy alias for backward compatibility
export function forecastBlueprintToBlocks(artifact: ForecastBlueprintArtifact): UiBlock[] {
  return forecastToBlocks(artifact);
}

export function scenarioEngineToBlocks(artifact: ScenarioEngineArtifact): UiBlock[] {
  const caseTable = (title: string, shocks: ScenarioEngineArtifact['base_case']['shocks']): UiBlock => ({
    kind: 'table',
    title,
    columns: ['Variable', 'Unit', 'Magnitude', 'Duration', 'Rationale'],
    rows: (shocks ?? []).map((s) => [s.variable, s.unit, s.magnitude, s.duration, s.rationale]),
  });

  return [
    {
      kind: 'text',
      title: 'Narratives',
      content: joinNonEmpty([
        artifact.base_case?.narrative ? `Base: ${safeText(artifact.base_case.narrative)}` : '',
        artifact.upside_case?.narrative ? `Upside: ${safeText(artifact.upside_case.narrative)}` : '',
        artifact.downside_case?.narrative ? `Downside: ${safeText(artifact.downside_case.narrative)}` : '',
      ]),
    },
    caseTable('Base Shocks', artifact.base_case?.shocks ?? []),
    caseTable('Upside Shocks', artifact.upside_case?.shocks ?? []),
    caseTable('Downside Shocks', artifact.downside_case?.shocks ?? []),
    {
      kind: 'table',
      title: 'Shock Library',
      columns: ['Variable', 'Unit', 'Magnitude', 'Duration', 'Rationale'],
      rows: (artifact.shock_library ?? []).map((s) => [s.variable, s.unit, s.magnitude, s.duration, s.rationale]),
    },
    {
      kind: 'table',
      title: 'Timeline',
      columns: ['Period', 'Note'],
      rows: (artifact.timeline ?? []).map((t) => [t.period, t.note]),
    },
  ];
}

export function dcfDriversToBlocks(artifact: DcfDriversArtifact): UiBlock[] {
  const section = (title: string, drivers: Array<{ name?: string; default?: string; range?: { low?: string; high?: string }; note?: string }>) => ({
    kind: 'table' as const,
    title,
    columns: ['Driver', 'Default', 'Range', 'Note'],
    rows: (drivers ?? []).map((d) => [
      d.name ?? '',
      d.default ?? '',
      `${d.range?.low ?? ''} → ${d.range?.high ?? ''}`,
      d.note ?? '',
    ]),
  });

  return [
    section('Revenue Drivers', artifact.revenue?.drivers ?? []),
    section('COGS Drivers', artifact.cogs?.drivers ?? []),
    section('Opex Drivers', artifact.opex?.drivers ?? []),
    section('Capex Drivers', artifact.capex?.drivers ?? []),
    section('Working Capital Drivers', artifact.nwc?.drivers ?? []),
    {
      kind: 'text',
      title: 'Checks',
      content: (artifact.checks ?? []).map((c) => `• ${safeText(c)}`).join('\n'),
    },
  ];
}

// Legacy alias for backward compatibility
export function marketImpactBriefToBlocks(artifact: MarketImpactBriefArtifact): UiBlock[] {
  return impactBriefToBlocks(artifact);
}

export function sqlQueryToBlocks(artifact: SqlQueryArtifact): UiBlock[] {
  return [
    {
      kind: 'text',
      title: 'Assumptions',
      content: (artifact.assumptions ?? []).map((a) => `• ${safeText(a)}`).join('\n'),
    },
    { kind: 'code', title: 'SQL', language: 'sql', content: safeText(artifact.sql) },
    { kind: 'text', title: 'Explanation', content: safeText(artifact.explanation) },
  ];
}

export function pythonNotebookToBlocks(artifact: PythonNotebookArtifact): UiBlock[] {
  return [
    {
      kind: 'table',
      title: 'Environment',
      columns: ['Key', 'Value'],
      rows: [
        ['Python', safeText(artifact.environment?.python)],
        ['Packages', (artifact.environment?.packages ?? []).map((p) => safeText(p)).join(', ')],
      ],
    },
    {
      kind: 'table',
      title: 'Steps',
      columns: ['Step', 'Description'],
      rows: (artifact.steps ?? []).map((s) => [s.step, s.description]),
    },
    { kind: 'code', title: 'Pseudocode', language: 'python', content: safeText(artifact.pseudocode) },
  ];
}

export function slideOutlineToBlocks(artifact: SlideOutlineArtifact): UiBlock[] {
  return [
    { kind: 'text', title: 'Deck Title', content: safeText(artifact.deck_title) },
    {
      kind: 'table',
      title: 'Slides',
      columns: ['Slide', 'Title', 'Bullets'],
      rows: (artifact.slides ?? []).map((s) => [s.slide, s.title, (s.bullets ?? []).map((b) => safeText(b)).join(' • ')]),
    },
  ];
}

export function checklistToBlocks(artifact: ChecklistArtifact): UiBlock[] {
  return [
    {
      kind: 'table',
      title: 'Checklist',
      columns: ['Task', 'Priority', 'Owner', 'Notes'],
      rows: (artifact.tasks ?? []).map((t) => [t.task, t.priority, t.owner, t.notes ?? '']),
    },
  ];
}

// Legacy alias - use modelToBlocks with optional evaluationOutput
export function modelAndVizToBlocks(artifact: ModelAndVizArtifact, evaluationOutput?: EvaluationOutput): UiBlock[] {
  return modelToBlocks(artifact, evaluationOutput);
}

export function buildRenderBlocks(
  type: OutputType, 
  artifact: AgentOutput['artifact'],
  evaluationOutput?: EvaluationOutput
): UiBlock[] {
  switch (type) {
    case 'MODEL_AND_VIZ':
      return modelToBlocks(artifact as ModelAndVizArtifact, evaluationOutput);
    case 'FORECAST_BLUEPRINT':
      return forecastToBlocks(artifact as ForecastBlueprintArtifact);
    case 'SCENARIO_ENGINE':
      return scenarioEngineToBlocks(artifact as ScenarioEngineArtifact);
    case 'DCF_DRIVERS':
      return dcfDriversToBlocks(artifact as DcfDriversArtifact);
    case 'MARKET_IMPACT_BRIEF':
      return impactBriefToBlocks(artifact as MarketImpactBriefArtifact);
    case 'SQL_QUERY':
      return sqlQueryToBlocks(artifact as SqlQueryArtifact);
    case 'PYTHON_NOTEBOOK':
      return pythonNotebookToBlocks(artifact as PythonNotebookArtifact);
    case 'SLIDE_OUTLINE':
      return slideOutlineToBlocks(artifact as SlideOutlineArtifact);
    case 'CHECKLIST':
      return checklistToBlocks(artifact as ChecklistArtifact);
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

export function ensureRenderBlocks(output: AgentOutput): AgentOutput {
  const existing = Array.isArray(output.render_blocks) ? output.render_blocks : [];
  if (existing.length) return output;

  const blocks = buildRenderBlocks(output.type, output.artifact);
  if (blocks.length) return { ...output, render_blocks: blocks };

  return {
    ...output,
    render_blocks: [
      {
        kind: 'text',
        title: 'Output',
        content: 'No render blocks available.',
      },
    ],
  };
}

