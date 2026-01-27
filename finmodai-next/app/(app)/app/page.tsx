/**
 * App Home Page (Logged-In Landing)
 * 
 * "Analyst Home" - the main dashboard after login.
 * No marketing copy, just app functionality.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { countModels, getRecentModels } from '@/lib/modelsRepo';
import { getModelStats, mapModelTypeToMetrics } from '@/lib/modelMetrics';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/lib/supabaseClient';
import {
  APP_DASHBOARD_TAGLINE,
  APP_DASHBOARD_TITLE,
  APP_WORKSPACE_FOOTER,
  APP_NAME,
} from '@/lib/branding';

type WorkspaceSnapshot = {
  totalModels: number;
  lastModel: { ticker: string; modelType: string; createdAt: string } | null;
  lastRunAt: string | null;
  avgRuntimeMs: number | null;
};

async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  try {
    // Get total models count
    const totalModels = await countModels();
    
    // Get most recent model
    const recentModels = await getRecentModels(1);
    const lastModel = recentModels[0] || null;
    
    // Get last run timestamp and average runtime
    let lastRunAt: string | null = null;
    let avgRuntimeMs: number | null = null;
    
    if (lastModel) {
      // Use the model's created_at as last run timestamp
      lastRunAt = lastModel.created_at;
      
      // Get runtime stats for the last model
      const metricsType = mapModelTypeToMetrics(lastModel.type);
      if (metricsType) {
        const stats = await getModelStats({
          ticker: lastModel.ticker,
          modelType: metricsType,
          maxSamples: 20, // Last 20 runs for average
        });
        
        if (stats.sampleCount > 0) {
          avgRuntimeMs = stats.avgDurationMs;
        }
      }
    } else {
      // If no models, try to get the most recent run from model_run_stats
      const supabase = createServerComponentClient<Database>({ cookies });
      const { data } = await supabase
        .from('model_run_stats')
        .select('created_at, duration_ms')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (data && data.length > 0) {
        lastRunAt = data[0].created_at;
        const durations = data
          .map((row) => (typeof row.duration_ms === 'number' ? row.duration_ms : null))
          .filter((value): value is number => typeof value === 'number' && value >= 0);
        
        if (durations.length > 0) {
          avgRuntimeMs = Math.round(
            durations.reduce((sum, value) => sum + value, 0) / durations.length
          );
        }
      }
    }
    
    return {
      totalModels,
      lastModel: lastModel
        ? {
            ticker: lastModel.ticker,
            modelType: lastModel.type,
            createdAt: lastModel.created_at,
          }
        : null,
      lastRunAt,
      avgRuntimeMs,
    };
  } catch (error) {
    console.error('[AppHomePage] Failed to fetch snapshot:', error);
    // Return safe defaults on error
    return {
      totalModels: 0,
      lastModel: null,
      lastRunAt: null,
      avgRuntimeMs: null,
    };
  }
}

export default async function AppHomePage() {
  const snapshot = await getWorkspaceSnapshot();

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            {APP_NAME} Workspace
          </p>
          <h1 className="text-3xl font-bold text-white">{APP_DASHBOARD_TITLE}</h1>
          <p className="text-base text-slate-300">
            {APP_DASHBOARD_TAGLINE}
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="cb-panel p-6">
            <h2 className="text-xl font-semibold text-white">Start a new model</h2>
            <p className="mt-2 text-sm text-slate-300">
              Spin up a new DCF, LBO, or three-statement workbook in seconds.
            </p>
            <Button asChild className="mt-4 w-full bg-emerald-600 text-white hover:bg-emerald-500">
              <Link href="/models/create">Create model</Link>
            </Button>
          </div>

          <div className="cb-panel p-6">
            <h2 className="text-xl font-semibold text-white">Workspace snapshot</h2>
            {snapshot.totalModels === 0 ? (
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p className="text-slate-400">No models yet</p>
                <Button asChild className="w-full bg-emerald-600 text-white hover:bg-emerald-500">
                  <Link href="/models/create">Create your first model</Link>
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Total models</span>
                  <span className="text-base font-semibold text-white">{snapshot.totalModels}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last ticker</span>
                  <span className="text-base font-semibold text-white">
                    {snapshot.lastModel
                      ? `${snapshot.lastModel.ticker} (${formatModelLabel(snapshot.lastModel.modelType)})`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last run</span>
                  <span className="text-base font-semibold text-white">
                    {snapshot.lastRunAt ? timeAgo(snapshot.lastRunAt) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Avg runtime</span>
                  <span className="text-base font-semibold text-white">
                    {snapshot.avgRuntimeMs ? formatDuration(snapshot.avgRuntimeMs) : '—'}
                  </span>
                </div>
                {snapshot.lastRunAt === null && (
                  <div className="text-right text-xs text-slate-400">
                    Benchmarks populate after your first successful run.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <CTABox title="Recent models" description="Jump back into the valuation packages you touched last." href="/models" />
          <CTABox title="Scenario Engine" description="Configure bull/base/bear cases with instant football fields." href="/scenario-engine" />
          <CTABox title="Macro dashboard" description="Monitor rates, indices, and headlines shaping multiples." href="/macro" />
        </section>

        <section className="cb-panel p-6 border-dashed">
          <p className="text-sm text-slate-400">{APP_WORKSPACE_FOOTER}</p>
        </section>
      </div>
    </main>
  );
}

function CTABox({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link
      href={href}
      className="cb-panel-hover p-5 transition hover:-translate-y-0.5"
    >
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
      <span className="mt-4 inline-flex items-center text-sm font-semibold text-emerald-400">
        Open →
      </span>
    </Link>
  );
}

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function formatModelLabel(type: string) {
  switch (type) {
    case 'three-statement':
      return 'Three-Statement';
    case 'dcf':
      return 'DCF';
    case 'lbo':
      return 'LBO';
    case 'comps':
      return 'Comps';
    default:
      return type;
  }
}

function formatDuration(ms: number | null | undefined) {
  if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return '—';
  const seconds = ms / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}
