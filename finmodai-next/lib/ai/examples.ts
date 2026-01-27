import {
  AgentOutputSchema,
  type AgentOutput,
  type OutputType,
} from '@/lib/ai/schemas';
import { buildRenderBlocks } from '@/lib/ai/renderBlocks';

const baseHints = {
  layout: 'mixed' as const,
  primary_blocks: [{ block_type: 'text' as const, label: 'Overview', key: 'overview' }],
};

const makeOutput = (id: string, type: OutputType, title: string, summary: string, artifact: any, blocks?: any[]): AgentOutput => {
  const render_blocks = Array.isArray(blocks) && blocks.length ? blocks : buildRenderBlocks(type, artifact);
  return AgentOutputSchema.parse({
    id,
    type,
    title,
    summary,
    confidence: 0.72,
    clarifying_questions: [],
    render_hints: baseHints,
    render_blocks,
    warnings: [],
    artifact,
  });
};

export const EXAMPLE_AGENT_OUTPUTS: AgentOutput[] = [
  makeOutput(
    '00000000-0000-4000-8000-000000000001',
    'FORECAST_BLUEPRINT',
    'Xbox Q4 Sales Forecast Blueprint',
    'A driver-based blueprint for forecasting Q4 Xbox sales and testing sensitivities.',
    {
      objective: 'Forecast Xbox unit sales in Q4 and identify the load-bearing drivers.',
      target_metric: 'Units',
      horizon: { start: '2026-10-01', end: '2026-12-31', frequency: 'weekly' },
      key_drivers: [
        { name: 'Installed base demand', rationale: 'Installed base and new buyer demand drive baseline volume.', directionality: 'positive' },
        { name: 'Promo intensity', rationale: 'Discounting changes conversion and mix; can pull forward demand.', directionality: 'mixed' },
        { name: 'Supply constraints', rationale: 'Inventory and channel allocation cap realized units.', directionality: 'mixed' },
      ],
      assumptions: [
        { name: 'Baseline run-rate', default: 'Use trailing 8–12 weeks adjusted for seasonality', sensitivity: 'high' },
        { name: 'Promo calendar', default: 'Assume similar cadence to last-year Q4 unless specified', sensitivity: 'med' },
        { name: 'No binding supply shock', default: 'Assume adequate inventory absent evidence', sensitivity: 'med' },
      ],
      data_needed: [
        { source: 'internal', field: 'Weekly units by channel', notes: 'Needed to calibrate baseline and promo response.' },
        { source: 'public', field: 'Holiday seasonality benchmarks', notes: 'Use category seasonality if internal history is sparse.' },
      ],
      model_structure: [
        { step: 1, description: 'Baseline run-rate + seasonal index.' },
        { step: 2, description: 'Apply promo multiplier + supply caps.' },
        { step: 3, description: 'Generate base/upside/downside by shifting 1–2 drivers.' },
      ],
      output_tables: [
        { name: 'Weekly forecast', columns: ['Week', 'Units', 'Assumptions'] },
        { name: 'Driver sensitivities', columns: ['Driver', 'Base', 'Upside', 'Downside'] },
      ],
      charts: [{ name: 'Weekly units (base band)', x: 'week', y: 'units', note: 'Base with upside/downside bands.' }],
    },
    [
      ...buildRenderBlocks('FORECAST_BLUEPRINT', {
        objective: 'Forecast Xbox unit sales in Q4 and identify the load-bearing drivers.',
        target_metric: 'Units',
        horizon: { start: '2026-10-01', end: '2026-12-31', frequency: 'weekly' },
        key_drivers: [
          { name: 'Installed base demand', rationale: 'Installed base and new buyer demand drive baseline volume.', directionality: 'positive' },
          { name: 'Promo intensity', rationale: 'Discounting changes conversion and mix; can pull forward demand.', directionality: 'mixed' },
          { name: 'Supply constraints', rationale: 'Inventory and channel allocation cap realized units.', directionality: 'mixed' },
        ],
        assumptions: [
          { name: 'Baseline run-rate', default: 'Use trailing 8–12 weeks adjusted for seasonality', sensitivity: 'high' },
          { name: 'Promo calendar', default: 'Assume similar cadence to last-year Q4 unless specified', sensitivity: 'med' },
          { name: 'No binding supply shock', default: 'Assume adequate inventory absent evidence', sensitivity: 'med' },
        ],
        data_needed: [
          { source: 'internal', field: 'Weekly units by channel', notes: 'Needed to calibrate baseline and promo response.' },
          { source: 'public', field: 'Holiday seasonality benchmarks', notes: 'Use category seasonality if internal history is sparse.' },
        ],
        model_structure: [
          { step: 1, description: 'Baseline run-rate + seasonal index.' },
          { step: 2, description: 'Apply promo multiplier + supply caps.' },
          { step: 3, description: 'Generate base/upside/downside by shifting 1–2 drivers.' },
        ],
        output_tables: [
          { name: 'Weekly forecast', columns: ['Week', 'Units', 'Assumptions'] },
          { name: 'Driver sensitivities', columns: ['Driver', 'Base', 'Upside', 'Downside'] },
        ],
        charts: [{ name: 'Weekly units (base band)', x: 'week', y: 'units', note: 'Base with upside/downside bands.' }],
      }),
      {
        kind: 'chart',
        title: 'Example Chart (Line)',
        chartType: 'line',
        xKey: 'week',
        yKey: 'units',
        data: [
          { week: 'W1', units: 100 },
          { week: 'W2', units: 120 },
          { week: 'W3', units: 150 },
          { week: 'W4', units: 140 },
        ],
      },
    ]
  ),
  makeOutput(
    '00000000-0000-4000-8000-000000000002',
    'SCENARIO_ENGINE',
    'NVDA Gross Margin Scenarios',
    'Defines base/upside/downside scenarios via explicit shocks and timelines.',
    {
      base_case: {
        narrative: 'Base case: stable pricing and mix with modest operating leverage.',
        shocks: [{ variable: 'Gross margin', unit: 'pp', magnitude: '0', duration: '6 quarters', rationale: 'Assume steady pricing/mix.' }],
      },
      upside_case: {
        narrative: 'Upside case: favorable mix and operating leverage improves unit economics.',
        shocks: [{ variable: 'Gross margin', unit: 'pp', magnitude: '+200', duration: '6 quarters', rationale: 'Higher-margin mix and better absorption.' }],
      },
      downside_case: {
        narrative: 'Downside case: pricing pressure and cost inflation compress margins.',
        shocks: [{ variable: 'Gross margin', unit: 'pp', magnitude: '-300', duration: '6 quarters', rationale: 'Competitive pressure and input costs.' }],
      },
      shock_library: [
        { variable: 'Revenue growth', unit: '%', magnitude: '±TBD', duration: 'TBD', rationale: 'Demand and pricing/mix.' },
        { variable: 'Gross margin', unit: 'pp', magnitude: '±TBD', duration: 'TBD', rationale: 'Pricing, mix, and costs.' },
      ],
      timeline: [
        { period: 'Next 6 quarters', note: 'Apply shocks sequentially as mix and costs evolve.' },
        { period: 'Quarter 1', note: 'Initial response period (pricing/inventory).' },
      ],
    }
  ),
  makeOutput(
    '00000000-0000-4000-8000-000000000003',
    'DCF_DRIVERS',
    'DCF Drivers (High-Level)',
    'A structured driver library for a DCF: revenue, costs, opex, capex, and working capital.',
    {
      revenue: { drivers: [{ name: 'Revenue growth', default: '8% YoY', range: { low: '3%', high: '12%' }, note: 'Top-line growth by period.' }] },
      cogs: { drivers: [{ name: 'COGS % of revenue', default: '55%', range: { low: '50%', high: '60%' }, note: 'Gross margin bridge.' }] },
      opex: { drivers: [{ name: 'SG&A % of revenue', default: '18%', range: { low: '15%', high: '22%' }, note: 'Operating leverage vs reinvestment.' }] },
      capex: { drivers: [{ name: 'Capex % of revenue', default: '4%', range: { low: '3%', high: '6%' }, note: 'Maintenance vs growth capex.' }] },
      nwc: { drivers: [{ name: 'NWC % of revenue', default: '2%', range: { low: '0%', high: '4%' }, note: 'Working capital policy.' }] },
      checks: ['Cross-check implied margins vs history and peers.', 'Ensure capex + NWC assumptions are consistent with growth.'],
    }
  ),
  makeOutput(
    '00000000-0000-4000-8000-000000000004',
    'MARKET_IMPACT_BRIEF',
    'Hurricane Event — Market Impact Brief',
    'Maps event transmission channels to likely sector impacts and watchlist metrics.',
    {
      event_summary: 'Major hurricane hits the Gulf Coast; energy infrastructure and logistics disruptions expected.',
      transmission_channels: [
        { channel: 'Supply / logistics', mechanism: 'Port closures and refinery downtime reduce near-term supply.' },
        { channel: 'Demand substitution', mechanism: 'Temporary shifts in consumption and rebuild-driven demand.' },
      ],
      likely_impacts: [
        { asset_or_sector: 'Energy', direction: 'up', why: 'Supply disruption risk can lift near-term prices/spreads.' },
        { asset_or_sector: 'Insurance', direction: 'down', why: 'Loss expectations rise; repricing typically lags.' },
      ],
      watchlist: [
        { metric: 'Crack spreads', why: 'Signals refinery constraints and product tightness.' },
        { metric: 'Freight rates', why: 'Captures logistics disruptions and bottlenecks.' },
      ],
      next_actions: ['Track first-24h vs first-week market reaction.', 'Update sector impacts as damage assessments finalize.'],
    }
  ),
  makeOutput(
    '00000000-0000-4000-8000-000000000005',
    'SQL_QUERY',
    'SQL Query Template — Orders Cohort',
    'A query template for cohorting orders and measuring retention by month.',
    {
      assumptions: ['Postgres dialect', 'orders.created_at is UTC', 'users.id is primary key'],
      sql: 'select date_trunc(\'month\', o.created_at) as cohort_month, count(distinct o.user_id) as users\nfrom orders o\ngroup by 1\norder by 1 desc;',
      explanation: 'Groups orders into monthly cohorts; extend with joins and filters to match your schema.',
    }
  ),
  makeOutput(
    '00000000-0000-4000-8000-000000000006',
    'PYTHON_NOTEBOOK',
    'Python Notebook Plan — Forecast Backtest',
    'Steps and pseudocode for cleaning time series data and backtesting a forecasting approach.',
    {
      environment: { python: '3.11', packages: ['pandas', 'numpy', 'statsmodels', 'matplotlib'] },
      steps: [
        { step: 1, description: 'Load data and normalize timestamps.' },
        { step: 2, description: 'Split train/validation and define baselines.' },
        { step: 3, description: 'Fit candidate models and evaluate error.' },
      ],
      pseudocode: 'import pandas as pd\n\n# load\n# clean\n# split\n# fit\n# evaluate',
    }
  ),
  makeOutput(
    '00000000-0000-4000-8000-000000000007',
    'SLIDE_OUTLINE',
    'Strategic Update Deck Outline',
    'A slide-by-slide outline suitable for generating a deck.',
    {
      deck_title: 'Strategic Update — Q4',
      slides: [
        { slide: 1, title: 'Executive Summary', bullets: ['What changed', 'What matters', 'Risks'] },
        { slide: 2, title: 'Drivers', bullets: ['Driver tree', 'Assumptions', 'Sensitivities'] },
      ],
    }
  ),
  makeOutput(
    '00000000-0000-4000-8000-000000000008',
    'CHECKLIST',
    'Forecast Build Checklist',
    'A prioritized checklist to execute a forecasting workflow end-to-end.',
    {
      tasks: [
        { task: 'Confirm objective and KPI definitions', priority: 'P0', owner: 'user', notes: 'Align on what “success” means.' },
        { task: 'Assemble baseline history and clean time series', priority: 'P0', owner: 'user' },
        { task: 'Draft driver tree and assumptions', priority: 'P1', owner: 'agent' },
      ],
    }
  ),
];

