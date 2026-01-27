'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { MarketEvent } from '@/lib/view_models/marketEventClustering';

type MarketEventCardProps = {
  event: MarketEvent;
  returnsByTicker?: Record<string, number | null>;
  rangeLabel?: '1D' | '1W' | '1M';
};

const eventTypeClass: Record<MarketEvent['event_type'], string> = {
  macro: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  sector: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  company: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

const directionClass: Record<MarketEvent['impact_direction'], string> = {
  up: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  down: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  mixed: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  neutral: 'bg-slate-700/50 text-slate-300 border-slate-600/30',
};

const confidenceClass: Record<MarketEvent['confidence'], string> = {
  high: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  low: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

export function MarketEventCard({ event, returnsByTicker, rangeLabel }: MarketEventCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const href = typeof event.url === 'string' && event.url.trim().length ? event.url : null;

  const publishedLabel = useMemo(() => {
    const ts = Date.parse(event.publishedAt);
    if (!Number.isFinite(ts)) return null;
    const dt = new Date(ts);
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [event.publishedAt]);

  const formatMove = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const formatArrow = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    if (value > 0.3) return '↑';
    if (value < -0.3) return '↓';
    return '→';
  };

  const tickerMoveClass = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'bg-slate-700/50 text-slate-300 border-slate-600/30';
    if (value > 0.3) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    if (value < -0.3) return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    return 'bg-slate-700/50 text-slate-300 border-slate-600/30';
  };

  const computedConfidence = useMemo<MarketEvent['confidence']>(() => {
    const tickers = Array.isArray(event.affected_tickers) ? event.affected_tickers : [];
    const priceCovered = tickers.filter((t) => {
      const v = returnsByTicker?.[t.toUpperCase()];
      return v !== null && v !== undefined && Number.isFinite(v);
    }).length;

    const sources = Array.from(
      new Set(
        [event.source, ...(Array.isArray(event.sources) ? event.sources : [])]
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter(Boolean)
      )
    );
    const trustedCount = sources.filter((s) => {
      const lower = s.toLowerCase();
      return (
        lower.includes('reuters') ||
        lower.includes('bloomberg') ||
        lower.includes('wsj') ||
        lower.includes('wall street journal') ||
        lower.includes('financial times') ||
        lower.includes('ft.com') ||
        lower.includes('cnbc') ||
        lower.includes('marketwatch')
      );
    }).length;

    if (priceCovered >= 3 && trustedCount >= 2) return 'high';
    if (priceCovered >= 2) return 'medium';
    return 'low';
  }, [event.affected_tickers, event.source, event.sources, returnsByTicker]);

  const computedConfidenceReason = useMemo(() => {
    const tickers = Array.isArray(event.affected_tickers) ? event.affected_tickers : [];
    const priceCovered = tickers.filter((t) => {
      const v = returnsByTicker?.[t.toUpperCase()];
      return v !== null && v !== undefined && Number.isFinite(v);
    }).length;
    const sourcesCount = Array.from(
      new Set(
        [event.source, ...(Array.isArray(event.sources) ? event.sources : [])]
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter(Boolean)
      )
    ).length;
    return `Prices: ${priceCovered}/${Math.min(tickers.length, 8)} tickers • Sources: ${sourcesCount}`;
  }, [event.affected_tickers, event.source, event.sources, returnsByTicker]);

  const marketDisagrees = useMemo(() => {
    if (event.impact_direction === 'mixed' || event.impact_direction === 'neutral') return false;
    const anchor = (() => {
      const tickers = Array.isArray(event.affected_tickers) ? event.affected_tickers : [];
      if (event.event_type === 'macro') return tickers.includes('SPY') ? 'SPY' : tickers[0];
      if (event.event_type === 'sector') {
        const etf = tickers.find((t) => /^[A-Z]{2,5}$/.test(t) && t.startsWith('XL'));
        return etf || tickers[0];
      }
      return tickers.find((t) => !t.startsWith('XL') && t !== 'SPY' && t !== 'QQQ') || tickers[0];
    })();
    if (!anchor) return false;
    const move = returnsByTicker?.[anchor.toUpperCase()];
    if (move === null || move === undefined || !Number.isFinite(move)) return false;
    if (event.impact_direction === 'up' && move < -0.3) return true;
    if (event.impact_direction === 'down' && move > 0.3) return true;
    return false;
  }, [event.affected_tickers, event.event_type, event.impact_direction, returnsByTicker]);

  return (
    <div
      className={cn(
        'rounded-xl border border-white/5 bg-slate-900/40 overflow-hidden hover:border-emerald-500/20 transition-colors',
        href ? 'cursor-pointer' : ''
      )}
      role={href ? 'link' : undefined}
      tabIndex={href ? 0 : undefined}
      onClick={() => {
        if (!href) return;
        window.open(href, '_blank', 'noopener,noreferrer');
      }}
      onKeyDown={(e) => {
        if (!href) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }}
    >
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h4 className={cn('text-base font-semibold text-white leading-snug flex-1', href ? 'hover:underline underline-offset-2' : '')}>
            {event.title}
          </h4>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={cn('text-xs px-2 py-0.5', eventTypeClass[event.event_type])}>
              {event.event_type.toUpperCase()}
            </Badge>
            <Badge className={cn('text-xs px-2 py-0.5', directionClass[event.impact_direction])}>
              {event.impact_direction.toUpperCase()}
            </Badge>
            <Badge className={cn('text-xs px-2 py-0.5', confidenceClass[computedConfidence])} title={computedConfidenceReason}>
              {computedConfidence.toUpperCase()}
            </Badge>
            {marketDisagrees ? (
              <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-xs px-2 py-0.5">
                MARKET DISAGREES
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="text-sm text-slate-200 leading-relaxed">
          {event.subtitle || event.why_it_matters}
        </div>

        {(event.affected_sectors?.length || event.affected_tickers?.length) && (
          <div className="space-y-2">
            {event.affected_sectors?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {event.affected_sectors.slice(0, 6).map((sector) => (
                  <Badge key={sector} className="bg-slate-700/50 text-slate-300 border-slate-600/30 text-xs px-2 py-0.5">
                    {sector}
                  </Badge>
                ))}
              </div>
            ) : null}
            {event.affected_tickers?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {event.affected_tickers.slice(0, 6).map((ticker) => {
                  const move = returnsByTicker?.[ticker.toUpperCase()] ?? null;
                  const moveLabel = formatMove(move);
                  const arrow = formatArrow(move);
                  return (
                    <Badge key={ticker} className={cn('text-xs px-2 py-0.5', tickerMoveClass(move))}>
                      {ticker}
                      {arrow ? <span className="ml-1 opacity-80">{arrow}</span> : <span className="ml-1 opacity-70">—</span>}
                      {moveLabel ? <span className="ml-1 opacity-80">{moveLabel}</span> : null}
                    </Badge>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="truncate">
            {(event.source && event.source !== 'Unknown' ? event.source : event.sources?.[0] || 'Unknown')}
            {event.scope ? ` • ${event.scope}` : ''}
            {publishedLabel ? ` • ${publishedLabel}` : ''}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setDetailsOpen(true);
              }}
            >
              Details
            </Button>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-300 hover:underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                Read more
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{event.title}</DialogTitle>
            <div className="mt-1 text-xs text-slate-400">
              {(event.source && event.source !== 'Unknown' ? event.source : event.sources?.[0] || 'Unknown')}
              {event.scope ? ` • ${event.scope}` : ''}
              {publishedLabel ? ` • ${publishedLabel}` : ''}
            </div>
          </DialogHeader>

          <div className="text-sm text-slate-200 leading-relaxed">{event.why_it_matters}</div>

          {(event.affected_sectors?.length || event.affected_tickers?.length) && (
            <div className="mt-4 space-y-3">
              {event.affected_sectors?.length ? (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Sectors</div>
                  <div className="flex flex-wrap gap-1.5">
                    {event.affected_sectors.slice(0, 8).map((sector) => (
                      <Badge key={sector} className="bg-slate-700/50 text-slate-300 border-slate-600/30 text-xs px-2 py-0.5">
                        {sector}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {event.affected_tickers?.length ? (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Market reaction</div>
                  <div className="flex flex-wrap gap-1.5">
                    {event.affected_tickers.slice(0, 8).map((ticker) => {
                      const move = returnsByTicker?.[ticker.toUpperCase()] ?? null;
                      const moveLabel = formatMove(move);
                      const arrow = formatArrow(move);
                      return (
                        <Badge key={ticker} className={cn('text-xs px-2 py-0.5', tickerMoveClass(move))}>
                          {ticker}
                          {arrow ? <span className="ml-1 opacity-80">{arrow}</span> : <span className="ml-1 opacity-70">—</span>}
                          {moveLabel ? <span className="ml-1 opacity-80">{moveLabel}</span> : null}
                        </Badge>
                      );
                    })}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Returns shown over selected window{rangeLabel ? ` (${rangeLabel})` : ''} • {computedConfidenceReason}.
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Sources:{' '}
              {Array.isArray(event.source_links) && event.source_links.length ? (
                event.source_links.map((link) => (
                  <a
                    key={`${link.source}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-300 hover:underline underline-offset-2 mr-3"
                  >
                    {link.source}
                  </a>
                ))
              ) : (
                <span>{event.sources?.slice(0, 3).filter((s) => s && s !== 'Unknown').join(', ') || '—'}</span>
              )}
            </div>
            {href ? (
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800/60"
                onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
              >
                Open original
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
