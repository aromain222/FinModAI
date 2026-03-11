import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  BarChart3,
  Download,
  FileSpreadsheet,
  Landmark,
  Newspaper,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { WaitlistForm } from '@/components/MarketingLanding';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/branding';
import { getSubdomainHref } from '@/lib/subdomains';

export const metadata: Metadata = {
  title: `${APP_NAME} | Financial Modeling Infrastructure for Investors`,
  description:
    'CapitalBase automatically generates financial models, surfaces market intelligence, and produces analyst-ready outputs for investors.',
};

const TRUST_CATEGORIES = [
  'Venture Capital',
  'Investment Banking',
  'Hedge Funds',
  'Equity Research',
];

const MODEL_POINTS = [
  'Revenue projections',
  'EBITDA forecasts',
  'Valuation outputs',
  'Financial charts',
];

const TEMPLATE_CARDS = [
  {
    title: 'DCF Model',
    detail: 'Forecast, discount, and export a linked valuation model.',
  },
  {
    title: 'Comparable Company Analysis',
    detail: 'Build clean peer sets, multiples, and valuation ranges.',
  },
  {
    title: 'LBO Model',
    detail: 'Structure leverage, returns, and sponsor case assumptions.',
  },
  {
    title: 'Reverse DCF',
    detail: 'Back into the growth and margin profile implied by price.',
  },
  {
    title: 'Revenue Forecast Model',
    detail: 'Build topline scenarios with flexible driver assumptions.',
  },
];

const INTELLIGENCE_ITEMS = [
  {
    title: 'Macro / Rates',
    headline: 'Fed messaging keeps duration sensitive sectors on watch',
    summary:
      'CapitalBase turns policy headlines into transmission paths across equities, rates, FX, and sector leadership.',
  },
  {
    title: 'M&A Activity',
    headline: 'Infrastructure software multiples stay firm in selective buyout tape',
    summary:
      'Deal flow is grouped into what matters for sponsors, bankers, and public comps instead of raw headline volume.',
  },
  {
    title: 'Capital Markets',
    headline: 'Follow-on issuance reopens for quality growth names',
    summary:
      'Analyst-ready summaries connect issuance windows, valuation implications, and peer read-through in one view.',
  },
];

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
    <div className="max-w-3xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--cb-green)]/85">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-8 text-[var(--cb-text-secondary)]">{body}</p>
    </div>
  );
}

