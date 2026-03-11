'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Landmark,
  Layers3,
  LineChart,
  Newspaper,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { WaitlistForm } from '@/components/MarketingLanding';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/branding';
import { getSubdomainHref } from '@/lib/subdomains';
import { cn } from '@/lib/utils';

type SlideProps = {
  index: number;
  current: number;
  total: number;
  goPrev: () => void;
  goNext: () => void;
};

function Frame({
  children,
  index,
  current,
  total,
  goPrev,
  goNext,
}: React.PropsWithChildren<SlideProps>) {
  return (
    <section className="relative flex h-screen w-screen shrink-0 items-center overflow-hidden px-6 py-8 sm:px-8 lg:px-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(31,91,255,0.16),transparent_28%),radial-gradient(circle_at_80%_24%,rgba(0,227,135,0.12),transparent_20%),linear-gradient(180deg,#06080c_0%,#081018_44%,#06080c_100%)]" />
      <div className="relative mx-auto flex h-full w-full max-w-7xl flex-col">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-white/70">{APP_NAME}</p>
          <div className="flex items-center gap-2">
            {Array.from({ length: total }).map((_, dotIndex) => (
              <span
                key={dotIndex}
                className={cn(
                  'h-2 rounded-full transition-all',
                  dotIndex === current ? 'w-8 bg-[var(--cb-green)]' : 'w-2 bg-white/20'
                )}
              />
            ))}
          </div>
        </div>

        <div className="relative mt-6 flex-1 overflow-hidden rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,16,22,0.9),rgba(7,10,15,0.94))] shadow-[0_40px_120px_rgba(0,0,0,0.34)]">
          {index > 0 ? (
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/25 p-4 text-white/85 backdrop-blur transition hover:bg-white/[0.08]"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
          ) : null}

          {index < total - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/25 p-4 text-white/85 backdrop-blur transition hover:bg-white/[0.08]"
              aria-label="Next slide"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          ) : null}

          <div className="flex h-full flex-col justify-center px-16 py-14 sm:px-20 lg:px-24">{children}</div>
        </div>
      </div>
    </section>
  );
}

