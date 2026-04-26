'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Clock, ExternalLink, Eye, Newspaper, RefreshCw, Zap } from 'lucide-react';
import { EventImpactPanel } from '@/components/events/EventImpactPanel';
import type { EventImpactResult } from '@/lib/useEventImpact';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMacroEventFallbackImage } from '@/lib/macroEventImageQueries';
import type { HeadlineEnrichment, NewsRange, NewsTopic } from '@/lib/news/types';

const imageLoader = ({ src }: { src: string }) => src;

export type HeadlinePanelItem = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
};

export function HeadlinesPanelHeader(props: {
  itemCount: number;
  providerLabel: string;
  range: NewsRange;
  topic: NewsTopic;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onRangeChange: (next: NewsRange) => void;
  onTopicChange: (next: NewsTopic) => void;
}) {
  const rangeOptions: Array<{ key: NewsRange; label: string }> = [
    { key: '1D', label: 'Today' },
    { key: '3D', label: '3 Days' },
    { key: '1W', label: 'Week' },
    { key: '1M', label: 'Month' },
  ];
  const topicOptions: Array<{ key: NewsTopic; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'policy', label: 'Policy' },
    { key: 'rates', label: 'Rates' },
    { key: 'inflation', label: 'Inflation' },
    { key: 'energy', label: 'Energy' },
    { key: 'fx', label: 'FX' },
    { key: 'equities', label: 'Equities' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            CapitalBase News Desk
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">Market Headlines</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-400 sm:flex">
            <span className="font-medium text-zinc-300">{props.itemCount}</span> headlines via{' '}
            <span className="font-medium text-zinc-300">{props.providerLabel}</span>
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs" onClick={props.onRefresh}>
            <RefreshCw className={cn('h-3 w-3', (props.loading || props.refreshing) && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {rangeOptions.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => props.onRangeChange(opt.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              props.range === opt.key
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            )}
          >
            {opt.label}
          </button>
        ))}
        <div className="mx-1.5 h-4 w-px bg-zinc-800" />
        {topicOptions.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => props.onTopicChange(opt.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              props.topic === opt.key
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FeedSummaryBanner({ itemCount }: { itemCount: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-3 backdrop-blur-md">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <Newspaper className="h-3.5 w-3.5" />
          Live Feed
        </div>
        <p className="mt-1 text-sm text-zinc-400">Read the headline first, then expand the one that deserves a market-impact view.</p>
      </div>
      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-300">
        {itemCount} headlines
      </div>
    </div>
  );
}

export function LoadingState() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-800/30 bg-zinc-900/20" />
      ))}
    </>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/8 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-rose-300">
        <AlertTriangle className="h-4 w-4" /> Failed to load headlines
      </div>
      <div className="mt-1 text-xs text-rose-300/70">{message}</div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/20 p-6 text-center">
      <div className="text-sm text-zinc-400">No headlines found for this filter.</div>
      <div className="mt-1 text-xs text-zinc-500">Try widening the time range or changing the topic.</div>
    </div>
  );
}

function inferHeadlineImageCategory(item: HeadlinePanelItem): string {
  const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
  if (/(war|ukraine|russia|china|middle east|israel|iran|sanction|tariff|export control|missile|strike|invasion)/i.test(text)) return 'geopolitics';
  if (/(fed|fomc|ecb|boj|rates?|yield|inflation|cpi|pce|treasury|jobs|payrolls)/i.test(text)) return 'rates_inflation';
  if (/(oil|opec|brent|wti|refinery|gas|energy)/i.test(text)) return 'energy';
  if (/(ai|chip|chips|gpu|semiconductor|nvidia|data center|server)/i.test(text)) return 'ai_semis';
  if (/(shipping|freight|cargo|port|container|route|canal|supply chain)/i.test(text)) return 'supply_chain';
  if (/(crypto|bitcoin|ether|blockchain)/i.test(text)) return 'crypto';
  return 'default';
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
  return `${Math.floor(diffHrs / 24)}d ago`;
}

function NewsImage({ src, alt, fallbackSrc, className }: { src?: string; alt: string; fallbackSrc: string; className?: string }) {
  const [hidden, setHidden] = useState(false);
  const imgSrc = !src || hidden ? fallbackSrc : src;
  return (
    <div className={cn('relative overflow-hidden rounded-lg', !src || hidden ? 'border border-zinc-800/50' : '', className)}>
      <Image
        loader={imageLoader}
        unoptimized
        fill
        sizes="(max-width: 768px) 100vw, 320px"
        src={imgSrc}
        alt={alt}
        className="object-cover"
        onError={() => setHidden(true)}
      />
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: 'bg-emerald-500/12 border-emerald-500/30', text: 'text-emerald-400', label: 'High confidence' },
    medium: { bg: 'bg-amber-500/10 border-amber-500/25', text: 'text-amber-400', label: 'Medium confidence' },
    low: { bg: 'bg-zinc-700/30 border-zinc-600/30', text: 'text-zinc-400', label: 'Low confidence' },
  };
  const c = config[level] ?? config.low;
  return <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium', c.bg, c.text)}>{c.label}</span>;
}

