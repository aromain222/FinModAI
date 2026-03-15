import { getModel } from '@/lib/models/core/registry';

export type AnalystCoreTemplatePayload = {
  slug: string;
  name: string;
  category: string;
  description: string;
  href: string;
  surface: 'template_library' | 'automated_builder';
  sectionTitles: string[];
  fieldHighlights: string[];
};

type CoreTemplateMatcher = {
  slug?: string;
  href?: string;
  name?: string;
  category?: string;
  description?: string;
  surface?: 'template_library' | 'automated_builder';
  sectionTitles?: string[];
  fieldHighlights?: string[];
  patterns: RegExp[];
};

const CORE_TEMPLATE_MATCHERS: CoreTemplateMatcher[] = [
  {
    slug: 'vc-returns-irr',
    patterns: [/\bvc returns?\b/i, /\bventure returns?\b/i, /\bventure irr\b/i, /\bmoic\b/i],
  },
  {
    slug: 'runway-burn',
    patterns: [/\brunway\b/i, /\bburn rate\b/i, /\bcash burn\b/i],
  },
  {
    slug: 'saas-kpi-cohort',
    patterns: [/\bsaas kpi cohort\b/i, /\bkpi cohort\b/i, /\bsaas kpi\b/i],
  },
  {
    slug: 'ma-accretion-dilution',
    patterns: [/\baccretion(?:\s*\/\s*dilution)?\b/i, /\bdilution\b/i, /\bmerger model\b/i],
  },
  {
    slug: 'revenue-recognition-asc606',
    patterns: [/\basc\s?606\b/i, /\brevenue recognition\b/i],
  },
  {
    slug: 'inventory-cogs',
    patterns: [/\binventory\b/i, /\bcogs\b/i, /\bcost of goods sold\b/i],
  },
  {
    slug: 'dividend-discount-model',
    patterns: [/\bdividend discount\b/i, /\bddm\b/i],
  },
  {
    slug: 'residual-income-model',
    patterns: [/\bresidual income\b/i, /\bresidual earnings\b/i],
  },
  {
    slug: 'debt-amortization-refi',
    patterns: [/\bdebt amortization\b/i, /\bdebt refi\b/i, /\brefinancing model\b/i],
  },
  {
    slug: 'buyback-eps-accretion',
    patterns: [/\bbuyback\b/i, /\beps accretion\b/i, /\bshare repurchase\b/i],
  },
  {
    slug: 'purchase-price-allocation',
    patterns: [/\bpurchase price allocation\b/i, /\bppa\b/i, /\bgoodwill\b.*\ballocation\b/i],
  },
  {
    slug: 'working-capital-schedule',
    patterns: [/\bworking capital schedule\b/i, /\bnwc schedule\b/i, /\bworking capital\b/i],
  },
  {
    slug: 'ppe-depreciation-schedule',
    patterns: [/\bpp&e\b/i, /\bdepreciation schedule\b/i, /\bcapex schedule\b/i],
  },
  {
    slug: 'vc-cap-table-advanced',
    patterns: [/\badvanced cap table\b/i, /\bvc cap table\b/i, /\bsafe conversion\b/i, /\bwaterfall\b/i],
  },
  {
    slug: 'saas-cohort-board',
    patterns: [/\bsaas cohort board\b/i, /\bcohort retention\b/i, /\bltv\s*:?\s*cac\b/i],
  },
  {
    slug: 'journal-to-fs',
    patterns: [/\bjournal to fs\b/i, /\bjournal entries?\b.*\bfinancial statements?\b/i, /\bjournal to financial statements\b/i],
  },
  {
    slug: 'accounting-equation',
    patterns: [/\baccounting equation\b/i, /\bassets\s*=\s*liabilities\b/i, /\bassets equal liabilities\b/i],
  },
  {
    slug: 'operating-model',
    patterns: [/\boperating model\b/i, /\bdriver model\b/i],
  },
  {
    href: '/models/create?type=reverse-dcf',
    name: 'Reverse DCF',
    category: 'Corporate Finance',
    description: 'Solve for the growth or margin assumptions implied by the current valuation anchor.',
    surface: 'automated_builder',
    sectionTitles: ['Pricing Anchor', 'Reverse DCF Assumptions', 'Implied Expectations', 'Sensitivity'],
    fieldHighlights: ['Ticker', 'Target Price', 'WACC', 'Terminal Growth', 'Projection Years'],
    patterns: [/\breverse dcf\b/i, /\bimplied growth\b/i],
  },
  {
    href: '/models/create?type=debt-capacity-lite',
    name: 'Debt Capacity Lite',
    category: 'Corporate Finance',
    description: 'Estimate leverage headroom from EBITDA, leverage caps, coverage constraints, and current net debt.',
    surface: 'automated_builder',
    sectionTitles: ['Company Snapshot', 'Leverage Inputs', 'Coverage Inputs', 'Debt Headroom'],
    fieldHighlights: ['Ticker', 'Max Leverage', 'Min Interest Coverage', 'Interest Rate'],
    patterns: [/\bdebt capacity\b/i, /\bleverage headroom\b/i, /\bcoverage cap\b/i],
  },
  {
    href: '/models/create?type=scorecard',
    name: 'Fundamentals Scorecard',
    category: 'Corporate Finance',
    description: 'Rules-based screen of profitability, leverage, quality, and resilience with sector-aware framing.',
    surface: 'automated_builder',
    sectionTitles: ['Company Overview', 'Scorecard Metrics', 'Quality Signals', 'Watch Items'],
    fieldHighlights: ['Ticker', 'Sector', 'Profitability', 'Leverage', 'Resilience'],
    patterns: [/\bscorecard\b/i, /\bfundamentals scorecard\b/i, /\bquality screen\b/i],
  },
  {
    href: '/models/create?type=merger',
    name: 'Merger Model',
    category: 'Banking',
    description: 'Model transaction structure, financing mix, pro forma impact, and EPS accretion or dilution.',
    surface: 'automated_builder',
    sectionTitles: ['Deal Inputs', 'Financing Mix', 'Pro Forma Impact', 'Accretion / Dilution'],
    fieldHighlights: ['Acquirer', 'Target', 'Purchase Price', 'Cash / Stock Mix', 'Synergies'],
    patterns: [/\bmerger model\b/i, /\bm&a model\b/i, /\bma model\b/i],
  },
  {
    href: '/models/create?type=operating',
    name: 'Operating Model',
    category: 'Corporate Finance',
    description: 'Monthly operating and cash planning workflow with forecast, variance, and runway framing.',
    surface: 'automated_builder',
    sectionTitles: ['Operating Inputs', 'Forecast', 'Variance', 'Runway'],
    fieldHighlights: ['Revenue', 'Expenses', 'Cash Balance', 'Variance', 'Runway'],
    patterns: [/\bfp&a\b/i, /\bmonthly operating\b/i, /\bvariance analysis\b/i],
  },
];

function buildPayload(slug: string): AnalystCoreTemplatePayload | null {
  const model = getModel(slug);
  if (!model) return null;

  const sectionTitles = model.uiSchema.sections.map((section) => section.title).slice(0, 4);
  const fieldHighlights = model.uiSchema.sections
    .flatMap((section) => section.fields.map((field) => field.label))
    .slice(0, 8);

  return {
    slug: model.slug,
    name: model.name,
    category: model.category,
    description: model.description,
    href: `/models/${model.slug}`,
    surface: 'template_library',
    sectionTitles,
    fieldHighlights,
  };
}

export function detectCoreTemplatePrompt(prompt: string): AnalystCoreTemplatePayload | null {
  for (const matcher of CORE_TEMPLATE_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(prompt))) {
      if (matcher.slug) {
        return buildPayload(matcher.slug);
      }
      if (matcher.href && matcher.name && matcher.category && matcher.description && matcher.surface) {
        return {
          slug: matcher.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: matcher.name,
          category: matcher.category,
          description: matcher.description,
          href: matcher.href,
          surface: matcher.surface,
          sectionTitles: matcher.sectionTitles ?? [],
          fieldHighlights: matcher.fieldHighlights ?? [],
        };
      }
    }
  }
  return null;
}