function HeroSlide(props: SlideProps) {
  const waitlistHref = getSubdomainHref('waitlist');

  return (
    <Frame {...props}>
      <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="max-w-[34rem]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--cb-green)]/85">
            Financial modeling for modern investors
          </p>
          <h1 className="mt-6 text-5xl font-semibold tracking-[-0.08em] text-white sm:text-[4.8rem] sm:leading-[0.92]">
            Build a full financial model in seconds.
          </h1>
          <p className="mt-6 text-lg leading-8 text-[var(--cb-text-secondary)]">
            CapitalBase automates financial modeling, market intelligence, and investment workflows for modern investors.
          </p>
          <p className="mt-4 max-w-xl text-base leading-8 text-white/62">
            Generate financial models, monitor market developments, and accelerate investment research from a single platform.
          </p>

          <div className="mt-10 max-w-[34rem]">
            <WaitlistForm
              idPrefix="hero-waitlist"
              buttonText="Join the Waitlist"
              helperText="Waitlist members receive early demo access."
              layout="inline"
              showLabels={false}
              className="max-w-[34rem] rounded-[28px] border-white/8 bg-[linear-gradient(180deg,rgba(15,20,26,0.84),rgba(8,11,15,0.92))]"
            />
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Button asChild className="rounded-full px-6">
              <Link href={waitlistHref}>
                Join the Waitlist
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-sm text-[var(--cb-text-muted)]">Waitlist members receive early demo access.</p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[34rem]">
          <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_30%_28%,rgba(59,115,255,0.22),transparent_32%),radial-gradient(circle_at_75%_38%,rgba(0,227,135,0.14),transparent_24%)] blur-3xl" />
          <div className="relative rounded-[40px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,18,24,0.86),rgba(8,11,15,0.96))] p-6">
            <div className="rounded-[26px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">CapitalBase</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                AI-powered modeling and market context
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--cb-text-secondary)]">
                A guided workflow for investors who need structured outputs without a fragmented process.
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/6 bg-white/[0.02] p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] text-[var(--cb-green)]">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <p className="mt-4 text-base font-semibold text-white">Modeling workflows</p>
                <p className="mt-2 text-sm leading-6 text-[var(--cb-text-secondary)]">
                  Structured forecasts, valuation outputs, and reusable templates.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/6 bg-white/[0.02] p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] text-[var(--cb-green)]">
                  <Newspaper className="h-5 w-5" />
                </div>
                <p className="mt-4 text-base font-semibold text-white">Market awareness</p>
                <p className="mt-2 text-sm leading-6 text-[var(--cb-text-secondary)]">
                  Headlines, events, and deal context organized for investment workflows.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/6 bg-[#070b10] px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Guided walkthrough</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/75">
                <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Models</span>
                <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Intelligence</span>
                <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Templates</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function ModelingSlide(props: SlideProps) {
  return (
    <Frame {...props}>
      <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="max-w-[34rem]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--cb-green)]/85">
            Financial modeling infrastructure for investors
          </p>
          <h2 className="mt-6 text-5xl font-semibold tracking-[-0.07em] text-white sm:text-[4.3rem] sm:leading-[0.94]">
            Structured financial models, generated automatically.
          </h2>
          <p className="mt-6 text-lg leading-8 text-[var(--cb-text-secondary)]">
            CapitalBase automatically generates structured financial models that analysts can review, adjust, and export.
          </p>
          <div className="mt-8 space-y-3">
            {[
              'Builds full financial models automatically',
              'Produces valuation outputs',
              'Generates forecasts and assumptions',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-base text-white/82">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--cb-green)]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
          <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--cb-green)]/10 text-[var(--cb-green)]">
              <Layers3 className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-white">Model generation flow</h3>
            <div className="mt-6 space-y-3">
              {[
                'Identify company and model type',
                'Generate forecast structure',
                'Populate valuation outputs',
                'Export analyst-ready file',
              ].map((step, index) => (
                <div key={step} className="grid grid-cols-[auto_1fr] gap-3 rounded-[18px] bg-white/[0.02] px-4 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-xs font-semibold text-white/70">
                    0{index + 1}
                  </div>
                  <p className="text-sm text-white/82">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] text-[#7aa3ff]">
                  <LineChart className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Forecast outputs</p>
                  <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Revenue, EBITDA, valuation, scenarios</p>
                </div>
              </div>
              <div className="mt-6 grid h-32 grid-cols-5 items-end gap-3">
                {[36, 52, 63, 79, 91].map((value, index) => (
                  <div key={`${value}-${index}`} className="flex h-full flex-col items-center justify-end gap-2">
                    <div
                      className="w-full rounded-t-[14px] bg-[linear-gradient(180deg,#84a8ff_0%,#3b73ff_60%,rgba(59,115,255,0.22)_100%)]"
                      style={{ height: `${value}%` }}
                    />
                    <span className="text-[10px] text-[var(--cb-text-muted)]">{2027 + index}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border border-white/8 bg-white/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Valuation</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">$1.22B</p>
                <p className="mt-2 text-sm text-[var(--cb-text-secondary)]">Enterprise value summary</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-white/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Assumptions</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">Editable</p>
                <p className="mt-2 text-sm text-[var(--cb-text-secondary)]">
                  Adjust growth, margins, discount rates, and forecasts
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function IntelligenceSlide(props: SlideProps) {
  return (
    <Frame {...props}>
      <div className="grid items-center gap-12 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="max-w-[34rem]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--cb-green)]/85">
            Market intelligence
          </p>
          <h2 className="mt-6 text-5xl font-semibold tracking-[-0.07em] text-white sm:text-[4.3rem] sm:leading-[0.94]">
            Understand the market context.
          </h2>
          <p className="mt-6 text-lg leading-8 text-[var(--cb-text-secondary)]">
            CapitalBase surfaces macro events, market headlines, M&A activity, and capital markets developments so investors stay informed.
          </p>
          <p className="mt-4 text-base leading-8 text-white/62">
            The platform automatically aggregates and summarizes important financial developments into an investor-ready view.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-6">
            <p className="text-sm font-medium text-white">Feed categories</p>
            <div className="mt-5 space-y-3">
              {[
                ['Macro events', Landmark],
                ['Market headlines', Newspaper],
                ['Deal activity', TrendingUp],
                ['Industry updates', Sparkles],
              ].map(([label, Icon]) => (
                <div key={label} className="flex items-center gap-3 rounded-[18px] bg-white/[0.02] px-4 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04]">
                    <Icon className="h-4 w-4 text-[var(--cb-green)]" />
                  </div>
                  <span className="text-sm text-white/84">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {[
              {
                title: 'Macro',
                headline: 'Fed commentary keeps duration-sensitive sectors on watch',
                summary: 'CapitalBase summarizes the policy signal and frames the likely read-through for equities and rates.',
              },
              {
                title: 'Deals',
                headline: 'Selective buyout activity stays concentrated in resilient software assets',
                summary: 'Event summaries organize what matters for valuation, financing availability, and comparable transactions.',
              },
              {
                title: 'Markets',
                headline: 'Issuance window reopens for quality growth names',
                summary: 'The feed connects headlines to likely sector effects and names to watch.',
              },
            ].map((item) => (
              <div key={item.headline} className="rounded-[24px] border border-white/8 bg-white/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">{item.title}</p>
                <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">{item.headline}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--cb-text-secondary)]">{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function TemplatesSlide(props: SlideProps) {
  return (
    <Frame {...props}>
      <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="max-w-[34rem]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--cb-green)]/85">
            Model templates
          </p>
          <h2 className="mt-6 text-5xl font-semibold tracking-[-0.07em] text-white sm:text-[4.3rem] sm:leading-[0.94]">
            Structured modeling templates.
          </h2>
          <p className="mt-6 text-lg leading-8 text-[var(--cb-text-secondary)]">
            CapitalBase provides guided modeling templates that generate full financial outputs.
          </p>
          <p className="mt-4 text-base leading-8 text-white/62">
            Templates stay fully customizable and can be used for both public and private companies by adjusting assumptions and manually entering financial data.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {[
            'DCF models',
            'Comparable company analysis',
            'LBO models',
            'Revenue forecasting models',
          ].map((title, index) => (
            <div
              key={title}
              className={cn(
                'rounded-[30px] border p-6',
                index === 0
                  ? 'border-[var(--cb-green)]/20 bg-[linear-gradient(180deg,rgba(0,227,135,0.08),rgba(10,13,18,0.95))]'
                  : 'border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))]'
              )}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] text-[var(--cb-green)]">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-white">{title}</h3>
              <div className="mt-5 space-y-2">
                {['Company / scenario', 'Assumptions', 'Generated outputs'].map((item) => (
                  <div key={item} className="rounded-[16px] bg-white/[0.03] px-4 py-3 text-sm text-white/78">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

const SLIDES = [HeroSlide, ModelingSlide, IntelligenceSlide, TemplatesSlide] as const;

export function LandingSlides() {
  const [index, setIndex] = useState(0);
  const Slide = useMemo(() => SLIDES[index], [index]);

  const goPrev = () => setIndex((current) => Math.max(current - 1, 0));
  const goNext = () => setIndex((current) => Math.min(current + 1, SLIDES.length - 1));

  return (
    <main className="h-screen overflow-hidden bg-[#06080c] text-[var(--cb-text-body)]">
      <motion.div
        className="flex h-full"
        animate={{ x: `-${index * 100}vw` }}
        transition={{ type: 'spring', stiffness: 90, damping: 20, mass: 0.8 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.06}
        onDragEnd={(_, info) => {
          if (info.offset.x < -90 && index < SLIDES.length - 1) {
            goNext();
          } else if (info.offset.x > 90 && index > 0) {
            goPrev();
          }
        }}
      >
        {SLIDES.map((RenderedSlide, slideIndex) => (
          <RenderedSlide
            key={slideIndex}
            index={slideIndex}
            current={index}
            total={SLIDES.length}
            goPrev={goPrev}
            goNext={goNext}
          />
        ))}
      </motion.div>
    </main>
  );
}
