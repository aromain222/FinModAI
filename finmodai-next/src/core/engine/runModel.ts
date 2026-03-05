import crypto from 'crypto';
import type { DataSourceId, HydrateParamsMap, ModelInputs } from '@/src/core/contracts/modelInputs';
import type { ModelOutputs, RunModelResult } from '@/src/core/contracts/modelOutputs';
import { getDataSource } from '@/src/core/datasources/registry';
import { getTemplate } from '@/src/core/templates/registry';
import { issue } from '@/src/core/engine/errors';
import { validateAndSanitizeInputs } from '@/src/core/engine/validate';
import type { Scenario } from '@/src/core/engine/scenario';
import { applyScenarioToInputs } from '@/src/core/engine/scenario';
import { ENGINE_VERSION } from '@/src/core/engine/version';

type RunModelRequest<TDataSource extends DataSourceId = DataSourceId> = {
  templateId: string;
  dataSourceId: TDataSource;
  params: HydrateParamsMap[TDataSource];
  scenario?: Scenario;
  options?: {
    scenarioId?: string;
    asOfDate?: string;
  };
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
};

const hashInputs = (inputs: ModelInputs): string =>
  crypto.createHash('sha256').update(stableStringify(inputs)).digest('hex');

export async function runModel<TDataSource extends DataSourceId>(
  request: RunModelRequest<TDataSource>
): Promise<RunModelResult> {
  const warnings: string[] = [];
  const issues: RunModelResult['issues'] = [];

  const dataSource = getDataSource(request.dataSourceId);
  if (!dataSource) {
    return {
      ok: false,
      warnings,
      issues: [issue('data_source_not_found', `Unknown data source: ${request.dataSourceId}`, 'error', 'dataSourceId')],
    };
  }

  const template = getTemplate(request.templateId);
  if (!template) {
    return {
      ok: false,
      warnings,
      issues: [issue('template_not_found', `Unknown template: ${request.templateId}`, 'error', 'templateId')],
    };
  }

  const hydrated = await dataSource.hydrate(request.params as any);
  warnings.push(...hydrated.warnings);
  issues.push(...hydrated.issues);

  if (!hydrated.ok || !hydrated.value) {
    return { ok: false, warnings, issues };
  }

  const hydratedInputs: ModelInputs = {
    ...hydrated.value,
    metadata: {
      ...hydrated.value.metadata,
      scenarioId:
        request.scenario?.id ??
        request.options?.scenarioId ??
        hydrated.value.metadata.scenarioId,
      asOfDate: request.options?.asOfDate ?? hydrated.value.metadata.asOfDate,
    },
  };

  const scenarioAppliedInputs = applyScenarioToInputs(hydratedInputs, request.scenario);

  const validation = validateAndSanitizeInputs(scenarioAppliedInputs, { templateId: request.templateId });
  warnings.push(...validation.warnings);
  issues.push(...validation.issues);

  if (!validation.ok || !validation.value) {
    return { ok: false, warnings, issues };
  }

  try {
    const outputs = template.run(validation.value);
    const inputsHash = hashInputs(validation.value);

    const enriched: ModelOutputs = {
      ...outputs,
      templateId: template.id,
      scenario: request.scenario
        ? {
            id: request.scenario.id,
            name: request.scenario.name,
          }
        : undefined,
      audit: {
        ...outputs.audit,
        inputsHash,
        timestamp: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        scenarioId: request.scenario?.id ?? validation.value.metadata.scenarioId,
        engineVersion: ENGINE_VERSION,
        warnings: [...new Set([...(outputs.audit?.warnings || []), ...warnings])],
      },
    };

    return {
      ok: true,
      inputs: validation.value,
      outputs: enriched,
      warnings,
      issues: issues.filter((entry) => entry.severity !== 'error'),
    };
  } catch (error: any) {
    issues.push(
      issue(
        'template_execution_failed',
        error?.message || `Failed to execute template ${template.id}.`,
        'error',
        'template'
      )
    );
    return {
      ok: false,
      warnings,
      issues,
    };
  }
}
