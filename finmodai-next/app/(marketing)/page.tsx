import Link from 'next/link';
import type { Metadata } from 'next';
import {
  BriefcaseBusiness,
  CandlestickChart,
  ChartColumnBig,
  ChartSpline,
  Database,
  Globe,
  Landmark,
  Layers3,
  Newspaper,
  Radar,
} from 'lucide-react';
import { WaitlistForm } from '@/components/MarketingLanding';
import { FeatureWalkthrough } from '@/components/marketing/FeatureWalkthrough';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/branding';
import { getSubdomainHref } from '@/lib/subdomains';

export const metadata: Metadata = {
  title: `${APP_NAME} | AI Financial Analysis and Modeling`,
  description:
    'CapitalBase is an AI-powered analyst that generates financial models, surfaces market intelligence, and automates investment research.',
};

const FEATURE_HIGHLIGHTS = [
  {
    title: 'Financial modeling',
    body: 'Generate DCFs, operating models, and valuation outputs with editable assumptions and linked workbook logic.',
  },
  {
    title: 'Market intelligence',
    body: 'Surface macro events, headlines, M&A activity, and capital markets updates in one analyst-facing feed.',
  },
  {
    title: 'Research workflow',
    body: 'Move from new information to a structured investment view without rebuilding context across separate tools.',
  },
];

const TEMPLATE_CARDS = [
  { title: 'DCF Model', subtitle: 'Cash flow valuation wizard', icon: Landmark },
  { title: 'Comparable Company Analysis', subtitle: 'Trading comps workflow', icon: Layers3 },
  { title: 'LBO Model', subtitle: 'Debt and sponsor returns build', icon: BriefcaseBusiness },
  { title: 'Reverse DCF', subtitle: 'Implied expectations analysis', icon: Radar },
  { title: 'Revenue Forecast Model', subtitle: 'Driver-based topline planning', icon: ChartSpline },
];

const MARKET_FEED = [
  {
    title: 'Macro Events',
    summary: 'Central bank repricing, inflation surprises, and geopolitical catalysts surfaced with a clear market transmission view.',
    icon: Globe,
    accent: 'from-[#1f5bff]/30 to-transparent',
  },
  {
    title: 'Market Headlines',
    summary: 'AI-generated event summaries explain why a headline matters for rates, equities, FX, and credit.',
    icon: Newspaper,
    accent: 'from-[#00e387]/25 to-transparent',
  },
  {
    title: 'M&A Activity',
    summary: 'Strategic takeouts, sponsor deals, and financing updates organized into an interpretable intelligence stream.',
    icon: BriefcaseBusiness,
    accent: 'from-[#ffb347]/20 to-transparent',
  },
  {
    title: 'Capital Markets Updates',
    summary: 'Follow-ons, converts, refinancings, and liability management mapped into financing conditions and sector implications.',
    icon: CandlestickChart,
    accent: 'from-[#d66bff]/18 to-transparent',
  },
  {
    title: 'Industry Trends',
    summary: 'Sector-level demand, pricing, capex, and competitive shifts distilled into actionable analyst context.',
    icon: Database,
    accent: 'from-[#54d2ff]/18 to-transparent',
  },
];

