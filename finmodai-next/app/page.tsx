/**
 * Marketing Homepage
 * 
 * Public landing page with hero, features, and CTAs.
 * Only shown to logged-out users.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/lib/supabaseClient';
import { BarChart3, Building2, ShieldCheck } from 'lucide-react';
import Hero from '@/app/components/Hero';
import MarketingClient from './MarketingClient';

const featureBlocks = [
  {
    icon: BarChart3,
    title: 'Full-stack models',
    body: 'DCF, LBO, comps, and three-statement workbooks rendered in Excel with banker-ready formatting.',
  },
  {
    icon: ShieldCheck,
    title: 'Data + controls',
    body: 'Polygon, FMP, and AI-assisted fills ensure every schedule balances, with audit trails for each input.',
  },
  {
    icon: Building2,
    title: 'Institutional workflows',
    body: 'Scenario engines, report exports, and model tracking built for deal teams moving at Wall Street speed.',
  },
];

export default async function MarketingPage() {
  // Check if user is authenticated - if so, redirect to app
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/app');
  }
  
  // If not authenticated, allow marketing page (users can navigate to /auth from here)

  return (
    <main className="min-h-screen text-[var(--cb-text-body)]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-16 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--cb-green)]">Why CapitalBase</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Finance infrastructure for builders, bankers, and buy-side teams.
          </h2>
          <p className="mt-3 text-sm text-[var(--cb-text-body)] sm:text-base">
            Every workbook inherits our modeling guardrails — zero placeholder rows, reconciled sources / uses,
            sensitivity tables, and clean formatting for committee decks.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {featureBlocks.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-border bg-[#12161C] p-6 shadow-panel transition hover:border-[var(--cb-green)]/30"
            >
              <feature.icon className="h-8 w-8 text-[var(--cb-green)]" />
              <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm text-[var(--cb-text-body)]">{feature.body}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-border bg-[#12161C] p-8 text-center shadow-panel sm:p-10">
          <h3 className="text-xl font-semibold text-white sm:text-2xl">Plug CapitalBase into your process.</h3>
          <p className="mt-3 text-sm text-[var(--cb-text-body)] sm:text-base">
            Generate a model in seconds, review the Excel output, and share via report links or PDFs — no onboarding
            ceremony required.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <a
              href="/auth"
              className="rounded-md bg-[var(--cb-green)] px-6 py-3 text-sm font-semibold text-slate-900 shadow-[0_0_18px_rgba(0,227,135,0.35)] transition hover:bg-[var(--cb-green)]/90"
            >
              Get started
            </a>
            <a
              href="/auth"
              className="rounded-md border border-[#2C323A] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#181d24]"
            >
              Sign in
            </a>
          </div>
        </div>
      </section>
      <MarketingClient />
    </main>
  );
}
