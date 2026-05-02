'use client';

import { ForecastSparkline } from '@/components/analyst/ForecastSparkline';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { labelForecastSource, type AnalystForecastModelPayload } from '@/lib/analyst/forecastModel';

function formatCurrencyMillions(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}T`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  return `$${Math.round(value).toLocaleString('en-US')}M`;
}

function formatSharePrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function formatPctPoint(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function sourceVariant(source: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (source === 'timesfm') return 'default';
  if (source === 'flat_fallback') return 'secondary';
  return 'outline';
}

function qualityClass(quality: string): string {
  if (quality === 'strong') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100';
  if (quality === 'weak') return 'border-red-400/25 bg-red-400/10 text-red-100';
  if (quality === 'mixed') return 'border-amber-400/25 bg-amber-400/10 text-amber-100';
  return 'border-[var(--cb-border-subtle)] bg-black/10 text-[var(--cb-text-muted)]';
}

function verdictClass(verdict: string): string {
  if (verdict === 'confirms') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100';
  if (verdict === 'conflicts') return 'border-red-400/25 bg-red-400/10 text-red-100';
  if (verdict === 'mixed') return 'border-amber-400/25 bg-amber-400/10 text-amber-100';
  return 'border-[var(--cb-border-subtle)] bg-black/10 text-[var(--cb-text-muted)]';
}

function formatHitRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

function formatPctStat(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatVolStat(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(1)}%`;
}

function sampledIndexes(length: number): number[] {
  if (length <= 6) return Array.from({ length }, (_, index) => index);
  return Array.from(new Set([
    0,
    Math.floor(length * 0.25),
    Math.floor(length * 0.5),
    Math.floor(length * 0.75),
    length - 1,
  ]));
}