function ProductPreview() {
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(0,227,135,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(31,91,255,0.16),transparent_36%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,24,0.96),rgba(8,11,15,0.96))] p-4 shadow-[0_36px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl xl:p-5">
        <div className="flex items-center justify-between border-b border-white/8 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--cb-green)]/90">Analyst Workspace</p>
            <h3 className="mt-2 text-base font-semibold text-white xl:text-lg">Prompt-to-model interface</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-[var(--cb-text-muted)]">
            Live model preview
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--cb-text-muted)]">Prompt</p>
          <div className="mt-3 rounded-2xl border border-[var(--cb-green)]/30 bg-[#0c1318] px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            Build a DCF model for NVIDIA with a 10-year forecast.
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.22fr_0.86fr]">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
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
                    <p className="mt-2 text-lg font-semibold text-white xl:text-xl">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white/8 bg-[#0d1117] p-4">
                <div className="flex items-end justify-between text-xs text-[var(--cb-text-muted)]">
                  <span>Revenue forecast</span>
                  <span>FCFF trend</span>
                </div>
                <div className="mt-4 grid h-36 grid-cols-6 items-end gap-2 xl:h-40">
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
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Assumptions</p>
                <ChartColumnBig className="h-4 w-4 text-[var(--cb-green)]" />
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
            <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,14,19,0.95),rgba(10,14,19,0.8))] p-4">
              <p className="text-sm font-medium text-white">Scenario intelligence</p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--cb-text-secondary)]">
                <p>Base case assumes AI infrastructure spend normalizes into a durable large-cap growth profile.</p>
                <p>Bear case compresses terminal assumptions and lowers operating leverage.</p>
                <p>Bull case sustains elevated margins and a stronger long-run demand curve.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--cb-green)]/90">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="text-base leading-7 text-[var(--cb-text-secondary)]">{body}</p>
    </div>
  );
}

