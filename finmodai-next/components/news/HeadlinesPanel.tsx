'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Clock, Zap, AlertTriangle, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExpandableCard from '@/components/news/ExpandableCard';
import ImpactChips from '@/components/news/ImpactChips';
import { getMacroEventFallbackImage } from '@/lib/macroEventImageQueries';
import { headlineEnrichmentSchema, type HeadlineEnrichment, type NewsRange, type NewsTopic } from '@/lib/news/types';
import { cn } from '@/lib/utils';

/* ---------- constants ---------- */

const RANGE_OPTIONS: Array<{ key: NewsRange; label: string }> = [
  { key: '1D', label: 'Today' },
  { key: '3D', label: '3 Days' },
  { key: '1W', label: 'Week' },
  { key: '1M', label: 'Month' },
];

const TOPIC_OPTIONS: Array<{ key: NewsTopic; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'policy', label: 'Policy' },
  { key: 'rates', label: 'Rates' },
  { key: 'inflation', label: 'Inflation' },
  { key: 'energy', label: 'Energy' },
  { key: 'fx', label: 'FX' },
  { key: 'equities', label: 'Equities' },
];

/* ---------- types ---------- */

type NewsItem = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
};

type NewsSuccessResponse = {
  ok?: true;
  items: NewsItem[];
  provider?: 'perigon' | 'benzinga' | 'newsapi' | 'supabase' | 'demo' | 'none';
};

type NewsErrorResponse = {
  ok?: false;
  error: string;
  details?: Record<string, unknown>;
};

type MarketImpactSections = {
  summary: string[];
  drivers: string[];
  assetImpacts: Array<{ asset: string; bullets: string[] }>;
  winners: string[];
  losers: string[];
  watchItems: string[];
  fallback: string;
};

/* ---------- helpers ---------- */

function inferHeadlineImageCategory(item: NewsItem): string {
  const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
  if (/(war|ukraine|russia|china|middle east|israel|iran|sanction|tariff|export control|missile|strike|invasion)/i.test(text)) return 'geopolitics';
  if (/(fed|fomc|ecb|boj|rates?|yield|inflation|cpi|pce|treasury|jobs|payrolls)/i.test(text)) return 'rates_inflation';
  if (/(oil|opec|brent|wti|refinery|gas|energy)/i.test(text)) return 'energy';
  if (/(ai|chip|chips|gpu|semiconductor|nvidia|data center|server)/i.test(text)) return 'ai_semis';
  if (/(shipping|freight|cargo|port|container|route|canal|supply chain)/i.test(text)) return 'supply_chain';
  if (/(crypto|bitcoin|ether|blockchain)/i.test(text)) return 'crypto';
  return 'default';
}

function providerLabel(provider?: string): string {
  const map: Record<string, string> = { perigon: 'Perigon', benzinga: 'Benzinga', newsapi: 'NewsAPI', supabase: 'Supabase', demo: 'Demo', none: 'None' };
  return provider ? map[provider] ?? 'Unknown' : 'Unknown';
}

function parseResponse(payload: unknown): NewsSuccessResponse | NewsErrorResponse {
  if (!payload || typeof payload !== 'object') {
    return { error: 'invalid_response', details: { message: 'Response is not an object' } };
  }
  const data = payload as Record<string, unknown>;
  if (typeof data.error === 'string') {
    return { error: data.error, details: data.details && typeof data.details === 'object' ? (data.details as Record<string, unknown>) : undefined };
  }
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.url !== 'string' || typeof row.source !== 'string' || typeof row.publishedAt !== 'string') return null;
      return {
        id: row.id,
        title: row.title,
        description: typeof row.description === 'string' ? row.description : null,
        url: row.url,
        source: row.source,
        publishedAt: row.publishedAt,
        imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : undefined,
      } satisfies NewsItem;
    })
    .filter((item) => item != null) as NewsItem[];

  const validProviders = ['perigon', 'benzinga', 'newsapi', 'supabase', 'demo', 'none'] as const;
  const provider = validProviders.includes(data.provider as (typeof validProviders)[number])
    ? (data.provider as NewsSuccessResponse['provider'])
    : undefined;
  return { items, provider };
}

function errorDisplay(error: NewsErrorResponse): string {
  const env = typeof error.details?.env === 'string' ? error.details.env : null;
  return env ? `${error.error} (${env})` : error.error;
}