export function AnalystForecastModelCard({ payload }: { payload: AnalystForecastModelPayload }) {
  const isPriceForecast = payload.forecastKind === 'price' || payload.units === 'USD/share';
  const confidencePct = Math.round(Math.max(0, Math.min(1, payload.confidence)) * 100);
  const returnPct =
    payload.returnPct ??
    (payload.latestActual && payload.terminalForecast
      ? payload.terminalForecast / payload.latestActual - 1
      : null);
  const priceRows = sampledIndexes(payload.forecast.length).map((index) => ({
    period: payload.forecastDates?.[index] ?? `Day ${index + 1}`,
    value: payload.forecast[index] ?? null,
    lower: payload.lower?.[index] ?? null,
    upper: payload.upper?.[index] ?? null,
  }));
  const revenueRows = payload.forecast.map((value, index) => ({
    period: `Year ${index + 1}`,
    value,
    growth: payload.growthPath[index] ?? null,
  }));
  const liveHeadlineCount = payload.newsWatch?.filter((item) => item.sourceType === 'live_news').length ?? 0;
  const strategicFallbackCount = payload.newsWatch?.filter((item) => item.sourceType === 'strategic_fallback').length ?? 0;
  const topEvent = payload.newsWatch?.find((item) => item.eventForecast?.pmBrain)?.eventForecast?.pmBrain;

  return (
    <Card className="mt-4 border-[var(--cb-border-subtle)] bg-[var(--cb-surface-elevated)]">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
              {isPriceForecast ? 'Stock Price Forecast' : 'Forecast Model'}
            </div>
            <CardTitle className="mt-1 text-lg text-[var(--cb-text-primary)]">
              {payload.title}
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={sourceVariant(payload.source)}>{labelForecastSource(payload.source)}</Badge>
            <Badge variant="outline">{confidencePct}% confidence</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
              {isPriceForecast ? 'Current Price' : 'Latest Revenue'}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--cb-text-primary)]">
              {isPriceForecast ? formatSharePrice(payload.latestActual) : formatCurrencyMillions(payload.latestActual)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
              {isPriceForecast ? `${payload.horizonLabel ?? 'Forecast'} Price` : `Year ${payload.horizonYears} Revenue`}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--cb-text-primary)]">
              {isPriceForecast ? formatSharePrice(payload.terminalForecast) : formatCurrencyMillions(payload.terminalForecast)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
              {isPriceForecast ? 'Potential Move' : 'Implied CAGR'}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--cb-text-primary)]">
              {formatPct(isPriceForecast ? returnPct : payload.cagr)}
            </div>
          </div>
        </div>

        <ForecastSparkline
          forecast={payload.forecast}
          historical={payload.historical}
          lower={payload.lower}
          upper={payload.upper}
          title={isPriceForecast ? 'Potential Growth Path' : 'Forecast Path'}
          historicalLabel={isPriceForecast ? 'Recent price' : 'Historical'}
          forecastLabel={isPriceForecast ? 'Projected price' : 'Forecast'}
          forecastTone={returnPct == null ? 'neutral' : returnPct < 0 ? 'negative' : returnPct > 0 ? 'positive' : 'neutral'}
        />

        {isPriceForecast && payload.backtest ? (
          <div className="grid gap-3 sm:grid-cols-[1.15fr_1fr]">
            <div className={`rounded-lg border p-3 ${qualityClass(payload.backtest.quality)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] font-medium uppercase tracking-widest opacity-80">
                  Backtest Check
                </div>
                <div className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest">
                  {payload.backtest.quality}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-widest opacity-70">Hit rate</div>
                  <div className="mt-0.5 font-semibold tabular-nums">{formatHitRate(payload.backtest.directionHitRate)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest opacity-70">Avg miss</div>
                  <div className="mt-0.5 font-semibold tabular-nums">
                    {payload.backtest.averageAbsoluteErrorPct === null ? 'n/a' : `${payload.backtest.averageAbsoluteErrorPct.toFixed(1)}%`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest opacity-70">Windows</div>
                  <div className="mt-0.5 font-semibold tabular-nums">{payload.backtest.sampleSize}</div>
                </div>
              </div>
              <div className="mt-2 text-xs leading-5 opacity-85">{payload.backtest.explanation}</div>
            </div>
            <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
              <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
                Evidence Quality
              </div>
              <div className="mt-2 text-sm font-medium text-[var(--cb-text-primary)]">
                {liveHeadlineCount > 0
                  ? `${liveHeadlineCount} live headline${liveHeadlineCount === 1 ? '' : 's'} in the overlay`
                  : strategicFallbackCount > 0
                    ? 'Using strategic watchlist fallback'
                    : 'No company-specific catalyst overlay'}
              </div>
              {topEvent ? (
                <div className="mt-1 text-xs leading-5 text-[var(--cb-text-muted)]">
                  PM overlay: {formatPctPoint(topEvent.forecastOverlayPct)} at {Math.round(topEvent.confidence * 100)}% confidence.
                </div>
              ) : (
                <div className="mt-1 text-xs leading-5 text-[var(--cb-text-muted)]">
                  Forecast is mostly the price model until a stronger catalyst appears.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {isPriceForecast && payload.technicals ? (
          <div className={`rounded-lg border p-3 ${verdictClass(payload.technicals.verdict)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest opacity-80">
                  Technical Confirmation
                </div>
                <div className="mt-1 text-sm font-semibold text-[var(--cb-text-primary)]">
                  {payload.technicals.verdict === 'confirms'
                    ? 'Technicals confirm the forecast'
                    : payload.technicals.verdict === 'conflicts'
                      ? 'Technicals conflict with the forecast'
                      : payload.technicals.verdict === 'mixed'
                        ? 'Technicals are mixed'
                        : 'Not enough technical history'}
                </div>
              </div>
              <div className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest">
                {payload.technicals.trendBias} trend
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">20D MA</div>
                <div className="mt-0.5 font-semibold tabular-nums">{formatPctStat(payload.technicals.priceVsMa20Pct)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">50D MA</div>
                <div className="mt-0.5 font-semibold tabular-nums">{formatPctStat(payload.technicals.priceVsMa50Pct)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">Momentum</div>
                <div className="mt-0.5 font-semibold tabular-nums">{formatPctStat(payload.technicals.momentum20dPct)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">Volatility</div>
                <div className="mt-0.5 font-semibold tabular-nums">{formatVolStat(payload.technicals.volatility30dPct)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">Volume</div>
                <div className="mt-0.5 font-semibold tabular-nums">{formatPctStat(payload.technicals.volumeTrendPct)}</div>
              </div>
            </div>
            <div className="mt-2 text-xs leading-5 opacity-85">{payload.technicals.explanation}</div>
          </div>
        ) : null}

        {payload.attributionExplanation ? (
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3 text-sm leading-6 text-[var(--cb-text-primary)]">
            {payload.attributionExplanation}
          </div>
        ) : null}

        {isPriceForecast && payload.newsWatch && payload.newsWatch.length > 0 ? (
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
                News to Watch
              </div>
              <div className="text-[10px] text-[var(--cb-text-muted)]">
                Same forecast window
              </div>
            </div>
            <div className="space-y-2">
              {payload.newsWatch.slice(0, 5).map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className="grid gap-2 border-t border-[var(--cb-border-subtle)] pt-2 first:border-t-0 first:pt-0 sm:grid-cols-[7rem_1fr]"
                >
                  <div className="text-xs font-medium text-[var(--cb-text-muted)]">
                    {item.timing ?? item.kind?.replace(/_/g, ' ') ?? 'watch'}
                  </div>
                  <div>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium leading-5 text-[var(--cb-text-primary)] hover:text-emerald-200"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <div className="text-sm font-medium leading-5 text-[var(--cb-text-primary)]">
                        {item.title}
                      </div>
                    )}
                    <div className="mt-0.5 text-xs leading-5 text-[var(--cb-text-muted)]">
                      {item.impact}
                      {item.source ? ` Source: ${item.source}.` : ''}
                    </div>
                    {item.sourceType === 'live_news' ? (
                      <div className="mt-1 inline-flex w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-emerald-200">
                        Live headline
                      </div>
                    ) : item.sourceType === 'strategic_fallback' ? (
                      <div className="mt-1 inline-flex w-fit rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber-200">
                        Strategic fallback
                      </div>
                    ) : null}
                    {item.rank ? (
                      <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                        Ranked {item.rank.score.toFixed(1)} · {item.rank.reason}
                      </div>
                    ) : null}
                    {item.eventForecast ? (
                      <div className="mt-2 grid gap-1.5 rounded-md border border-[var(--cb-border-subtle)] bg-black/15 p-2 text-xs leading-5">
                        <div>
                          <span className="font-medium text-[var(--cb-text-primary)]">Expected result: </span>
                          <span className="text-[var(--cb-text-muted)]">{item.eventForecast.expectedResult}</span>
                        </div>
                        {item.eventForecast.surpriseToWatch ? (
                          <div>
                            <span className="font-medium text-[var(--cb-text-primary)]">Watch for: </span>
                            <span className="text-[var(--cb-text-muted)]">{item.eventForecast.surpriseToWatch}</span>
                          </div>
                        ) : null}
                        {item.eventForecast.transmissionPath ? (
                          <div>
                            <span className="font-medium text-[var(--cb-text-primary)]">Why it moves the stock: </span>
                            <span className="text-[var(--cb-text-muted)]">{item.eventForecast.transmissionPath}</span>
                          </div>
                        ) : null}
                        {item.eventForecast.pmRead ? (
                          <div>
                            <span className="font-medium text-[var(--cb-text-primary)]">PM read: </span>
                            <span className="text-[var(--cb-text-muted)]">{item.eventForecast.pmRead.replace(/^PM read:\s*/i, '')}</span>
                          </div>
                        ) : null}
                        {item.eventForecast.pmBrain ? (
                          <div>
                            <span className="font-medium text-[var(--cb-text-primary)]">Agent brain: </span>
                            <span className="text-[var(--cb-text-muted)]">
                              {item.eventForecast.pmBrain.pmView} Overlay {formatPctPoint(item.eventForecast.pmBrain.forecastOverlayPct)} at {Math.round(item.eventForecast.pmBrain.confidence * 100)}% confidence. Invalidation: {item.eventForecast.pmBrain.invalidationSignal}
                            </span>
                          </div>
                        ) : null}
                        {item.eventForecast.institutional ? (
                          <div className="mt-1 grid gap-1 rounded border border-[var(--cb-border-subtle)] bg-black/10 p-2">
                            <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
                              Playbook: {item.eventForecast.institutional.playbook}
                            </div>
                            <div>
                              <span className="font-medium text-[var(--cb-text-primary)]">Priced: </span>
                              <span className="text-[var(--cb-text-muted)]">{item.eventForecast.institutional.whatPriced}</span>
                            </div>
                            <div>
                              <span className="font-medium text-[var(--cb-text-primary)]">Estimate risk: </span>
                              <span className="text-[var(--cb-text-muted)]">{item.eventForecast.institutional.estimateRevisionRisk}</span>
                            </div>
                            <div>
                              <span className="font-medium text-[var(--cb-text-primary)]">Multiple/positioning: </span>
                              <span className="text-[var(--cb-text-muted)]">
                                {item.eventForecast.institutional.multipleImpact} {item.eventForecast.institutional.positioningRisk}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-[var(--cb-text-primary)]">Overlay: </span>
                              <span className="text-[var(--cb-text-muted)]">{item.eventForecast.institutional.forecastOverlay}</span>
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <span className="font-medium text-[var(--cb-text-primary)]">Stock effect: </span>
                          <span className="text-[var(--cb-text-muted)]">{item.eventForecast.stockImpact}</span>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                          {item.eventForecast.direction}
                          {typeof item.eventForecast.priceImpactPct === 'number'
                            ? Math.abs(item.eventForecast.priceImpactPct) >= 0.05
                              ? ` · ${item.eventForecast.priceImpactPct > 0 ? '+' : ''}${item.eventForecast.priceImpactPct.toFixed(1)}% est. impact`
                              : item.eventForecast.priceImpactRangePct
                                ? ` · ${formatPctPoint(item.eventForecast.priceImpactRangePct.downside)} to ${formatPctPoint(item.eventForecast.priceImpactRangePct.upside)} scenario range`
                                : ' · low direct impact'
                            : ''}
                          {' '}· {Math.round(item.eventForecast.confidence * 100)}% confidence
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-[var(--cb-border-subtle)]">
          <div className="grid grid-cols-3 bg-black/20 px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            <span>{isPriceForecast ? 'Date' : 'Period'}</span>
            <span className="text-right">{isPriceForecast ? 'Projected Price' : 'Revenue'}</span>
            <span className="text-right">{isPriceForecast ? 'Model Band' : 'Growth'}</span>
          </div>
          {(isPriceForecast ? priceRows : revenueRows).map((row) => (
            <div
              key={row.period}
              className="grid grid-cols-3 border-t border-[var(--cb-border-subtle)] px-3 py-2 text-sm text-[var(--cb-text-primary)]"
            >
              <span>{row.period}</span>
              <span className="text-right tabular-nums">
                {isPriceForecast ? formatSharePrice(row.value) : formatCurrencyMillions(row.value)}
              </span>
              <span className="text-right tabular-nums">
                {isPriceForecast
                  ? 'lower' in row && row.lower !== null && row.upper !== null
                    ? `${formatSharePrice(row.lower)} - ${formatSharePrice(row.upper)}`
                    : 'n/a'
                  : 'growth' in row
                    ? formatPct(row.growth)
                    : 'n/a'}
              </span>
            </div>
          ))}
        </div>

        {payload.warning ? (
          <div className="text-xs leading-5 text-amber-300/90">{payload.warning}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