export default function MarketingPage() {
  const waitlistHref = getSubdomainHref('waitlist');
  const demoHref = getSubdomainHref('demo');

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#06080c] text-[var(--cb-text-body)]">
      <div className="absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(circle_at_top,rgba(31,91,255,0.18),transparent_32%),radial-gradient(circle_at_25%_20%,rgba(0,227,135,0.14),transparent_26%),linear-gradient(180deg,#06080c_0%,#090d12_40%,#06080c_100%)]" />

      <section className="relative border-b border-white/6 px-6 pb-20 pt-10 sm:px-8 sm:pt-12 lg:px-12 lg:pb-24 lg:pt-14">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.45em] text-white/70">{APP_NAME}</p>
            </div>
            <div className="hidden items-center gap-6 lg:flex">
              <div className="flex items-center gap-5 text-sm text-white/55">
                <Link href="#how-it-works" className="transition hover:text-white">Workflow</Link>
                <Link href="#templates" className="transition hover:text-white">Templates</Link>
                <Link href="#intelligence" className="transition hover:text-white">Intelligence</Link>
              </div>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <Button asChild variant="outline" className="rounded-full border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.06]">
                <Link href={waitlistHref}>Waitlist</Link>
              </Button>
              <Button asChild variant="default" className="rounded-full px-5">
                <Link href={demoHref}>Demo Access</Link>
              </Button>
            </div>
          </div>

          <div className="mt-12 grid gap-10 xl:grid-cols-[0.92fr_1.08fr] xl:items-start">
            <div className="space-y-7 pt-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[var(--cb-text-secondary)] backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-[var(--cb-green)]" />
                AI analyst for modeling, market intelligence, and investment research
              </div>
              <div className="space-y-4">
                <h1 className="max-w-2xl text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl xl:text-[6rem] xl:leading-[0.94]">
                  Build a full financial model in seconds.
                </h1>
                <p className="max-w-xl text-base leading-7 text-[var(--cb-text-secondary)] sm:text-lg">
                  CapitalBase is an AI-powered analyst that generates financial models, surfaces market intelligence, and automates investment research.
                </p>
              </div>

              <div className="grid max-w-xl gap-4">
                <div className="grid gap-3 text-sm text-[var(--cb-text-muted)] sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Models</p>
                    <p className="mt-2 font-medium text-white">DCF, comps, LBO</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Intelligence</p>
                    <p className="mt-2 font-medium text-white">Macro, events, M&A</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Access</p>
                    <p className="mt-2 font-medium text-white">Private demo only</p>
                  </div>
                </div>
                <WaitlistForm
                  idPrefix="hero-waitlist"
                  buttonText="Join the Waitlist"
                  helperText="Waitlist members receive access to the CapitalBase demo."
                  layout="inline"
                  className="max-w-xl"
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 text-sm text-[var(--cb-text-muted)]">
                <span>Built for investors, finance teams, and founders</span>
                <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
                <span>Demo access is granted after approval</span>
              </div>
            </div>

            <ProductPreview />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Platform Walkthrough"
            title="Show the product in the order a visitor can understand it"
            body="Lead with the core workflow, show a concrete market example, then bring the user back to the template and model-generation layer that makes the platform actionable."
          />
          <div className="mt-14">
            <FeatureWalkthrough />
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {FEATURE_HIGHLIGHTS.map((item) => (
              <div
                key={item.title}
                className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,17,23,0.92),rgba(8,11,15,0.92))] p-5"
              >
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--cb-green)]/80">Core workflow</p>
                <h3 className="mt-3 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--cb-text-secondary)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="templates" className="relative border-t border-white/6 px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Model Template Wizards"
            title="Wizard-driven templates for common finance workflows"
            body="CapitalBase guides the user through structured inputs, then generates the underlying model automatically. Templates remain fully adjustable and can also support private companies when users enter financials manually."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            {TEMPLATE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,18,24,0.95),rgba(8,11,15,0.95))] p-5">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[var(--cb-green)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{card.title}</h3>
                  <p className="mt-2 text-sm text-[var(--cb-text-secondary)]">{card.subtitle}</p>
                  <div className="mt-5 space-y-2 rounded-[22px] border border-white/8 bg-[#0c1015] p-4 text-sm">
                    {['Select template', 'Enter assumptions', 'Generate workbook'].map((step, index) => (
                      <div key={step} className="flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2">
                        <span className="text-[var(--cb-text-secondary)]">{step}</span>
                        <span className="text-[11px] uppercase tracking-[0.2em] text-white/60">0{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="intelligence" className="relative border-t border-white/6 px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Market and Event Intelligence"
            title="A feed built for analysts, not headline overload"
            body="CapitalBase surfaces important financial events and insights automatically so analysts can stay informed without reading dozens of sources. Each item is framed through market relevance, transmission, and likely impact."
          />
          <div className="mt-14 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {MARKET_FEED.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="group overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,15,20,0.98),rgba(8,11,15,0.98))]">
                  <div className={`h-40 bg-gradient-to-br ${item.accent} relative overflow-hidden border-b border-white/8`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_35%)]" />
                    <div className="absolute left-5 top-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/14 bg-black/20 text-white backdrop-blur">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="absolute bottom-5 left-5 right-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-white/70">Live feed preview</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{item.title}</h3>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="rounded-[20px] border border-white/8 bg-white/[0.02] p-4">
                      <p className="text-sm font-medium text-white">AI-generated summary</p>
                      <p className="mt-3 text-sm leading-7 text-[var(--cb-text-secondary)]">{item.summary}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/6 px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,16,22,0.98),rgba(6,9,13,0.98))] p-8 shadow-[0_36px_120px_rgba(0,0,0,0.38)] sm:p-10 lg:p-12">
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--cb-green)]/90">Early Access</p>
              <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Get Early Access to CapitalBase
              </h2>
              <p className="max-w-xl text-lg leading-8 text-[var(--cb-text-secondary)]">
                Join the waitlist to get considered for demo access as the platform rolls out. The demo is not publicly accessible and is granted on approval.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline" className="rounded-full border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.06]">
                  <Link href={waitlistHref}>Open dedicated waitlist page</Link>
                </Button>
                <Button asChild variant="ghost" className="rounded-full text-[var(--cb-text-secondary)] hover:bg-white/[0.04]">
                  <Link href={demoHref}>Demo access route</Link>
                </Button>
              </div>
            </div>
            <WaitlistForm
              idPrefix="footer-waitlist"
              buttonText="Join the Waitlist"
              helperText="Waitlist members receive demo access as the platform rolls out."
              successText="You’re on the waitlist. We’ll contact you when demo access is approved."
              className="max-w-none"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
