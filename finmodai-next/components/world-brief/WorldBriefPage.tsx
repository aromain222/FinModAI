'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Globe2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { WorldBriefEventCard, WorldBriefResponseV2 } from '@/types/worldBrief';

type RegionFilter =
  | 'all'
  | 'north_america'
  | 'latin_america'
  | 'europe'
  | 'middle_east'
  | 'africa'
  | 'asia_pacific'
  | 'global';

type TagFilter =
  | 'all'
  | 'rates'
  | 'fx'
  | 'equities'
  | 'credit'
  | 'commodities'
  | 'energy'
  | 'inflation'
  | 'growth'
  | 'trade'
  | 'policy'
  | 'geopolitics';

type TimeframeFilter = '24h' | '72h' | '7d';

const regionOptions: { key: RegionFilter; label: string }[] = [
  { key: 'all', label: 'All Regions' },
  { key: 'north_america', label: 'North America' },
  { key: 'latin_america', label: 'Latin America' },
  { key: 'europe', label: 'Europe' },
  { key: 'middle_east', label: 'Middle East' },
  { key: 'africa', label: 'Africa' },
  { key: 'asia_pacific', label: 'Asia Pacific' },
  { key: 'global', label: 'Global' },
];

const tagOptions: { key: TagFilter; label: string }[] = [
  { key: 'all', label: 'All Tags' },
  { key: 'geopolitics', label: 'Geopolitics' },
  { key: 'policy', label: 'Policy' },
  { key: 'trade', label: 'Trade' },
  { key: 'energy', label: 'Energy' },
  { key: 'commodities', label: 'Commodities' },
  { key: 'inflation', label: 'Inflation' },
  { key: 'rates', label: 'Rates' },
  { key: 'fx', label: 'FX' },
  { key: 'equities', label: 'Equities' },
  { key: 'credit', label: 'Credit' },
  { key: 'growth', label: 'Growth' },
];

const timeframeOptions: { key: TimeframeFilter; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '72h', label: '72h' },
  { key: '7d', label: '7d' },
];

function hideKey(item: WorldBriefEventCard): string {
  return `${item.event_id}`;
}

// Confidence is still computed/returned for internal diagnostics, but we intentionally do not
// render confidence badges in the UI (they read as arbitrary and hurt trust).

export default function WorldBriefPage() {
  const [region, setRegion] = useState<RegionFilter>('all');
  const [tag, setTag] = useState<TagFilter>('all');
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('72h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<WorldBriefResponseV2 | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem('worldBriefHidden');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setHidden(parsed);
    } catch {
      // Ignore bad local storage.
    }
  }, []);

  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key];
      localStorage.setItem('worldBriefHidden', JSON.stringify(next));
      return next;
    });
  };

  const fetchBrief = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const endpoint = `/api/world-brief?region=${region}&tag=${tag}&timeframe=${timeframe}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to fetch world brief');
      const data: WorldBriefResponseV2 = await res.json();
      setResponse(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch world brief');
    } finally {
      setLoading(false);
    }
  }, [region, tag, timeframe]);

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  const visibleEvents = useMemo(() => {
    const list = response?.events || [];
    return list.filter((item) => !hidden.includes(hideKey(item)));
  }, [response?.events, hidden]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/macro">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Macro
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Globe2 className="h-6 w-6" />
              World Brief — Major Events
            </h1>
            <p className="text-sm text-muted-foreground">Event-level macro and geopolitical developments.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {process.env.NODE_ENV !== 'production' && (
            <Button
              onClick={async () => {
                try {
                  const endpoint = `/api/world-brief?region=${region}&tag=${tag}&timeframe=${timeframe}&debug=1`;
                  const res = await fetch(endpoint);
                  const payload = await res.json();
                  console.log('[World Brief debug]', payload);
                  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                } catch (err) {
                  console.error('Failed to copy debug payload', err);
                }
              }}
              variant="secondary"
              size="sm"
            >
              Copy debug payload
            </Button>
          )}
          <Button onClick={fetchBrief} variant="outline" size="sm" className="gap-2" disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {regionOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRegion(option.key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm border transition',
                  region === option.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'text-muted-foreground hover:border-primary/40'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Timeframe</span>
              {timeframeOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setTimeframe(option.key)}
                  className={cn(
                    'px-2 py-1 rounded-md border text-xs transition',
                    timeframe === option.key ? 'bg-muted text-foreground border-border' : 'text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {tagOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setTag(option.key)}
                  className={cn(
                    'px-2 py-1 rounded-md border text-xs transition',
                    tag === option.key ? 'bg-muted text-foreground border-border' : 'text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">View</span>
              <span className="px-2 py-1 rounded-md border text-xs bg-muted text-foreground border-border">Major Events</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Fetching world brief...
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {visibleEvents.length === 0 && (
            <Card className="border-amber-500/40 bg-amber-500/10">
              <CardContent className="py-6 text-sm text-amber-200">
                No major events found for this range. Try expanding the timeframe or removing filters.
              </CardContent>
            </Card>
          )}

          {visibleEvents.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              {visibleEvents.map((event, idx) => {
                const isHero = idx === 0;
                return (
                  <Card key={event.event_id} className={cn('border border-white/5 bg-gradient-to-br from-slate-950/60 to-slate-900/60', isHero && 'lg:col-span-2')}>
                    <CardHeader className={cn('pb-3', isHero && 'pb-4')}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-300/80">
                            <span className="rounded-full border border-amber-400/50 px-2 py-0.5">Major Event</span>
                            <span className="text-muted-foreground">
                              {event.sources?.[0]?.published_at
                                ? new Date(event.sources[0].published_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                : ''}
                            </span>
                          </div>
                          <CardTitle className={cn(isHero ? 'text-2xl' : 'text-xl', 'leading-tight')}>
                            {event.headline}
                          </CardTitle>
                          <CardDescription className="text-sm text-muted-foreground">
                            {event.primary_regions.join(', ') || 'Global'}
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-white/10 px-2 py-0.5">{event.sources.length} sources</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {event.tags.map((tagValue) => (
                          <span key={tagValue} className="rounded-full bg-white/5 px-2 py-0.5 text-foreground/80">
                            {tagValue}
                          </span>
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happened</p>
                        <p className={cn('mt-2 leading-relaxed text-foreground/90', isHero ? 'text-base' : 'text-sm')}>
                          {event.what_happened}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why it matters</p>
                        <p className="mt-2 text-sm text-foreground/90">{event.why_it_matters}</p>
                        <ul className="mt-3 space-y-2 text-sm text-foreground/90">
                          {event.key_points.map((bullet, bulletIdx) => (
                            <li key={`${event.event_id}-${bulletIdx}`} className="flex gap-2">
                              <span className="text-[10px] uppercase tracking-wide rounded-full border border-primary/30 px-2 py-0.5 text-primary">
                                Key
                              </span>
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid gap-2 text-xs text-muted-foreground">
                        <div>
                          <span className="font-semibold text-foreground/80">Sources</span>
                          <div className="mt-1 space-y-1">
                            {event.sources.map((s) => (
                              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block underline decoration-white/20 hover:text-foreground">
                                {s.source_name} — {s.title}
                              </a>
                            ))}
                          </div>
                        </div>
                        <div>Confidence: {event.confidence}</div>
                        <button onClick={() => toggleHidden(hideKey(event))} className="w-fit underline text-muted-foreground hover:text-foreground">
                          Hide similar
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
