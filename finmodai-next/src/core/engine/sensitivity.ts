import type { DataSourceId, HydrateParamsMap } from '@/src/core/contracts/modelInputs';
import type { EngineIssue } from '@/src/core/contracts/modelOutputs';
import { runModel } from '@/src/core/engine/runModel';
import type { Scenario } from '@/src/core/engine/scenario';

export type SensitivityVariable =
  | 'growth'
  | 'margins'
  | 'taxRate'
  | 'capexPct'
  | 'nwcPct'
  | 'daPct'
  | 'wacc'
  | 'terminalGrowth'
  | 'terminalMultiple';

export type SensitivityRunRequest<TDataSource extends DataSourceId = DataSourceId> = {
  templateId: string;
  dataSourceId: TDataSource;
  baseParams: HydrateParamsMap[TDataSource];
  variableA: SensitivityVariable;
  rangeA: number[];
  variableB?: SensitivityVariable;
  rangeB?: number[];
  scenario?: Scenario;
  maxIterations?: number;
  metric?: 'enterpriseValue' | 'impliedSharePrice';
};

export type SensitivityResult = {
  ok: boolean;
  grid: number[][];
  xAxis: number[];
  yAxis?: number[];
  baseValue: number;
  warnings: string[];
  issues: EngineIssue[];
};

const MAX_ITERATION_HARD_LIMIT = 400;

const finiteNumber = (value: number | undefined | null): number =>
  Number.isFinite(value) ? (value as number) : 0;

const extractMetric = (
  metric: SensitivityRunRequest['metric'],
  outputs: { summary: { enterpriseValue: number; impliedSharePrice?: number } }
): number => {
  if (metric === 'impliedSharePrice') {
    const value = outputs.summary.impliedSharePrice;
    if (Number.isFinite(value)) return value as number;
  }
  return outputs.summary.enterpriseValue;
};

export async function runSensitivity<TDataSource extends DataSourceId>(
  request: SensitivityRunRequest<TDataSource>
): Promise<SensitivityResult> {
  const warnings: string[] = [];
  const issues: EngineIssue[] = [];

  const xAxis = Array.isArray(request.rangeA)
    ? request.rangeA.filter((entry) => Number.isFinite(entry))
    : [];
  const yAxisRaw = Array.isArray(request.rangeB)
    ? request.rangeB.filter((entry) => Number.isFinite(entry))
    : undefined;

  if (xAxis.length === 0) {
    return {
      ok: false,
      grid: [],
      xAxis: [],
      baseValue: 0,
      warnings,
      issues: [
        {
          code: 'sensitivity_range_a_invalid',
          field: 'rangeA',
          message: 'Sensitivity rangeA must contain at least one numeric value.',
          severity: 'error',
        },
      ],
    };
  }

  const rows = yAxisRaw && yAxisRaw.length > 0 ? yAxisRaw.length : 1;
  const cols = xAxis.length;
  const requestedIterations = rows * cols;
  const maxIterations = Math.max(1, Math.min(request.maxIterations ?? 121, MAX_ITERATION_HARD_LIMIT));

  if (requestedIterations > maxIterations) {
    return {
      ok: false,
      grid: [],
      xAxis,
      yAxis: yAxisRaw,
      baseValue: 0,
      warnings,
      issues: [
        {
          code: 'sensitivity_iteration_limit',
          field: 'maxIterations',
          message: `Sensitivity grid too large (${requestedIterations} iterations). Max allowed is ${maxIterations}.`,
          severity: 'error',
        },
      ],
    };
  }

  const baseResult = await runModel({
    templateId: request.templateId,
    dataSourceId: request.dataSourceId,
    params: request.baseParams,
    options: {
      asOfDate: (request.baseParams as any)?.asOfDate,
      scenarioId: request.scenario?.id,
    },
    scenario: request.scenario,
  } as any);

  if (!baseResult.ok || !baseResult.outputs) {
    return {
      ok: false,
      grid: [],
      xAxis,
      yAxis: yAxisRaw,
      baseValue: 0,
      warnings: [...warnings, ...baseResult.warnings],
      issues: [...issues, ...baseResult.issues],
    };
  }

  const baseValue = finiteNumber(extractMetric(request.metric, baseResult.outputs));
  const grid: number[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowValues: number[] = [];

    for (let col = 0; col < cols; col += 1) {
      const override: Record<string, number> = {
        [request.variableA]: xAxis[col],
      };
      if (request.variableB && yAxisRaw) {
        override[request.variableB] = yAxisRaw[row];
      }

      const scenarioOverride: Scenario = {
        id: `${request.scenario?.id || 'sensitivity'}_${row}_${col}`,
        name: `${request.scenario?.name || 'Sensitivity'} ${row + 1}-${col + 1}`,
        createdAt: new Date().toISOString(),
        assumptionsOverride: override,
      };

      const result = await runModel({
        templateId: request.templateId,
        dataSourceId: request.dataSourceId,
        params: request.baseParams,
        options: {
          asOfDate: (request.baseParams as any)?.asOfDate,
          scenarioId: scenarioOverride.id,
        },
        scenario: scenarioOverride,
      } as any);

      if (!result.ok || !result.outputs) {
        issues.push(...result.issues);
        warnings.push(...result.warnings);
        rowValues.push(0);
        continue;
      }

      const value = finiteNumber(extractMetric(request.metric, result.outputs));
      if (!Number.isFinite(value)) {
        warnings.push(`Sensitivity cell (${row}, ${col}) returned non-finite output. Coerced to 0.`);
        rowValues.push(0);
      } else {
        rowValues.push(value);
      }
    }

    grid.push(rowValues);
  }

  return {
    ok: !issues.some((entry) => entry.severity === 'error'),
    grid,
    xAxis,
    yAxis: yAxisRaw,
    baseValue,
    warnings,
    issues,
  };
}
