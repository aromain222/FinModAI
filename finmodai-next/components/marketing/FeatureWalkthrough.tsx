'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CandlestickChart,
  ChevronRight,
  Newspaper,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Slide = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  cta: string;
  render: () => React.ReactNode;
};

function WorkflowSlide() {
  const steps = [
    { label: 'Prompt', detail: 'Describe the company or workflow you want.', icon: Bot },
    { label: 'Model', detail: 'CapitalBase builds the structure and assumptions.', icon: WandSparkles },
    { label: 'Insight', detail: 'Review outputs, risks, and investment implications.', icon: Sparkles },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,16,22,0.94),rgba(8,11,15,0.94))] p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--cb-green)]/85">Automated workflow</p>
        <div className="mt-5 space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--cb-green)]/20 bg-[var(--cb-green)]/8 text-[var(--cb-green)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-white">{step.label}</p>
                      <span className="text-[11px] uppercase tracking-[0.2em] text-white/45">0{index + 1}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[var(--cb-text-secondary)]">{step.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,17,23,0.96),rgba(8,11,15,0.96))] p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">Workflow output</p>
          <span className="text-xs text-[var(--cb-text-muted)]">Prompt → model → memo</span>
        </div>
        <div className="mt-4 rounded-[20px] border border-white/8 bg-[#0c1015] p-4">
          <div className="rounded-2xl border border-[var(--cb-green)]/25 bg-[#091218] px-4 py-3 text-sm text-white">
            &ldquo;Build a 5-year DCF for Snowflake and show me the valuation sensitivity.&rdquo;
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ['Enterprise value', '$54.2B'],
              ['Base case / share', '$191'],
              ['Terminal mix', '64%'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{label}</p>
                <p className="mt-2 text-lg font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--cb-text-muted)]">
              <span>Generated memo</span>
              <span>Analyst summary</span>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--cb-text-secondary)]">
              CapitalBase frames the valuation, key assumptions, and what would change the thesis, so the output reads like an analyst workflow instead of a raw spreadsheet export.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventsSlide() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,17,23,0.96),rgba(8,11,15,0.96))]">
        <div className="relative h-52 border-b border-white/8 bg-[radial-gradient(circle_at_20%_20%,rgba(0,227,135,0.2),transparent_22%),radial-gradient(circle_at_80%_30%,rgba(31,91,255,0.22),transparent_26%),linear-gradient(135deg,#0b1721_0%,#101a28_45%,#080c12_100%)]">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px] opacity-30" />
          <div className="absolute left-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-black/20 text-white backdrop-blur">
            <Newspaper className="h-5 w-5" />
          </div>
          <div className="absolute bottom-5 left-5 right-5">
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/65">Example headline</p>
            <h3 className="mt-2 max-w-xl text-2xl font-semibold leading-tight text-white">
              Sticky services inflation pushes yields higher as Fed cut expectations reprice
            </h3>
          </div>
        </div>
        <div className="p-5">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.02] p-4">
            <p className="text-sm font-medium text-white">Potential impact</p>
            <p className="mt-3 text-sm leading-7 text-[var(--cb-text-secondary)]">
              Higher-for-longer rate pricing would pressure long-duration growth, keep the dollar firm, and tighten financing conditions for rate-sensitive sectors.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Affected tickers</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ['TLT', 'down'],
                  ['QQQ', 'mixed'],
                  ['KRE', 'down'],
                  ['XLF', 'mixed'],
                ].map(([ticker, direction]) => (
                  <div key={ticker} className="rounded-full border border-white/10 bg-[#0d1117] px-3 py-2 text-xs text-white">
                    {ticker} <span className="text-white/45">• {direction}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Transmission</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--cb-text-secondary)]">
                <li>Inflation surprise → fewer cuts priced</li>
                <li>Yields higher → duration assets reprice</li>
                <li>Dollar firmer → tighter financial conditions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,16,22,0.94),rgba(8,11,15,0.94))] p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">CapitalBase analysis card</p>
          <CandlestickChart className="h-4 w-4 text-[var(--cb-green)]" />
        </div>
        <div className="mt-4 space-y-3">
          {[
            ['SUMMARY', 'Rates move first, then duration-heavy equities and credit sensitivity follow.'],
            ['DRIVERS', 'Services inflation stayed sticky enough to delay the easing path.'],
            ['MARKET IMPACT', 'Rates, FX, and growth sectors matter more here than broad macro headlines.'],
            ['WATCH NEXT', 'Next CPI print, Fed speakers, and front-end yield reaction.'],
          ].map(([label, text]) => (
            <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--cb-green)]/75">{label}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--cb-text-secondary)]">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplatesSlide() {
  const templates = [
    ['DCF', 'Valuation wizard', 'Forecast -> FCFF -> value'],
    ['Comps', 'Relative valuation', 'Peer set -> multiples -> range'],
    ['LBO', 'Sponsor returns', 'Debt -> exit -> IRR'],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,16,22,0.94),rgba(8,11,15,0.94))] p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--cb-green)]/85">Template wizard</p>
        <div className="mt-5 space-y-3">
          {[
            ['Choose model', 'DCF selected'],
            ['Enter assumptions', 'Forecast years, margins, WACC'],
            ['Generate workbook', 'Linked model + outputs'],
          ].map(([label, value], index) => (
            <div key={label} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="mt-1 text-sm text-[var(--cb-text-secondary)]">{value}</p>
              </div>
              <span className="text-[11px] uppercase tracking-[0.22em] text-white/45">0{index + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {templates.map(([title, subtitle, detail]) => (
          <div key={title} className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,17,23,0.96),rgba(8,11,15,0.96))] p-5">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[var(--cb-green)]">
              <BriefcaseBusiness className="h-4 w-4" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm text-[var(--cb-text-secondary)]">{subtitle}</p>
            <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <p className="text-sm leading-6 text-[var(--cb-text-secondary)]">{detail}</p>
              <div className="mt-4 inline-flex items-center gap-2 text-sm text-white">
                Open wizard <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeatureWalkthrough() {
  const slides = useMemo<Slide[]>(
    () => [
      {
        id: 'workflow',
        kicker: '01 • Automate the workflow',
        title: 'Start with the analyst workflow',
        body: 'Visitors should understand the core loop first: prompt the analyst, generate the model, then turn outputs into a structured investment view.',
        cta: 'Next: headlines and events',
        render: () => <WorkflowSlide />,
      },
      {
        id: 'events',
        kicker: '02 • Headlines and events',
        title: 'Then show the event and headline layer',
        body: 'Use a concrete example so the product feels real. CapitalBase should show the headline, explain potential impact, and highlight which tickers and sectors are exposed.',
        cta: 'Next: model templates',
        render: () => <EventsSlide />,
      },
      {
        id: 'templates',
        kicker: '03 • Model templates',
        title: 'Then bring users back to model generation',
        body: 'Once the market context is clear, the site should lead visitors back into the modeling workflows that convert interest into a demo request.',
        cta: 'Back to workflow',
        render: () => <TemplatesSlide />,
      },
    ],
    []
  );

  const [index, setIndex] = useState(0);
  const slide = slides[index];

  const move = (direction: 1 | -1) => {
    setIndex((current) => (current + direction + slides.length) % slides.length);
  };

  return (
    <div className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,18,24,0.96),rgba(8,11,15,0.96))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:p-8">
      <div className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--cb-green)]/85">{slide.kicker}</p>
          <h3 className="text-3xl font-semibold tracking-tight text-white">{slide.title}</h3>
          <p className="text-base leading-7 text-[var(--cb-text-secondary)]">{slide.body}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {slides.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.title}`}
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  'h-2.5 rounded-full transition-all',
                  itemIndex === index ? 'w-10 bg-[var(--cb-green)]' : 'w-2.5 bg-white/20 hover:bg-white/35'
                )}
              />
            ))}
          </div>
          <Button type="button" variant="outline" size="icon" className="rounded-full border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.06]" onClick={() => move(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="rounded-full border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.06]" onClick={() => move(1)}>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-6">{slide.render()}</div>

      <div className="mt-6 flex items-center justify-between gap-4 rounded-[24px] border border-white/8 bg-white/[0.02] px-4 py-4 text-sm">
        <span className="text-[var(--cb-text-secondary)]">{slide.cta}</span>
        <Button type="button" variant="ghost" className="rounded-full text-white hover:bg-white/[0.05]" onClick={() => move(1)}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
