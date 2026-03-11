'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, FileSpreadsheet, Newspaper, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    id: 'workflow',
    label: 'Workflow 01',
    title: 'Prompt-to-model interface',
    badge: 'Model workflow',
    content: (
      <div className="space-y-4">
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--cb-text-muted)]">Prompt</p>
          <div className="mt-3 rounded-2xl border border-[var(--cb-green)]/30 bg-[#0c1318] px-4 py-3 text-sm text-white">
            Build a DCF model for NVIDIA with a 10-year forecast.
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">Generated outputs</p>
              <span className="text-xs text-[var(--cb-text-muted)]">10-year model</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ['Enterprise Value', '$1,174B'],
                ['Equity Value', '$1,224B'],
                ['Implied Price', '$50.36'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/8 bg-[#0d1117] p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">{label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-white/8 bg-[#0d1117] p-4">
              <div className="flex items-end justify-between text-xs text-[var(--cb-text-muted)]">
                <span>Revenue forecast</span>
                <span>FCFF trend</span>
              </div>
              <div className="mt-4 grid h-32 grid-cols-6 items-end gap-2">
                {[42, 54, 63, 74, 86, 98].map((value, index) => (
                  <div key={value} className="flex h-full flex-col items-center justify-end gap-2">
                    <div
                      className="w-full rounded-t-xl bg-[linear-gradient(180deg,rgba(31,91,255,0.95),rgba(31,91,255,0.35))]"
                      style={{ height: `${value}%` }}
                    />
                    <span className="text-[10px] text-[var(--cb-text-muted)]">{2026 + index}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">Assumptions</p>
              <Sparkles className="h-4 w-4 text-[var(--cb-green)]" />
            </div>
            <div className="mt-4 space-y-3">
              {[
                ['Revenue growth', '14% -> 6%'],
                ['EBIT margin', '34%'],
                ['WACC', '9.0%'],
                ['Terminal growth', '2.5%'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#0d1117] px-3 py-3">
                  <span className="text-sm text-[var(--cb-text-secondary)]">{label}</span>
                  <span className="text-sm font-medium text-white">{value}</span>
                </div>
              ))}
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
            <h3 className="text-lg font-semibold text-white">NVIDIA supplier capex acceleration points to AI infrastructure spend durability</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--cb-text-secondary)]">
              CapitalBase converts the headline into a market view with likely impacts on semis, networking, power, and hyperscale infrastructure names.
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
              <p>Event - supplier capex acceleration suggests demand visibility is extending beyond a near-term inventory cycle.</p>
              <p>Economic effect - supports AI server, networking, power, and memory spending expectations.</p>
              <p>Market reaction - positive read-through for infrastructure beneficiaries and upward pressure on consensus capex assumptions.</p>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ArrowRight className="h-4 w-4 text-[var(--cb-green)]" />
              Tickers to watch
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['NVDA', 'AVGO', 'SMCI', 'ANET', 'TSM'].map((ticker) => (
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
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,24,0.96),rgba(8,11,15,0.96))] p-4 shadow-[0_36px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl xl:p-5">
        <div className="flex items-center justify-between border-b border-white/8 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--cb-green)]/90">Analyst Workspace</p>
            <h3 className="mt-2 text-base font-semibold text-white xl:text-lg">{step.title}</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-[var(--cb-text-muted)]">
              {step.badge}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIndex((current) => (current - 1 + STEPS.length) % STEPS.length)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition hover:bg-white/[0.07]"
                aria-label="Previous preview"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((current) => (current + 1) % STEPS.length)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition hover:bg-white/[0.07]"
                aria-label="Next preview"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">{step.content}</div>

        <div className="mt-5 flex items-center justify-between">
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