function HeroFragments() {
  return (
    <div className="relative mx-auto w-full max-w-[42rem]">
      <div className="absolute inset-0 rounded-[42px] bg-[radial-gradient(circle_at_20%_20%,rgba(61,112,255,0.22),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(0,227,135,0.16),transparent_24%),radial-gradient(circle_at_55%_88%,rgba(255,255,255,0.08),transparent_20%)] blur-3xl" />
      <div className="relative min-h-[32rem] rounded-[42px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,18,24,0.94),rgba(7,10,15,0.98))] shadow-[0_50px_140px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div className="absolute left-7 top-8 w-[48%] rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Revenue forecast</p>
            <TrendingUp className="h-4 w-4 text-[var(--cb-green)]" />
          </div>
          <div className="mt-4 overflow-hidden rounded-[18px] border border-white/6 bg-[#070b10]">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] border-b border-white/6 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
              <span>Driver</span>
              <span>2026E</span>
              <span>2027E</span>
              <span>2028E</span>
            </div>
            {[
              ['Revenue', '$8.4B', '$9.8B', '$11.3B'],
              ['Growth', '18%', '16%', '14%'],
              ['EBITDA', '$2.0B', '$2.5B', '$3.0B'],
            ].map((row) => (
              <div
                key={row[0]}
                className="grid grid-cols-[1.2fr_1fr_1fr_1fr] px-4 py-3 text-sm text-white/85 odd:bg-white/[0.02]"
              >
                <span>{row[0]}</span>
                <span>{row[1]}</span>
                <span>{row[2]}</span>
                <span>{row[3]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute right-8 top-10 w-[36%] rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Valuation summary</p>
          <div className="mt-4 grid gap-3">
            {[
              ['Enterprise value', '$1,174B'],
              ['Equity value', '$1,224B'],
              ['Implied price', '$50.36'],
            ].map(([label, value], index) => (
              <div
                key={label}
                className={`rounded-[18px] px-4 py-4 ${
                  index === 2
                    ? 'bg-[linear-gradient(135deg,rgba(0,227,135,0.14),rgba(0,227,135,0.04))]'
                    : 'bg-white/[0.03]'
                }`}
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">{label}</p>
                <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute left-[14%] top-[48%] w-[44%] rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,26,0.96),rgba(8,11,15,0.96))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Financial chart</p>
              <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Revenue and FCFF direction</p>
            </div>
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/60">
              Base case
            </span>
          </div>
          <div className="mt-5 grid h-36 grid-cols-5 items-end gap-3">
            {[34, 51, 63, 78, 92].map((value, index) => (
              <div key={`${value}-${index}`} className="flex h-full flex-col items-center justify-end gap-2">
                <div
                  className="w-full rounded-t-[16px] bg-[linear-gradient(180deg,#7aa3ff_0%,#3b73ff_60%,rgba(59,115,255,0.22)_100%)] shadow-[0_14px_24px_rgba(59,115,255,0.16)]"
                  style={{ height: `${value}%` }}
                />
                <span className="text-[10px] text-[var(--cb-text-muted)]">{2027 + index}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 right-10 w-[34%] rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Assumptions</p>
            <Sparkles className="h-4 w-4 text-[var(--cb-green)]" />
          </div>
          <div className="mt-4 space-y-3">
            {[
              ['Revenue growth', '14% -> 6%'],
              ['EBIT margin', '34%'],
              ['WACC', '9.0%'],
              ['Terminal growth', '2.5%'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-[16px] bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-[var(--cb-text-secondary)]">{label}</span>
                <span className="text-sm font-semibold text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketingPage() {
  const waitlistHref = getSubdomainHref('waitlist');
  const demoHref = getSubdomainHref('demo');

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#06080c] text-[var(--cb-text-body)]">
      <div className="absolute inset-x-0 top-0 h-[780px] bg-[radial-gradient(circle_at_top,rgba(31,91,255,0.18),transparent_34%),radial-gradient(circle_at_18%_16%,rgba(0,227,135,0.12),transparent_24%),linear-gradient(180deg,#06080c_0%,#091018_38%,#06080c_100%)]" />

      <section className="relative px-6 pb-24 pt-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between gap-6">
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-white/70">{APP_NAME}</p>
            <div className="flex items-center gap-3">
              <Button
                asChild
                variant="outline"
                className="rounded-full border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.06]"
              >
                <Link href={waitlistHref}>Waitlist</Link>
              </Button>
              <Button asChild variant="default" className="hidden rounded-full px-5 sm:inline-flex">
                <Link href={demoHref}>Demo Access</Link>
              </Button>
            </div>
          </div>

          <div className="mt-20 grid gap-16 xl:grid-cols-[0.88fr_1.12fr] xl:items-center">
            <div className="max-w-[35rem]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--cb-green)]/85">
                Financial modeling infrastructure for investors
              </p>

              <h1 className="mt-6 text-5xl font-semibold tracking-[-0.07em] text-white sm:text-[4.7rem] sm:leading-[0.94]">
                Financial modeling infrastructure for investors.
              </h1>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.06em] text-white/92 sm:text-[3.6rem] sm:leading-[0.96]">
                Build a full financial model in seconds.
              </h2>

              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--cb-text-secondary)]">
                CapitalBase automatically generates financial models, surfaces market intelligence, and produces analyst-ready outputs.
              </p>

              <div className="mt-10 flex flex-col items-start gap-4">
                <Button asChild className="rounded-full px-6 py-6 text-base">
                  <Link href={waitlistHref}>
                    Join the Waitlist
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-sm text-[var(--cb-text-muted)]">
                  Waitlist members receive early demo access.
                </p>
              </div>

              <div className="mt-8 max-w-[42rem]">
                <WaitlistForm
                  idPrefix="hero-waitlist"
                  buttonText="Join the Waitlist"
                  helperText="Waitlist members receive early demo access."
                  layout="inline"
                  showLabels={false}
                  className="max-w-[42rem] rounded-[30px] border-white/8 bg-[linear-gradient(180deg,rgba(15,20,26,0.88),rgba(8,11,15,0.92))]"
                />
              </div>
            </div>

            <HeroFragments />
          </div>
        </div>
      </section>

      <section className="relative border-y border-white/6 px-6 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--cb-green)]/85">
                Trust
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white">
                Built for modern investors and analysts.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST_CATEGORIES.map((item) => (
                <div
                  key={item}
                  className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,20,26,0.72),rgba(8,11,15,0.9))] px-5 py-4 text-sm font-medium text-white/80"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-14 xl:grid-cols-[0.88fr_1.12fr] xl:items-start">
            <SectionHeader
              eyebrow="Automated Financial Models"
              title="Structured financial models, generated automatically."
              body="CapitalBase builds clean model frameworks with revenue projections, EBITDA forecasts, valuation outputs, and supporting charts. Assumptions stay fully customizable, so analysts can adjust growth rates, margins, discount rates, and projections without rebuilding the work."
            />

            <div className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,18,24,0.95),rgba(8,11,15,0.96))] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.3)]">
              <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[24px] border border-white/6 bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">Model outputs</p>
                    <FileSpreadsheet className="h-4 w-4 text-[var(--cb-green)]" />
                  </div>
                  <div className="mt-5 space-y-3">
                    {[
                      ['Revenue', '$8.4B -> $11.3B'],
                      ['EBITDA', '$2.0B -> $3.0B'],
                      ['Equity value', '$1,224B'],
                      ['Implied price', '$50.36'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between rounded-[16px] bg-[#070b10] px-4 py-3">
                        <span className="text-sm text-[var(--cb-text-secondary)]">{label}</span>
                        <span className="text-sm font-semibold text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/6 bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">Forecast chart</p>
                    <BarChart3 className="h-4 w-4 text-[#7aa3ff]" />
                  </div>
                  <div className="mt-5 grid h-40 grid-cols-6 items-end gap-3">
                    {[32, 46, 58, 72, 85, 92].map((value, index) => (
                      <div key={`${value}-${index}`} className="flex h-full flex-col items-center justify-end gap-2">
                        <div
                          className="w-full rounded-t-[14px] bg-[linear-gradient(180deg,#84a8ff_0%,#3b73ff_60%,rgba(59,115,255,0.24)_100%)]"
                          style={{ height: `${value}%` }}
                        />
                        <span className="text-[10px] text-[var(--cb-text-muted)]">{2026 + index}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {MODEL_POINTS.map((point) => (
                  <div
                    key={point}
                    className="rounded-[18px] border border-white/6 bg-white/[0.02] px-4 py-4 text-sm text-white/85"
                  >
                    {point}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/6 px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-14 xl:grid-cols-[0.84fr_1.16fr] xl:items-start">
            <SectionHeader
              eyebrow="Template Wizards"
              title="Flexible templates for public and private company workflows."
              body="CapitalBase includes finance-native template wizards that stay adjustable after generation. Analysts can work with public company data or manually enter private company financial inputs when market data is unavailable."
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {TEMPLATE_CARDS.map((card, index) => (
                <div
                  key={card.title}
                  className={`rounded-[28px] border p-6 ${
                    index === 0
                      ? 'border-[var(--cb-green)]/20 bg-[linear-gradient(180deg,rgba(0,227,135,0.08),rgba(10,13,18,0.95))]'
                      : 'border-white/8 bg-[linear-gradient(180deg,rgba(13,18,24,0.94),rgba(8,11,15,0.94))]'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Template</p>
                  <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-white">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--cb-text-secondary)]">{card.detail}</p>

                  <div className="mt-5 rounded-[20px] border border-white/6 bg-[#070b10] p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cb-text-muted)]">Wizard inputs</p>
                    <div className="mt-3 space-y-2">
                      {['Company / scenario', 'Assumptions', 'Outputs'].map((item) => (
                        <div key={item} className="rounded-[14px] bg-white/[0.03] px-3 py-2 text-sm text-white/80">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/6 px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-14 xl:grid-cols-[0.82fr_1.18fr] xl:items-start">
            <SectionHeader
              eyebrow="Market Intelligence"
              title="A cleaner view of the developments that matter."
              body="CapitalBase surfaces macro events, market headlines, M&A activity, capital markets updates, and industry insights in a finance-ready format. Analysts get the summary and the implication without reading dozens of sources."
            />

            <div className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,18,24,0.95),rgba(8,11,15,0.96))] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.28)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Intelligence feed</p>
                  <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Headlines translated into analyst context</p>
                </div>
                <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/60">
                  Live categories
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {INTELLIGENCE_ITEMS.map((item, index) => (
                  <div
                    key={item.headline}
                    className="grid gap-4 rounded-[24px] border border-white/6 bg-white/[0.02] p-4 md:grid-cols-[0.26fr_1fr]"
                  >
                    <div className="rounded-[20px] bg-[linear-gradient(135deg,rgba(61,112,255,0.18),rgba(0,227,135,0.12),rgba(255,255,255,0.04))] p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">{item.title}</p>
                      <div className="mt-10 flex items-center gap-2 text-sm text-white/70">
                        {index === 0 ? <Landmark className="h-4 w-4" /> : index === 1 ? <TrendingUp className="h-4 w-4" /> : <Newspaper className="h-4 w-4" />}
                        Market signal
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold tracking-[-0.03em] text-white">{item.headline}</h3>
                      <p className="mt-3 text-sm leading-7 text-[var(--cb-text-secondary)]">{item.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/6 px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--cb-green)]/85">
            Early Access
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
            Build better financial models.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[var(--cb-text-secondary)]">
            Join the waitlist to receive early demo access.
          </p>

          <div className="mx-auto mt-10 max-w-3xl">
            <WaitlistForm
              idPrefix="footer-waitlist"
              buttonText="Join the Waitlist"
              helperText="Join the waitlist to receive early demo access."
              layout="inline"
              showLabels={false}
              className="rounded-[30px] border-white/8 bg-[linear-gradient(180deg,rgba(15,20,26,0.88),rgba(8,11,15,0.92))]"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
