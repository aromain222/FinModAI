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
import { getSupabaseServerClient } from '@/lib/supabaseClient';
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
      const metricsType = mapModelTypeToMetrics(lastModel.model_type);
      if (metricsType) {
        const stats = getModelStats();
        
        if (stats.totalModels > 0 && stats.avgGenerationTime) {
          avgRuntimeMs = stats.avgGenerationTime;
        }
      }
    } else {
      // If no models, try to get the most recent run from model_run_stats
      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { data } = await supabase
          .from('model_run_stats')
          .select('created_at, duration_ms')
          .order('created_at', { ascending: false })
          .limit(20);
        
        const rows = (data ?? []) as { created_at: string; duration_ms: number | null }[];
        if (rows.length > 0) {
          lastRunAt = rows[0].created_at;
          const durations = rows
            .map((row) => (typeof row.duration_ms === 'number' ? row.duration_ms : null))
            .filter((value): value is number => typeof value === 'number' && value >= 0);
          
          if (durations.length > 0) {
            avgRuntimeMs = Math.round(
              durations.reduce((sum, value) => sum + value, 0) / durations.length
            );
          }
        }
      }
    }
    
    return {
      totalModels,
      lastModel: lastModel
        ? {
            ticker: lastModel.ticker,
            modelType: lastModel.model_type,
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
    <main className="min-h-screen bg-cb-soft px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cb-blue">
            {APP_NAME} Workspace
          </p>
          <h1 className="text-3xl font-bold text-cb-ink">{APP_DASHBOARD_TITLE}</h1>
          <p className="text-base text-cb-slate">
            {APP_DASHBOARD_TAGLINE}
          </p>
          <div className="inline-flex items-center rounded-full border border-cb-blue/20 bg-cb-blue/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cb-blue">
            S&amp;P 500 company support is wired across CapitalBase model workflows
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-cb-line bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-cb-ink">Start a new model</h2>
            <p className="mt-2 text-sm text-cb-slate">
              Spin up a new DCF, forecast model, comps, scorecard, or debt capacity model in seconds.
            </p>
            <Button asChild className="mt-4 w-full bg-cb-blue text-white hover:bg-blue-500">
              <Link href="/models/create">Create model</Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-cb-line bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-cb-ink">Workspace snapshot</h2>
            {snapshot.totalModels === 0 ? (
              <div className="mt-4 space-y-3 text-sm text-cb-slate">
                <p className="text-cb-slate">No models yet</p>
                <Button asChild className="w-full bg-cb-blue text-white hover:bg-blue-500">
                  <Link href="/models/create">Create your first model</Link>
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-cb-slate">
                <div className="flex items-center justify-between">
                  <span>Total models</span>
                  <span className="text-base font-semibold text-cb-ink">{snapshot.totalModels}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last ticker</span>
                  <span className="text-base font-semibold text-cb-ink">
                    {snapshot.lastModel
                      ? `${snapshot.lastModel.ticker} (${formatModelLabel(snapshot.lastModel.modelType)})`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last run</span>
                  <span className="text-base font-semibold text-cb-ink">
                    {snapshot.lastRunAt ? timeAgo(snapshot.lastRunAt) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Avg runtime</span>
                  <span className="text-base font-semibold text-cb-ink">
                    {snapshot.avgRuntimeMs ? formatDuration(snapshot.avgRuntimeMs) : '—'}
                  </span>
                </div>
                {snapshot.lastRunAt === null && (
                  <div className="text-right text-xs text-cb-slate">
                    Benchmarks populate after your first successful run.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <CTABox title="Recent models" description="Jump back into the valuation packages you touched last." href="/models" />
          <CTABox title="Macro dashboard" description="Monitor rates, indices, and headlines shaping multiples." href="/macro" />
        </section>

        <section className="rounded-2xl border border-dashed border-cb-line bg-white/80 p-6 text-sm text-cb-slate">
          {APP_WORKSPACE_FOOTER}
        </section>
      </div>
    </main>
  );
}

function CTABox({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-cb-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cb-blue/50"
    >
      <h2 className="text-lg font-semibold text-cb-ink">{title}</h2>
      <p className="mt-2 text-sm text-cb-slate">{description}</p>
      <span className="mt-4 inline-flex items-center text-sm font-semibold text-cb-blue">
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
    case 'scorecard':
      return 'Scorecard';
    default:
      return type;
  }
}

function formatDuration(ms: number | null | undefined) {
  if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return '—';
  const seconds = ms / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}
