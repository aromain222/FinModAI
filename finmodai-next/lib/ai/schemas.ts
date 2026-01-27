import { z } from 'zod';

export const OutputTypeSchema = z.enum([
  'MODEL_AND_VIZ',
  'FORECAST_BLUEPRINT',
  'SCENARIO_ENGINE',
  'DCF_DRIVERS',
  'MARKET_IMPACT_BRIEF',
  'SQL_QUERY',
  'PYTHON_NOTEBOOK',
  'SLIDE_OUTLINE',
  'CHECKLIST',
]);

export type OutputType = z.infer<typeof OutputTypeSchema>;

export const AgentInputSchema = z
  .object({
    prompt: z.string().min(1),
    outputType: z.string().optional(),
    followup_answers: z.record(z.string()).optional(),
    context: z
      .object({
        company: z.string().optional(),
        ticker: z.string().optional(),
        timeframe: z.string().optional(),
        geography: z.string().optional(),
        userRole: z.enum(['student', 'analyst', 'founder']).optional(),
        existingModel: z
          .object({
            hasDCF: z.boolean().optional(),
            has3Statement: z.boolean().optional(),
            hasScenarios: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type AgentInput = z.infer<typeof AgentInputSchema>;

export const RenderBlockSchema = z
  .object({
    block_type: z.enum(['text', 'table', 'chart', 'code']),
    label: z.string().min(1),
    key: z.string().min(1),
  })
  .strict();

export const RenderHintsSchema = z
  .object({
    layout: z.enum(['doc', 'table', 'chart', 'mixed']),
    primary_blocks: z.array(RenderBlockSchema).min(1),
  })
  .strict();

export const TextUiBlockSchema = z
  .object({
    kind: z.literal('text'),
    title: z.string().optional(),
    content: z.string(),
  })
  .strict();

export const TableUiBlockSchema = z
  .object({
    kind: z.literal('table'),
    title: z.string().optional(),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.unknown())),
  })
  .strict();

export const ChartUiBlockSchema = z
  .object({
    kind: z.literal('chart'),
    title: z.string().optional(),
    chartType: z.enum(['line', 'bar']),
    xKey: z.string().min(1),
    yKey: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]), // Single key or array for multi-line
    data: z.array(z.unknown()),
    scenarios: z.array(z.string()).optional(), // Scenario IDs for multi-line charts
  })
  .strict();

export const CodeUiBlockSchema = z
  .object({
    kind: z.literal('code'),
    title: z.string().optional(),
    language: z.string().min(1),
    content: z.string(),
  })
  .strict();

export const UiBlockSchema = z.discriminatedUnion('kind', [
  TextUiBlockSchema,
  TableUiBlockSchema,
  ChartUiBlockSchema,
  CodeUiBlockSchema,
]);

export type UiBlock = z.infer<typeof UiBlockSchema>;

const DirectionalitySchema = z.enum(['positive', 'negative', 'mixed']);
const SensitivitySchema = z.enum(['low', 'med', 'high']);

export const ForecastBlueprintArtifactSchema = z
  .object({
    objective: z.string(),
    target_metric: z.string(),
    horizon: z
      .object({
        start: z.string(),
        end: z.string(),
        frequency: z.enum(['weekly', 'monthly', 'quarterly']),
      })
      .strict(),
    key_drivers: z.array(
      z
        .object({
          name: z.string(),
          rationale: z.string(),
          directionality: DirectionalitySchema,
        })
        .strict()
    ),
    assumptions: z.array(
      z
        .object({
          name: z.string(),
          default: z.string(),
          sensitivity: SensitivitySchema,
        })
        .strict()
    ),
    data_needed: z.array(
      z
        .object({
          source: z.enum(['internal', 'public', 'vendor', 'manual']),
          field: z.string(),
          notes: z.string(),
        })
        .strict()
    ),
    model_structure: z.array(
      z
        .object({
          step: z.number().int().min(1),
          description: z.string(),
        })
        .strict()
    ),
    output_tables: z.array(
      z
        .object({
          name: z.string(),
          columns: z.array(z.string()),
        })
        .strict()
    ),
    charts: z.array(
      z
        .object({
          name: z.string(),
          x: z.string(),
          y: z.string(),
          note: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export type ForecastBlueprintArtifact = z.infer<typeof ForecastBlueprintArtifactSchema>;

export const ShockSchema = z
  .object({
    variable: z.string(),
    unit: z.string(),
    magnitude: z.string(),
    duration: z.string(),
    rationale: z.string(),
  })
  .strict();

export type Shock = z.infer<typeof ShockSchema>;

const ScenarioCaseSchema = z
  .object({
    narrative: z.string(),
    shocks: z.array(ShockSchema),
  })
  .strict();

export const ScenarioEngineArtifactSchema = z
  .object({
    base_case: ScenarioCaseSchema,
    upside_case: ScenarioCaseSchema,
    downside_case: ScenarioCaseSchema,
    shock_library: z.array(ShockSchema),
    timeline: z.array(
      z
        .object({
          period: z.string(),
          note: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export type ScenarioEngineArtifact = z.infer<typeof ScenarioEngineArtifactSchema>;

export const DcfDriverSchema = z
  .object({
    name: z.string(),
    default: z.string(),
    range: z
      .object({
        low: z.string(),
        high: z.string(),
      })
      .strict(),
    note: z.string(),
  })
  .strict();

export type DcfDriver = z.infer<typeof DcfDriverSchema>;

const DcfDriverSectionSchema = z
  .object({
    drivers: z.array(DcfDriverSchema),
  })
  .strict();

export const DcfDriversArtifactSchema = z
  .object({
    revenue: DcfDriverSectionSchema,
    cogs: DcfDriverSectionSchema,
    opex: DcfDriverSectionSchema,
    capex: DcfDriverSectionSchema,
    nwc: DcfDriverSectionSchema,
    checks: z.array(z.string()),
  })
  .strict();

export type DcfDriversArtifact = z.infer<typeof DcfDriversArtifactSchema>;

export const MarketImpactBriefArtifactSchema = z
  .object({
    event_summary: z.string(),
    transmission_channels: z.array(
      z
        .object({
          channel: z.string(),
          mechanism: z.string(),
        })
        .strict()
    ),
    likely_impacts: z.array(
      z
        .object({
          asset_or_sector: z.string(),
          direction: z.enum(['up', 'down', 'mixed']),
          why: z.string(),
        })
        .strict()
    ),
    watchlist: z.array(
      z
        .object({
          metric: z.string(),
          why: z.string(),
        })
        .strict()
    ),
    next_actions: z.array(z.string()),
  })
  .strict();

export type MarketImpactBriefArtifact = z.infer<typeof MarketImpactBriefArtifactSchema>;

export const SqlQueryArtifactSchema = z
  .object({
    assumptions: z.array(z.string()),
    sql: z.string(),
    explanation: z.string(),
  })
  .strict();

export type SqlQueryArtifact = z.infer<typeof SqlQueryArtifactSchema>;

export const PythonNotebookArtifactSchema = z
  .object({
    environment: z
      .object({
        python: z.string(),
        packages: z.array(z.string()),
      })
      .strict(),
    steps: z.array(
      z
        .object({
          step: z.number().int().min(1),
          description: z.string(),
        })
        .strict()
    ),
    pseudocode: z.string(),
  })
  .strict();

export type PythonNotebookArtifact = z.infer<typeof PythonNotebookArtifactSchema>;

export const SlideOutlineArtifactSchema = z
  .object({
    deck_title: z.string(),
    slides: z.array(
      z
        .object({
          slide: z.number().int().min(1),
          title: z.string(),
          bullets: z.array(z.string()),
        })
        .strict()
    ),
  })
  .strict();

export type SlideOutlineArtifact = z.infer<typeof SlideOutlineArtifactSchema>;

export const ChecklistArtifactSchema = z
  .object({
    tasks: z.array(
      z
        .object({
          task: z.string(),
          priority: z.enum(['P0', 'P1', 'P2']),
          owner: z.enum(['user', 'agent']),
          notes: z.string().optional(),
        })
        .strict()
    ),
  })
  .strict();

export type ChecklistArtifact = z.infer<typeof ChecklistArtifactSchema>;

export const ModelIndexSchema = z
  .object({
    frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
    periods: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const ModelInputSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    value: z.number(),
    unit: z.string().optional(),
    notes: z.string().optional(),
    source: z.enum(['user', 'inferred', 'placeholder']).optional(),
  })
  .strict();

export const ModelOutputSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    unit: z.string().optional(),
  })
  .strict();

export const ModelEquationSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    definition: z.string().min(1),
  })
  .strict();

export const ModelSeriesRowSchema = z.object({ period: z.string().min(1) }).catchall(z.union([z.number(), z.null(), z.string()]));

export const ModelChartSchema = z
  .object({
    name: z.string().min(1),
    chartType: z.enum(['line', 'bar']),
    xKey: z.string().min(1),
    yKey: z.string().min(1),
    data: z.array(z.unknown()),
  })
  .strict();

export const ModelAndVizArtifactSchema = z
  .object({
    model: z
      .object({
        kind: z.enum(['forecast', 'sensitivity', 'dcf', 'generic']),
        title: z.string().min(1),
        index: ModelIndexSchema,
        inputs: z.array(ModelInputSchema),
        equations: z.array(ModelEquationSchema).optional().default([]),
        outputs: z.array(ModelOutputSchema),
        objective_metric_key: z.string().optional(),
        objective_metric_label: z.string().optional(),
      })
      .strict(),
    evaluation: z
      .object({
        asOf: z.string().min(1),
        rows: z.array(ModelSeriesRowSchema),
        summary: z
          .array(
            z
              .object({
                key: z.string().min(1),
                label: z.string().min(1),
                value: z.union([z.number(), z.string(), z.null()]),
                unit: z.string().optional(),
              })
              .strict()
          )
          .optional()
          .default([]),
      })
      .strict(),
    charts: z.array(ModelChartSchema).optional().default([]),
  })
  .strict();

export type ModelAndVizArtifact = z.infer<typeof ModelAndVizArtifactSchema>;

export const AgentInferenceSchema = z
  .object({
    inferred: z.boolean(),
    method: z.enum(['rules', 'llm']),
    reason: z.string(),
  })
  .strict();

export type AgentInference = z.infer<typeof AgentInferenceSchema>;

export const ModelRecommendationSchema = z
  .object({
    required: z.boolean(),
    helpful: z.boolean(),
    reason: z.string(),
  })
  .strict();

export type ModelRecommendation = z.infer<typeof ModelRecommendationSchema>;

const ValidationWarningSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    affected_keys: z.array(z.string()),
  })
  .strict();

const ValidationResultSchema = z
  .object({
    passed: z.boolean(),
    warnings: z.array(ValidationWarningSchema),
  })
  .strict();

const DriverContributionSchema = z
  .object({
    driver: z.string().min(1),
    direction: z.enum(['positive', 'negative']),
    magnitude: z.string().min(1),
    explanation: z.string().min(1),
  })
  .strict();

const ExplainabilityResultSchema = z
  .object({
    primary_metric: z.string().min(1),
    contributions: z.array(DriverContributionSchema),
  })
  .strict();

const AssumptionsSummarySchema = z
  .object({
    placeholder_count: z.number().int().min(0),
    high_impact_placeholders: z.array(z.string()),
    notes: z.string(),
  })
  .strict();

const BaseOutputSchema = z
  .object({
    id: z.string().uuid(),
    type: OutputTypeSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    confidence: z.number().min(0).max(1),
    inference: AgentInferenceSchema.optional().default({ inferred: true, method: 'rules', reason: 'legacy_inference' }),
    model_recommendation: ModelRecommendationSchema.optional().default({ required: false, helpful: false, reason: 'n/a' }),
    clarifying_questions: z.array(z.string()).max(5),
    render_hints: RenderHintsSchema,
    render_blocks: z.array(UiBlockSchema).optional().default([]),
    warnings: z.array(z.string()),
    validation: ValidationResultSchema.optional(),
    explainability: ExplainabilityResultSchema.optional(),
    assumptions_summary: AssumptionsSummarySchema.optional(),
  })
  .strict();

export const AgentOutputSchema = z.discriminatedUnion('type', [
  BaseOutputSchema.extend({ type: z.literal('MODEL_AND_VIZ'), artifact: ModelAndVizArtifactSchema }),
  BaseOutputSchema.extend({ type: z.literal('FORECAST_BLUEPRINT'), artifact: ForecastBlueprintArtifactSchema }),
  BaseOutputSchema.extend({ type: z.literal('SCENARIO_ENGINE'), artifact: ScenarioEngineArtifactSchema }),
  BaseOutputSchema.extend({ type: z.literal('DCF_DRIVERS'), artifact: DcfDriversArtifactSchema }),
  BaseOutputSchema.extend({ type: z.literal('MARKET_IMPACT_BRIEF'), artifact: MarketImpactBriefArtifactSchema }),
  BaseOutputSchema.extend({ type: z.literal('SQL_QUERY'), artifact: SqlQueryArtifactSchema }),
  BaseOutputSchema.extend({ type: z.literal('PYTHON_NOTEBOOK'), artifact: PythonNotebookArtifactSchema }),
  BaseOutputSchema.extend({ type: z.literal('SLIDE_OUTLINE'), artifact: SlideOutlineArtifactSchema }),
  BaseOutputSchema.extend({ type: z.literal('CHECKLIST'), artifact: ChecklistArtifactSchema }),
]);

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export const AgentLlmOutputBaseSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    confidence: z.number().min(0).max(1),
    clarifying_questions: z.array(z.string()).max(5).default([]),
    warnings: z.array(z.string()).default([]),
  })
  .strict();

export function getAgentLlmOutputSchema(type: OutputType) {
  switch (type) {
    case 'MODEL_AND_VIZ':
      return AgentLlmOutputBaseSchema.extend({ artifact: ModelAndVizArtifactSchema });
    case 'FORECAST_BLUEPRINT':
      return AgentLlmOutputBaseSchema.extend({ artifact: ForecastBlueprintArtifactSchema });
    case 'SCENARIO_ENGINE':
      return AgentLlmOutputBaseSchema.extend({ artifact: ScenarioEngineArtifactSchema });
    case 'DCF_DRIVERS':
      return AgentLlmOutputBaseSchema.extend({ artifact: DcfDriversArtifactSchema });
    case 'MARKET_IMPACT_BRIEF':
      return AgentLlmOutputBaseSchema.extend({ artifact: MarketImpactBriefArtifactSchema });
    case 'SQL_QUERY':
      return AgentLlmOutputBaseSchema.extend({ artifact: SqlQueryArtifactSchema });
    case 'PYTHON_NOTEBOOK':
      return AgentLlmOutputBaseSchema.extend({ artifact: PythonNotebookArtifactSchema });
    case 'SLIDE_OUTLINE':
      return AgentLlmOutputBaseSchema.extend({ artifact: SlideOutlineArtifactSchema });
    case 'CHECKLIST':
      return AgentLlmOutputBaseSchema.extend({ artifact: ChecklistArtifactSchema });
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled OutputType: ${exhaustive}`);
    }
  }
}
