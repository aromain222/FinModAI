/**
 * Marketing landing (/) – investor-ready, institutional.
 */

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const FEATURES = [
  {
    title: 'Market Command Center',
    body: 'Zero-scroll situational awareness. News, context, and movers in one place.',
  },
  {
    title: 'Scenario Engine',
    body: 'Macro-to-name impact. Stress assumptions and see valuation and KPI deltas instantly.',
  },
  {
    title: 'Automated Models',
    body: 'DCF, comps, and outputs formatted for investors. No manual rebuilds.',
  },
];

const STEPS = [
  { step: 1, title: 'Request access', body: 'Join the waitlist for early access.' },
  { step: 2, title: 'Get oriented', body: 'Walk through the command center and scenario tools.' },
  { step: 3, title: 'Run your process', body: 'Plug in your tickers and macro views.' },
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-[#080b0f] text-[var(--cb-text-body)]">
      {/* Hero – full viewport with gradient and soft glow */}
      <section className="relative flex min-h-[100vh] flex-col items-center justify-center overflow-hidden px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-[#080b0f] via-[#0b0e13] to-[#080b0f]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,227,135,0.08),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1b2028_1px,transparent_1px),linear-gradient(to_bottom,#1b2028_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_70%,transparent_110%)]" />
        <div className="relative z-10 mx-auto w-full max-w-6xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--cb-green)]/90">
            CapitalBase
          </p>
          <h1 className="mt-8 text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl lg:leading-[1.1]">
            Institutional Market Intelligence, Built for Speed.
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[var(--cb-text-muted)] sm:text-xl">
            News → context → movers, plus automated financial models and scenario analysis.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="rounded-lg px-8 shadow-[0_0_24px_rgba(0,227,135,0.25)] transition hover:shadow-[0_0_32px_rgba(0,227,135,0.35)]">
              <Link href="/demo">Demo</Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="rounded-lg border-[var(--cb-border-subtle)] bg-white/5 px-8 backdrop-blur-sm hover:bg-white/10 hover:border-[var(--cb-green)]/30">
              <Link href="/waitlist">Join waitlist</Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="rounded-lg border-[var(--cb-border-subtle)] bg-white/5 px-8 backdrop-blur-sm hover:bg-white/10 hover:border-[var(--cb-green)]/30">
              <Link href="/login">View Platform</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="relative border-t border-white/5 bg-[#0b0e13] px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                className="group border-white/10 bg-white/[0.02] transition-all duration-300 hover:border-[var(--cb-green)]/20 hover:bg-white/[0.04] hover:shadow-[0_0_40px_-12px_rgba(0,227,135,0.15)]"
              >
                <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--cb-green)]/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <CardHeader>
                  <CardTitle className="text-lg font-medium tracking-tight text-white">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-[var(--cb-text-muted)]">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative border-t border-white/5 px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            How it works
          </h2>
          <div className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((s) => (
              <div key={s.step} className="text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--cb-green)]/40 bg-[var(--cb-green)]/5 text-sm font-medium text-[var(--cb-green)] shadow-[0_0_20px_rgba(0,227,135,0.1)]">
                  {s.step}
                </span>
                <h3 className="mt-6 font-medium text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--cb-text-muted)]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </main>
  );
}
