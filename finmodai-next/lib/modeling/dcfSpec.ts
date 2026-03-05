import { z } from 'zod';

const percent = (min: number, max: number, label: string) =>
  z
    .number({ invalid_type_error: `${label} must be numeric` })
    .finite(`${label} must be finite`)
    .min(min, `${label} must be >= ${min}`)
    .max(max, `${label} must be <= ${max}`);

const growthArraySchema = z.array(percent(-0.25, 0.5, 'revenue growth')).min(1);
const marginArraySchema = z.array(percent(0, 0.6, 'EBIT margin')).min(1);

const terminalSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('gordon'),
    g: percent(0, 0.06, 'terminal g'),
  }),
  z.object({
    method: z.literal('exit_multiple'),
    exit_multiple: z
      .number({ invalid_type_error: 'exit_multiple must be numeric' })
      .finite('exit_multiple must be finite')
      .min(3, 'exit_multiple must be >= 3')
      .max(30, 'exit_multiple must be <= 30'),
  }),
]);

const sensitivitySchema = z.object({
  wacc: z.array(percent(0.04, 0.2, 'sensitivity wacc')).min(3).max(15),
  terminal_g: z.array(percent(0, 0.06, 'sensitivity terminal g')).min(3).max(15).optional(),
  exit_multiple: z
    .array(
      z
        .number({ invalid_type_error: 'sensitivity exit_multiple must be numeric' })
        .finite('sensitivity exit_multiple must be finite')
        .min(3)
        .max(30)
    )
    .min(3)
    .max(15)
    .optional(),
});

export const DcfSpecSchema = z
  .object({
    company: z.object({
      name: z.string().min(1).max(120),
      ticker: z.string().min(1).max(12).optional(),
      currency: z.string().min(3).max(3),
    }),
    periods: z.object({
      start_year: z.number().int().min(2000).max(2100),
      years: z.number().int().min(3).max(15),
    }),
    base_year: z.object({
      revenue: z.number().positive('base year revenue must be > 0'),
      ebit_margin: percent(0, 0.6, 'base year EBIT margin'),
    }),
    forecast: z.object({
      revenue_growth: growthArraySchema,
      ebit_margin: marginArraySchema,
      tax_rate: percent(0, 0.4, 'tax rate'),
      da_pct_rev: percent(0, 0.2, 'D&A % revenue'),
      capex_pct_rev: percent(0, 0.25, 'capex % revenue'),
      nwc_pct_rev: percent(-0.1, 0.2, 'NWC % revenue'),
    }),
    valuation: z.object({
      wacc: percent(0.04, 0.2, 'wacc'),
      terminal: terminalSchema,
    }),
    outputs: z.object({
      sensitivity: sensitivitySchema,
    }),
  })
  .superRefine((spec, ctx) => {
    const years = spec.periods.years;

    if (spec.forecast.revenue_growth.length !== years) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['forecast', 'revenue_growth'],
        message: `revenue_growth length must equal periods.years (${years})`,
      });
    }

    if (spec.forecast.ebit_margin.length !== years) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['forecast', 'ebit_margin'],
        message: `ebit_margin length must equal periods.years (${years})`,
      });
    }

    if (spec.valuation.terminal.method === 'gordon') {
      if (!spec.outputs.sensitivity.terminal_g || spec.outputs.sensitivity.terminal_g.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['outputs', 'sensitivity', 'terminal_g'],
          message: 'terminal_g sensitivity is required when terminal method is gordon',
        });
      }
      if (spec.outputs.sensitivity.exit_multiple) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['outputs', 'sensitivity', 'exit_multiple'],
          message: 'exit_multiple sensitivity must be omitted for gordon method',
        });
      }
      if (spec.valuation.wacc <= spec.valuation.terminal.g) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['valuation', 'terminal', 'g'],
          message: 'terminal g must be less than wacc',
        });
      }
    }

    if (spec.valuation.terminal.method === 'exit_multiple') {
      if (!spec.outputs.sensitivity.exit_multiple || spec.outputs.sensitivity.exit_multiple.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['outputs', 'sensitivity', 'exit_multiple'],
          message: 'exit_multiple sensitivity is required when terminal method is exit_multiple',
        });
      }
      if (spec.outputs.sensitivity.terminal_g) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['outputs', 'sensitivity', 'terminal_g'],
          message: 'terminal_g sensitivity must be omitted for exit_multiple method',
        });
      }
    }
  });