function headlineLead(enrichment?: HeadlineEnrichment | null) {
  if (!enrichment) return null;
  return enrichment.ai_summary?.trim() || enrichment.why_it_matters?.trim() || null;
}

function DetailBlock({ enrichment }: { enrichment: HeadlineEnrichment }) {
  const sectors = enrichment.impacted_sectors?.slice(0, 4).map((sector) => sector.sector) ?? [];
  const tickers = enrichment.impacted_tickers?.slice(0, 5).map((ticker) => `$${ticker.ticker}`) ?? [];
  const why = enrichment.why_it_matters?.trim() || 'Additional context unavailable.';
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <Eye className="h-3.5 w-3.5" />
          Investor Read-Through
        </div>
        <p className="text-[13px] leading-6 text-zinc-300">{why}</p>
        {(sectors.length > 0 || tickers.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sectors.map((sector) => (
              <span key={sector} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-300">
                {sector}
              </span>
            ))}
            {tickers.map((ticker) => (
              <span key={ticker} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-200">
                {ticker}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function HeadlineCard(props: {
  item: HeadlinePanelItem;
  isSelected: boolean;
  enrichment?: HeadlineEnrichment | null;
  enrichLoading: boolean;
  onToggle: () => void;
  onRetry: () => void;
  /** Called when the user clicks "Analyze Model Impact" */
  onAnalyzeImpact?: () => void;
  /** True while the impact API call is in-flight */
  impactLoading?: boolean;
  /** Result from /api/event-impact to display inline */
  impactResult?: EventImpactResult | null;
  /** Propagated to EventImpactPanel — lets user push mutation into the live model */
  onApplyToModel?: (updatedModel: EventImpactResult['updated_model']) => void;
}) {
  const fallbackImg = getMacroEventFallbackImage(inferHeadlineImageCategory(props.item), 'thumb');
  const lead = headlineLead(props.enrichment);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border transition-all duration-200',
        props.isSelected
          ? 'border-cyan-400/30 bg-[linear-gradient(180deg,rgba(14,165,233,0.12),rgba(255,255,255,0.02))] shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
          : 'border-white/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]'
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={props.isSelected}
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          props.onToggle();
        }}
        className={cn(
          'group w-full p-4 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(11,14,19,0.6)]',
          !props.isSelected && 'hover:bg-[rgba(255,255,255,0.025)]'
        )}
      >
        <div className="flex items-start gap-3">
          <NewsImage src={props.item.imageUrl} alt={props.item.title} fallbackSrc={fallbackImg} className="h-16 w-16 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="font-medium text-zinc-300">{props.item.source}</span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {relativeTimeLabel(props.item.publishedAt)}
              </span>
              {props.enrichment ? <ConfidenceBadge level={props.enrichment.confidence ?? 'low'} /> : null}
            </div>
            <div className="mt-1 line-clamp-2 text-[15px] font-semibold leading-[1.35] text-zinc-100">
              {props.item.title}
            </div>
            {props.item.description && (
              <div className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-zinc-400">
                {props.item.description}
              </div>
            )}
            {lead && !props.isSelected && (
              <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-zinc-300">{lead}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={props.item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      {props.isSelected && (
        <div className="border-t border-white/8 px-4 pb-4 pt-4">
          {props.enrichLoading && !props.enrichment ? (
            <div className="space-y-3">
              <div className="h-8 animate-pulse rounded-xl bg-white/[0.05]" />
              <div className="h-28 animate-pulse rounded-2xl bg-white/[0.04]" />
            </div>
          ) : props.enrichment ? (
            <DetailBlock enrichment={props.enrichment} />
          ) : (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-center">
              <div className="text-sm text-zinc-300">Could not load analysis for this headline.</div>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-zinc-200 underline underline-offset-2 hover:text-zinc-100"
                onClick={props.onRetry}
              >
                Retry
              </button>
            </div>
          )}

          {/* Model mutation button + result panel */}
          {props.onAnalyzeImpact && (
            <div className="mt-4">
              {!props.impactResult && (
                <button
                  type="button"
                  disabled={props.impactLoading}
                  onClick={props.onAnalyzeImpact}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/8 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {props.impactLoading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
                      Analyzing model impact…
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Analyze Model Impact
                    </>
                  )}
                </button>
              )}

              {props.impactResult && (
                <EventImpactPanel
                  result={props.impactResult}
                  onApplyToModel={props.onApplyToModel}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