function relativeTimeLabel(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

/* ---------- market impact parsing ---------- */

function parseMarketImpactSections(raw: string | null | undefined): MarketImpactSections | null {
  if (!raw || typeof raw !== 'string') return null;
  const fallback = raw.replace(/\s+/g, ' ').trim();
  if (!fallback) return null;

  const lines = raw.split(/\n/).map((l) => l.trim());

  const summary: string[] = [];
  const drivers: string[] = [];
  const assetImpacts: Array<{ asset: string; bullets: string[] }> = [];
  const winners: string[] = [];
  const losers: string[] = [];
  const watchItems: string[] = [];

  type Section = 'none' | 'summary' | 'drivers' | 'impact' | 'impact_asset' | 'winners' | 'losers' | 'watch' | 'skip';
  let section: Section = 'none';
  let currentAsset: string | null = null;

  const ASSET_HEADERS = /^(equities|rates|fx|commodities|credit|stocks?|bonds?|dollar|usd|currencies?)$/i;

  for (const line of lines) {
    if (!line) continue;

    const upper = line.toUpperCase().replace(/[:\s]+$/, '');

    if (upper === 'SUMMARY' || upper === 'BOTTOM LINE') { section = 'summary'; continue; }
    if (upper === 'DRIVERS') { section = 'drivers'; continue; }
    if (/^MARKET\s*IMPACT/.test(upper)) { section = 'impact'; currentAsset = null; continue; }
    if (/^WINNERS?$/.test(upper)) { section = 'winners'; continue; }
    if (/^LOSERS?$/.test(upper)) { section = 'losers'; continue; }
    if (/^WATCH\s*(NEXT)?$/.test(upper)) { section = 'watch'; continue; }
    if (/^(INVALIDATION|TRANSMISSION|HORIZON)/.test(upper)) { section = 'skip'; continue; }

    if ((section === 'impact' || section === 'impact_asset') && ASSET_HEADERS.test(line.replace(/[:\s]+$/, ''))) {
      currentAsset = normalizeAssetLabel(line.replace(/[:\s]+$/, ''));
      section = 'impact_asset';
      continue;
    }

    const bullet = line.replace(/^\(?\d+\)\s*/, '').replace(/^[-•*]\s*/, '').trim();
    if (!bullet) continue;

    if (section === 'summary') {
      summary.push(bullet);
    } else if (section === 'drivers') {
      drivers.push(bullet);
    } else if (section === 'impact_asset' && currentAsset) {
      const existing = assetImpacts.find((a) => a.asset === currentAsset);
      if (existing) existing.bullets.push(bullet);
      else assetImpacts.push({ asset: currentAsset, bullets: [bullet] });
    } else if (section === 'impact') {
      const inlineMatch = bullet.match(/^(Stocks?|Bonds?|Dollar|Equities|Rates?|FX|Commodities?|Credit)\s*[:\-–—]\s*/i);
      if (inlineMatch) {
        const asset = normalizeAssetLabel(inlineMatch[1]);
        const detail = bullet.slice(inlineMatch[0].length).trim();
        if (detail) {
          const existing = assetImpacts.find((a) => a.asset === asset);
          if (existing) existing.bullets.push(detail);
          else assetImpacts.push({ asset, bullets: [detail] });
        }
      } else {
        assetImpacts.push({ asset: 'Market', bullets: [bullet] });
      }
    } else if (section === 'winners') {
      winners.push(bullet.replace(/\.$/, ''));
    } else if (section === 'losers') {
      losers.push(bullet.replace(/\.$/, ''));
    } else if (section === 'watch') {
      watchItems.push(bullet.replace(/\.$/, ''));
    } else if (section === 'none') {
      summary.push(bullet);
    }
  }

  return { summary, drivers, assetImpacts, winners, losers, watchItems, fallback };
}

function normalizeAssetLabel(raw: string): string {
  const lower = raw.toLowerCase().replace(/[:\s]+$/, '');
  if (lower === 'stocks' || lower === 'stock' || lower === 'equities') return 'Equities';
  if (lower === 'bonds' || lower === 'bond' || lower === 'rates' || lower === 'rate') return 'Rates';
  if (lower === 'dollar' || lower === 'usd' || lower === 'fx' || lower === 'currencies' || lower === 'currency') return 'FX';
  if (lower === 'commodities' || lower === 'commodity' || lower === 'oil') return 'Commodities';
  if (lower === 'credit') return 'Credit';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/* ---------- sub-components ---------- */

function NewsImage({ src, alt, fallbackSrc, className }: { src?: string; alt: string; fallbackSrc: string; className?: string }) {
  const [hidden, setHidden] = useState(false);
  const imgSrc = !src || hidden ? fallbackSrc : src;
  return (
    <img
      src={imgSrc}
      alt={alt}
      className={cn('rounded-lg object-cover', !src || hidden ? 'border border-zinc-800/50' : '', className)}
      onError={() => setHidden(true)}
    />
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: 'bg-emerald-500/12 border-emerald-500/30', text: 'text-emerald-400', label: 'High confidence' },
    medium: { bg: 'bg-amber-500/10 border-amber-500/25', text: 'text-amber-400', label: 'Medium confidence' },
    low: { bg: 'bg-zinc-700/30 border-zinc-600/30', text: 'text-zinc-400', label: 'Low confidence' },
  };
  const c = config[level] ?? config.low;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium', c.bg, c.text)}>
      <Zap className="h-2.5 w-2.5" />
      {c.label}
    </span>
  );
}

