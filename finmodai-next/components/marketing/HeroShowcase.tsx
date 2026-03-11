'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Newspaper,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    id: 'overview',
    label: 'Overview 00',
    title: 'CapitalBase, at a glance',
    badge: 'Platform overview',
    content: (
      <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">What the platform does</p>
          <div className="mt-5 grid gap-3">
            {[
              ['Generate financial models', 'Turn one request into a structured, downloadable model package.'],
              ['Surface market intelligence', 'Translate headlines and events into what matters for sectors, assets, and tickers.'],
              ['Produce analyst-ready outputs', 'Deliver summaries, scenarios, and exports that can be reviewed immediately.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[22px] border border-white/6 bg-white/[0.02] px-4 py-4">
                <p className="text-base font-semibold tracking-[-0.02em] text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--cb-text-secondary)]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(61,112,255,0.18),rgba(0,227,135,0.1),rgba(255,255,255,0.03))] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/60">Workflow</p>
            <div className="mt-6 flex items-center gap-3 text-sm text-white/85">
              <span className="rounded-full border border-white/12 bg-black/15 px-3 py-1.5">Prompt</span>
              <ArrowRight className="h-4 w-4 text-white/30" />
              <span className="rounded-full border border-white/12 bg-black/15 px-3 py-1.5">Model</span>
              <ArrowRight className="h-4 w-4 text-white/30" />
              <span className="rounded-full border border-white/12 bg-black/15 px-3 py-1.5">Insight</span>
            </div>
            <p className="mt-6 text-lg font-semibold tracking-[-0.03em] text-white">
              The hero stays simple. Use the arrows to preview what the platform actually generates.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['Models', FileSpreadsheet],
              ['Intelligence', Newspaper],
              ['Forecasts', TrendingUp],
              ['Charts', BarChart3],
            ].map(([label, Icon]) => (
              <div key={label} className="rounded-[20px] border border-white/6 bg-[#0d1117] px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04]">
                    <Icon className="h-4 w-4 text-[var(--cb-green)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Preview on next slides</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'workflow',
    label: 'Workflow 01',
    title: 'One prompt to a downloadable model',
    badge: 'Model workflow',
    content: (
      <div className="space-y-4">
        <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--cb-green)]/10 text-[var(--cb-green)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Prompt</p>
                <p className="mt-1 text-xs text-white/50">Analyst request translated into a finance workflow</p>
              </div>
            </div>
            <div className="rounded-full border border-[var(--cb-green)]/16 bg-[var(--cb-green)]/8 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--cb-green)]">
              Live generation
            </div>
          </div>
          <div className="mt-4 rounded-[22px] bg-[linear-gradient(180deg,rgba(8,13,18,0.98),rgba(7,11,16,0.98))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <p className="text-[1.1rem] font-medium tracking-[-0.02em] text-white">
              Build a DCF model for NVIDIA with a 10-year forecast.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
          <div className="space-y-4">
            <div className="rounded-[30px] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Workflow output</p>
                  <p className="mt-1 text-xs text-[var(--cb-text-muted)]">The prompt becomes a structured model package</p>
                </div>
                <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/60">
                  Downloadable
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ['Detect company', 'Ticker, sector, and relevant model type'],
                  ['Build model', 'Forecast logic, assumptions, and outputs'],
                  ['Export workbook', '.xlsx ready for analyst review'],
                ].map(([title, body], index) => (
                  <div
                    key={title}
                    className={cn(
                      'rounded-[24px] p-[1px]',
                      index === 1
                        ? 'bg-[linear-gradient(180deg,rgba(0,227,135,0.22),rgba(255,255,255,0.05))]'
                        : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]'
                    )}
                  >
                    <div className="h-full rounded-[23px] bg-[linear-gradient(180deg,rgba(8,13,18,0.98),rgba(9,14,19,0.98))] px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 0{index + 1}</p>
                      <p className="mt-3 text-base font-semibold tracking-[-0.02em] text-white">{title}</p>
                      <p className="mt-2 text-sm leading-6 text-white/58">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[30px] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">What the analyst receives</p>
                  <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Outputs that can be reviewed, adjusted, and shared</p>
                </div>
                <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/60">
                  Model package
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3 text-sm text-white/70">
                <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Linked forecast</span>
                <ArrowRight className="h-4 w-4 text-white/30" />
                <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Valuation summary</span>
                <ArrowRight className="h-4 w-4 text-white/30" />
                <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Excel export</span>
              </div>
              <div className="mt-5 rounded-[24px] bg-[linear-gradient(180deg,rgba(8,13,18,0.98),rgba(9,14,19,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">capitalbase_nvidia_dcf.xlsx</p>
                    <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Inputs, forecast, valuation, sensitivity</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--cb-green)]/16 bg-[var(--cb-green)]/10 text-[var(--cb-green)]">
                    <Download className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {['Assumptions', 'Forecast', 'DCF'].map((sheet) => (
                    <div key={sheet} className="rounded-[18px] border border-white/7 bg-black/20 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cb-text-muted)]">Sheet</p>
                      <p className="mt-2 text-sm font-medium text-white">{sheet}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">What CapitalBase handles</p>
                <p className="mt-1 text-xs text-[var(--cb-text-muted)]">From natural language request to a finance-native deliverable</p>
              </div>
              <Sparkles className="h-4 w-4 text-[var(--cb-green)]" />
            </div>
            <div className="mt-5 divide-y divide-white/6 overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(8,13,18,0.98),rgba(9,14,19,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              {[
                ['Understands the prompt', 'Identifies company, model type, and time horizon'],
                ['Builds assumptions', 'Sets growth, margins, discount rate, and structure'],
                ['Produces outputs', 'Returns forecast tables, valuation, and scenario context'],
                ['Exports the file', 'Packages everything into a downloadable workbook'],
              ].map(([label, value], index) => (
                <div key={label} className="flex items-center justify-between px-5 py-4">
                  <div className="max-w-[78%]">
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--cb-text-muted)]">{value}</p>
                  </div>
                  <div className="text-sm font-semibold text-white/45">0{index + 1}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-[24px] bg-[linear-gradient(135deg,rgba(0,227,135,0.12),rgba(0,227,135,0.04),rgba(255,255,255,0.01))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cb-green)]/80">Core promise</p>
              <p className="mt-2 text-sm leading-6 text-white/82">
                One prompt gives the analyst a company-specific model package that can be opened, reviewed, and refined in Excel.
              </p>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'events',
    label: 'Workflow 02',
    title: 'Headlines and events',
    badge: 'Market context',
    content: (
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="overflow-hidden rounded-[22px] border border-white/8 bg-[#0d1117]">
          <div
            className="relative h-44 overflow-hidden border-b border-white/8 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=80')",
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,9,14,0.08),rgba(5,9,14,0.68)_72%,rgba(5,9,14,0.9))]" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/75 backdrop-blur">
                Example event
              </div>
            </div>
          </div>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-white">Hyperscalers signal slower AI capacity additions after a year of elevated infrastructure spend</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--cb-text-secondary)]">
              CapitalBase converts the headline into a market view where near-term digestion risk for AI infrastructure competes with a healthier read on capex discipline and margins.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Newspaper className="h-4 w-4 text-[var(--cb-green)]" />
              Potential impact
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--cb-text-secondary)]">
              <p>Event - hyperscalers guide to a more selective AI infrastructure buildout after a year of aggressive ordering.</p>
              <p>Economic effect - could pressure near-term server, networking, and foundry demand, but may also ease fears of overinvestment and support future returns on capital.</p>
              <p>Market reaction - negative for the most crowded AI capacity beneficiaries in the near term, but potentially constructive for software and internet names if spend normalizes without collapsing demand.</p>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ArrowRight className="h-4 w-4 text-[var(--cb-green)]" />
              Tickers to watch
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['NVDA', 'AVGO', 'MSFT', 'AMZN', 'META'].map((ticker) => (
                <span key={ticker} className="rounded-full border border-white/8 bg-[#0d1117] px-3 py-1.5 text-sm text-white">
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'templates',
    label: 'Workflow 03',
    title: 'Template library',
    badge: 'Model templates',
    content: (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['DCF Model', 'Cash flow valuation wizard'],
            ['Reverse DCF', 'Implied expectations analysis'],
            ['Revenue Forecast', 'Driver-based topline planning'],
            ['Comparable Analysis', 'Trading comps workflow'],
            ['Operating Model', 'Linked statement planning'],
            ['Private Company Inputs', 'Manual financial entry'],
          ].map(([title, subtitle]) => (
            <div key={title} className="rounded-[22px] border border-white/8 bg-[#0d1117] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03]">
                <FileSpreadsheet className="h-5 w-5 text-[var(--cb-green)]" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--cb-text-secondary)]">{subtitle}</p>
            </div>
          ))}
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-6 text-[var(--cb-text-secondary)]">
          Templates stay editable after generation, so analysts can adjust assumptions, add private company inputs, and refine the workbook without starting over.
        </div>
      </div>
    ),
  },
] as const;

export function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const step = useMemo(() => STEPS[index], [index]);

  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(0,227,135,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(31,91,255,0.16),transparent_36%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,17,23,0.98),rgba(8,11,15,0.98))] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl xl:p-6">
        <div className="flex items-center justify-between border-b border-white/8 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--cb-text-muted)]">Analyst Workspace</p>
            <h3 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.03em] text-white">{step.title}</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/8 bg-white/[0.035] px-4 py-1.5 text-xs text-[var(--cb-text-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              {step.badge}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIndex((current) => (current - 1 + STEPS.length) % STEPS.length)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.035] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:bg-white/[0.07]"
                aria-label="Previous preview"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((current) => (current + 1) % STEPS.length)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.035] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:bg-white/[0.07]"
                aria-label="Next preview"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">{step.content}</div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">{step.label}</div>
          <div className="flex gap-2">
            {STEPS.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  'h-2.5 rounded-full transition-all',
                  itemIndex === index ? 'w-8 bg-[var(--cb-green)]' : 'w-2.5 bg-white/20 hover:bg-white/35'
                )}
                aria-label={`Go to ${item.title}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
