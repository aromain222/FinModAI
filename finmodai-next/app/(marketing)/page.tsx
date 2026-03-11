import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowDown, FileSpreadsheet, Newspaper, ShieldCheck, Sparkles } from 'lucide-react';
import { WaitlistForm } from '@/components/MarketingLanding';
import { HeroShowcase } from '@/components/marketing/HeroShowcase';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/branding';
import { getSubdomainHref } from '@/lib/subdomains';

export const metadata: Metadata = {
  title: `${APP_NAME} | AI Financial Analysis and Modeling`,
  description:
    'CapitalBase is an AI-powered analyst that generates financial models, surfaces market intelligence, and automates investment research.',
};

const BELOW_HERO_CARDS = [
  {
    title: 'Headlines and events',
    body: 'See why a market event matters, the likely transmission path, and which tickers or sectors are exposed.',
    icon: Newspaper,
  },
  {
    title: 'Template workflows',
    body: 'Move from prompt to structured DCF, operating model, reverse DCF, comps, or revenue planning in one interface.',
    icon: FileSpreadsheet,
  },
  {
    title: 'Private demo access',
    body: 'The product is gated. Waitlist members receive demo access once approved.',
    icon: ShieldCheck,
  },
];

export default function MarketingPage() {
  const waitlistHref = getSubdomainHref('waitlist');
  const demoHref = getSubdomainHref('demo');

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#06080c] text-[var(--cb-text-body)]">
      <div className="absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(circle_at_top,rgba(31,91,255,0.16),transparent_34%),radial-gradient(circle_at_24%_18%,rgba(0,227,135,0.12),transparent_24%),linear-gradient(180deg,#06080c_0%,#090d12_38%,#06080c_100%)]" />

      <section className="relative flex min-h-[100svh] items-center border-b border-white/6 px-6 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-7xl flex-col">
          <div className="flex items-center justify-between gap-6">
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-white/70">{APP_NAME}</p>
            <div className="hidden items-center gap-3 sm:flex">
              <Button asChild variant="outline" className="rounded-full border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.06]">
                <Link href={waitlistHref}>Waitlist</Link>
              </Button>
              <Button asChild variant="default" className="rounded-full px-5">
                <Link href={demoHref}>Demo Access</Link>
              </Button>
            </div>
          </div>

          <div className="mt-8 grid flex-1 gap-8 xl:grid-cols-[0.84fr_1.16fr] xl:items-center">
            <div className="max-w-[36rem] space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[var(--cb-text-secondary)] backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-[var(--cb-green)]" />
                AI analyst for modeling, headlines, and investment workflow
              </div>

              <div className="space-y-4">
                <h1 className="max-w-xl text-5xl font-semibold tracking-[-0.055em] text-white sm:text-[4rem] sm:leading-[0.92] xl:text-[4.5rem]">
                  Build a full financial model in seconds.
                </h1>
                <p className="max-w-lg text-[15px] leading-7 text-[var(--cb-text-secondary)] sm:text-[17px]">
                  CapitalBase is an AI-powered analyst that generates financial models, surfaces market intelligence, and automates investment research.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Financial models', 'DCF, reverse DCF, operating models'],
                  ['Market context', 'Headlines, events, ticker impact'],
                  ['Private access', 'Demo access after approval'],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-[22px] border border-white/8 bg-white/[0.02] px-4 py-3">
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--cb-text-muted)]">{body}</p>
                  </div>
                ))}
              </div>

              <WaitlistForm
                idPrefix="hero-waitlist"
                buttonText="Join the Waitlist"
                helperText=""
                layout="inline"
                showLabels={false}
                className="max-w-[42rem]"
              />

              <div className="flex items-center justify-between gap-4">
                <div className="inline-flex items-center gap-2 text-sm text-[var(--cb-text-muted)]">
                  <Sparkles className="h-4 w-4 text-[var(--cb-green)]" />
                  Waitlist members receive private demo access once approved.
                </div>
                <Link
                  href="#overview"
                  className="group inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm text-white/75 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                >
                  <span>See what’s inside</span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] transition group-hover:translate-y-0.5">
                    <ArrowDown className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            </div>

            <HeroShowcase />
          </div>
        </div>
      </section>

      <section id="overview" className="relative px-6 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 lg:grid-cols-3">
            {BELOW_HERO_CARDS.map(({ title, body, icon: Icon }) => (
              <div
                key={title}
                className="rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,18,24,0.94),rgba(8,11,15,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.26)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Icon className="h-5 w-5 text-[var(--cb-green)]" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--cb-text-secondary)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