function AssetBadge({ asset }: { asset: string }) {
  const colorMap: Record<string, string> = {
    Equities: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Rates: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    FX: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    USD: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    Commodities: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Oil: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Credit: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border', colorMap[asset] ?? 'bg-zinc-800/40 text-zinc-400 border-zinc-700/30')}>
      {asset}
    </span>
  );
}

function BulletList({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn('space-y-1', className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-zinc-300">
          <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MarketImpactBlock({ text }: { text: string }) {
  const parsed = parseMarketImpactSections(text);
  if (!parsed) {
    return <p className="text-[13px] leading-relaxed text-zinc-400">Additional context unavailable.</p>;
  }

  const isEmpty = parsed.summary.length === 0 && parsed.drivers.length === 0 && parsed.assetImpacts.length === 0 && parsed.winners.length === 0 && parsed.losers.length === 0 && parsed.watchItems.length === 0;

  if (isEmpty) {
    return <p className="text-[13px] leading-relaxed text-zinc-300">{parsed.fallback}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {parsed.summary.length > 0 && (
        <BulletList items={parsed.summary} className="text-zinc-200 [&_span]:font-medium" />
      )}

      {/* Drivers */}
      {parsed.drivers.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Drivers</div>
          <BulletList items={parsed.drivers} />
        </div>
      )}

      {/* Market Impact — each asset class as its own block */}
      {parsed.assetImpacts.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Market Impact</div>
          <div className="space-y-2">
            {parsed.assetImpacts.map((group, i) => (
              <div key={`asset-${i}`} className="flex items-start gap-2.5">
                <AssetBadge asset={group.asset} />
                <BulletList items={group.bullets} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Winners & Losers */}
      {(parsed.winners.length > 0 || parsed.losers.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {parsed.winners.length > 0 && (
            <div className="rounded-md border border-emerald-500/15 bg-emerald-500/5 px-3 py-2">
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                <TrendingUp className="h-3 w-3" /> Winners
              </div>
              <BulletList items={parsed.winners} />
            </div>
          )}
          {parsed.losers.length > 0 && (
            <div className="rounded-md border border-rose-500/15 bg-rose-500/5 px-3 py-2">
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                <TrendingDown className="h-3 w-3" /> Losers
              </div>
              <BulletList items={parsed.losers} />
            </div>
          )}
        </div>
      )}

      {/* Watch Next */}
      {parsed.watchItems.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Eye className="h-3 w-3" /> Watch Next
          </div>
          <BulletList items={parsed.watchItems} />
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
      {icon}
      {label}
    </div>
  );
}

/* ---------- main component ---------- */

export default function HeadlinesPanel({
  range,
  topic,
  onRangeChange,
  onTopicChange,
}: {
  range: NewsRange;
  topic: NewsTopic;
  onRangeChange: (next: NewsRange) => void;
  onTopicChange: (next: NewsTopic) => void;
}) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [provider, setProvider] = useState<NewsSuccessResponse['provider']>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NewsErrorResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [enrichLoadingId, setEnrichLoadingId] = useState<string | null>(null);
  const [enrichMap, setEnrichMap] = useState<Record<string, HeadlineEnrichment>>({});

  const buildLocalFallback = useCallback(
    (headline: NewsItem): HeadlineEnrichment => {
      const text = `${headline.title} ${headline.description ?? ''}`.toLowerCase();
      const mentionsRates = /(fed|minutes|yield|rates?|cpi|inflation|treasury)/i.test(text);
      const mentionsEnergy = /(oil|wti|brent|energy|opec)/i.test(text);
      const mentionsFx = /(dollar|usd|dxy|fx|yen|euro|currency)/i.test(text);

      const sectors = [
        mentionsRates
          ? { sector: 'Financials', direction: 'up' as const, rationale: 'Banks tend to benefit when rates rise.' }
          : { sector: 'Technology', direction: 'mixed' as const, rationale: 'Tech stocks are sensitive to rate expectations.' },
        mentionsEnergy
          ? { sector: 'Energy', direction: 'up' as const, rationale: 'Higher oil prices help energy companies.' }
          : { sector: 'Industrials', direction: 'mixed' as const, rationale: 'Industrial companies are sensitive to economic conditions.' },
      ];

      const summary = headline.description
        ? `${headline.title}. ${headline.description}`
        : headline.title;

      const sections: string[] = ['SUMMARY'];

      if (mentionsRates) {
        sections.push('• Could affect when the Fed cuts rates');
        sections.push('', 'MARKET IMPACT', '', 'Equities', '• Stocks could come under pressure');
        sections.push('', 'Rates', '• Yields may rise, bond prices fall');
        sections.push('', 'FX', '• Dollar could strengthen');
      } else if (mentionsEnergy) {
        sections.push('• Energy prices shifting, affects costs and inflation');
        sections.push('', 'MARKET IMPACT', '', 'Equities', '• Energy stocks benefit, others may not');
        sections.push('', 'Rates', '• Yields may drift higher on inflation');
        sections.push('', 'Commodities', '• Oil prices in focus');
      } else if (mentionsFx) {
        sections.push('• Currency move affects international earnings');
        sections.push('', 'MARKET IMPACT', '', 'Equities', '• Multinationals could see earnings impacted');
        sections.push('', 'FX', '• Dollar may move meaningfully');
      } else {
        sections.push('• Worth watching, limited impact on its own');
        sections.push('', 'MARKET IMPACT', '', 'Equities', '• Reaction likely muted unless confirmed');
      }

      sections.push('', 'WATCH NEXT', '• Follow-up data confirming this headline', '• Stock market reaction in next 1-2 days');

      const whyItMatters = sections.join('\n');

      return headlineEnrichmentSchema.parse({
        ai_summary: summary,
        why_it_matters: whyItMatters,
        impacted_sectors: sectors,
        impacted_tickers: [],
        confidence: 'low',
      });
    },
    []
  );

  const fetchHeadlines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/news?range=${range}&topic=${topic}&limit=20`, { cache: 'no-store' });
      const raw = await response.json();
      const payload = parseResponse(raw);
      if (!response.ok || 'error' in payload) {
        setItems([]);
        setProvider(undefined);
        setError('error' in payload ? payload : { error: 'request_failed' });
        return;
      }
      setItems(payload.items);
      setProvider(payload.provider);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load headlines';
      setItems([]);
      setProvider(undefined);
      setError({ error: message });
    } finally {
      setLoading(false);
    }
  }, [range, topic]);

  useEffect(() => {
    void fetchHeadlines();
  }, [fetchHeadlines]);

  useEffect(() => {
    if (items.length === 0) setExpandedId(null);
    else if (expandedId && !items.some((i) => i.id === expandedId)) setExpandedId(null);
  }, [expandedId, items]);

  const loadEnrichment = useCallback(
    async (headline: NewsItem) => {
      if (enrichMap[headline.id]) return;
      setEnrichLoadingId(headline.id);
      try {
        const response = await fetch('/api/news/headlines/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headline: { id: headline.id, title: headline.title, description: headline.description, source: headline.source, published_at: headline.publishedAt, url: headline.url, tags: [] },
          }),
        });
        if (!response.ok) {
          setEnrichMap((c) => ({ ...c, [headline.id]: buildLocalFallback(headline) }));
          return;
        }
        const raw = await response.json();
        const parsed = headlineEnrichmentSchema.safeParse(raw);
        const payload = parsed.success ? parsed.data : buildLocalFallback(headline);
        setEnrichMap((c) => ({ ...c, [headline.id]: payload }));
      } catch {
        setEnrichMap((c) => ({ ...c, [headline.id]: buildLocalFallback(headline) }));
      } finally {
        setEnrichLoadingId(null);
      }
    },
    [buildLocalFallback, enrichMap]
  );

  const resolvedProviderLabel = useMemo(() => providerLabel(provider), [provider]);

  return (
    <div className="space-y-5">
      {/* ---- header bar ---- */}
      <div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              CapitalBase News Desk
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
              Market Headlines
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-400 sm:flex">
              <span className="font-medium text-zinc-300">{items.length}</span> headlines via <span className="font-medium text-zinc-300">{resolvedProviderLabel}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => void fetchHeadlines()}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* filters */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onRangeChange(opt.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                range === opt.key
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              )}
            >
              {opt.label}
            </button>
          ))}
          <div className="mx-1.5 h-4 w-px bg-zinc-800" />
          {TOPIC_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onTopicChange(opt.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                topic === opt.key
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- feed ---- */}
      <div>
        <div className="space-y-2">
          {loading && (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-800/30 bg-zinc-900/20" />
              ))}
            </>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/8 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-rose-300">
                <AlertTriangle className="h-4 w-4" /> Failed to load headlines
              </div>
              <div className="mt-1 text-xs text-rose-300/70">{errorDisplay(error)}</div>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/20 p-6 text-center">
              <div className="text-sm text-zinc-400">No headlines found for this filter.</div>
              <div className="mt-1 text-xs text-zinc-500">Try widening the time range or changing the topic.</div>
            </div>
          )}

          {!loading &&
            !error &&
            items.map((item) => {
              const isOpen = expandedId === item.id;
              const enrichment = enrichMap[item.id];
              const fallbackImg = getMacroEventFallbackImage(inferHeadlineImageCategory(item), 'thumb');

              return (
                <div
                  key={item.id}
                  className={cn(
                    'transition-all duration-200',
                    isOpen && 'ring-1 ring-zinc-700/60'
                  )}
                  style={{ borderRadius: '0.5rem' }}
                >
                  <ExpandableCard
                    isOpen={isOpen}
                    onToggle={() => {
                      setExpandedId((c) => (c === item.id ? null : item.id));
                      if (!isOpen) void loadEnrichment(item);
                    }}
                    rightAccessory={
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    }
                    header={
                      <div className="flex items-start gap-3">
                        <NewsImage
                          src={item.imageUrl}
                          alt={item.title}
                          fallbackSrc={fallbackImg}
                          className="h-14 w-14 shrink-0 rounded-md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                            <span className="font-medium text-zinc-400">{item.source}</span>
                            <span className="text-zinc-700">·</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {relativeTimeLabel(item.publishedAt)}
                            </span>
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-[1.4] text-zinc-100">
                            {item.title}
                          </div>
                          {item.description && (
                            <div className="mt-0.5 line-clamp-1 text-[12px] leading-relaxed text-zinc-500">
                              {item.description}
                            </div>
                          )}
                        </div>
                      </div>
                    }
                  >
                    {/* enrichment loading */}
                    {enrichLoadingId === item.id && !enrichment && (
                      <div className="space-y-2">
                        <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800/40" />
                        <div className="h-3 w-full animate-pulse rounded bg-zinc-800/30" />
                        <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-800/30" />
                      </div>
                    )}

                    {/* enrichment loaded */}
                    {enrichment && (
                      <div className="space-y-4">
                        {/* confidence + summary */}
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <SectionLabel icon={<Zap className="h-3 w-3" />} label="AI Analysis" />
                            <ConfidenceBadge level={enrichment.confidence ?? 'low'} />
                          </div>
                          <p className="text-[13px] leading-relaxed text-zinc-300">
                            {enrichment.ai_summary ?? 'Summary unavailable.'}
                          </p>
                        </div>

                        {/* impact chips */}
                        <div className="flex flex-wrap gap-6">
                          <ImpactChips title="Sectors" items={enrichment.impacted_sectors} />
                          <ImpactChips title="Tickers" items={enrichment.impacted_tickers} />
                        </div>

                        {/* market impact */}
                        {enrichment.why_it_matters && (
                          <div className="rounded-lg border border-zinc-800/30 bg-zinc-950/40 p-4">
                            <MarketImpactBlock text={enrichment.why_it_matters} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* fallback retry */}
                    {!enrichLoadingId && !enrichment && (
                      <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/20 p-4 text-center">
                        <div className="text-xs text-zinc-400">Could not load analysis for this headline.</div>
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-zinc-200 underline underline-offset-2 hover:text-zinc-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            void loadEnrichment(item);
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </ExpandableCard>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