export type DcfSpec = z.infer<typeof DcfSpecSchema>;

export const DcfOverridesSchema = z
  .object({
    years: z.number().int().min(3).max(15).optional(),
    wacc: percent(0.04, 0.2, 'override wacc').optional(),
    terminal_g: percent(0, 0.06, 'override terminal g').optional(),
    terminal_method: z.enum(['gordon', 'exit_multiple']).optional(),
    exit_multiple: z
      .number()
      .finite()
      .min(3)
      .max(30)
      .optional(),
  })
  .optional();

export type DcfOverrides = z.infer<typeof DcfOverridesSchema>;

function resizeSeries(series: number[], years: number, fallback: number): number[] {
  if (!Array.isArray(series) || series.length === 0) {
    return Array.from({ length: years }, () => fallback);
  }
  if (series.length === years) return series.slice();
  if (series.length > years) return series.slice(0, years);

  const out = series.slice();
  const last = out[out.length - 1] ?? fallback;
  while (out.length < years) out.push(last);
  return out;
}

function cleanTicker(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
  return cleaned || undefined;
}

export function applyDcfOverrides(spec: DcfSpec, overrides?: DcfOverrides): DcfSpec {
  if (!overrides) return DcfSpecSchema.parse(spec);

  const next: DcfSpec = JSON.parse(JSON.stringify(spec));

  if (overrides.years) {
    next.periods.years = overrides.years;
    next.forecast.revenue_growth = resizeSeries(next.forecast.revenue_growth, overrides.years, 0.05);
    next.forecast.ebit_margin = resizeSeries(next.forecast.ebit_margin, overrides.years, next.base_year.ebit_margin);
  }

  if (typeof overrides.wacc === 'number') {
    next.valuation.wacc = overrides.wacc;
  }

  if (overrides.terminal_method === 'gordon') {
    const g = typeof overrides.terminal_g === 'number' ? overrides.terminal_g : 0.025;
    next.valuation.terminal = { method: 'gordon', g };
    const baseG = Array.isArray(next.outputs.sensitivity.terminal_g) ? next.outputs.sensitivity.terminal_g : [0.015, 0.02, 0.025, 0.03];
    next.outputs.sensitivity.terminal_g = baseG;
    delete next.outputs.sensitivity.exit_multiple;
  }

  if (overrides.terminal_method === 'exit_multiple') {
    const multiple = typeof overrides.exit_multiple === 'number' ? overrides.exit_multiple : 12;
    next.valuation.terminal = { method: 'exit_multiple', exit_multiple: multiple };
    const baseExit = Array.isArray(next.outputs.sensitivity.exit_multiple)
      ? next.outputs.sensitivity.exit_multiple
      : [8, 10, 12, 14, 16];
    next.outputs.sensitivity.exit_multiple = baseExit;
    delete next.outputs.sensitivity.terminal_g;
  }

  if (typeof overrides.terminal_g === 'number') {
    if (next.valuation.terminal.method === 'gordon') {
      next.valuation.terminal.g = overrides.terminal_g;
    }
  }

  if (typeof overrides.exit_multiple === 'number') {
    if (next.valuation.terminal.method === 'exit_multiple') {
      next.valuation.terminal.exit_multiple = overrides.exit_multiple;
    }
  }

  next.company.ticker = cleanTicker(next.company.ticker);
  next.company.currency = (next.company.currency || 'USD').toUpperCase().slice(0, 3);

  return DcfSpecSchema.parse(next);
}
