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

function qualityLabel(quality: string): string {
  if (quality === 'strong') return 'Reliable';
  if (quality === 'weak') return 'Use with caution';
  if (quality === 'mixed') return 'Mixed track record';
  return quality;
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

function directionLabel(d: string): string {
  if (d === 'positive') return '↑ Positive for stock';
  if (d === 'negative') return '↓ Negative for stock';
  return '→ Likely neutral';
}

function signalLabel(signal: string): string {
  if (signal === 'LONG') return 'BUY ↑';
  if (signal === 'SHORT') return 'SELL ↓';
  return 'HOLD →';
}

function signalExplain(signal: string, returnPct?: number | null): string {
  const pctStr = returnPct != null && Number.isFinite(returnPct)
    ? ` (${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}% forecast)`
    : '';
  if (signal === 'LONG') return `TimesFM + events forecast a rise${pctStr}. Consider buying.`;
  if (signal === 'SHORT') return `TimesFM + events forecast a decline${pctStr}. Consider reducing exposure.`;
  return `The combined forecast${pctStr} is small — no strong reason to buy or sell right now.`;
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
  const llmDiscoveryCount = payload.newsWatch?.filter((item) => item.sourceType === 'llm_discovery').length ?? 0;
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

        {/* Key numbers */}
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
              {isPriceForecast ? 'Expected Move' : 'Implied CAGR'}
            </div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${
              returnPct == null ? 'text-[var(--cb-text-primary)]'
              : returnPct > 0 ? 'text-emerald-300'
              : returnPct < 0 ? 'text-red-300'
              : 'text-[var(--cb-text-primary)]'
            }`}>
              {formatPct(isPriceForecast ? returnPct : payload.cagr)}
            </div>
          </div>
        </div>

        <ForecastSparkline
          forecast={payload.forecast}
          historical={payload.historical}
          lower={payload.lower}
          upper={payload.upper}
          title={isPriceForecast ? 'Projected Price Path' : 'Forecast Path'}
          historicalLabel={isPriceForecast ? 'Recent price' : 'Historical'}
          forecastLabel={isPriceForecast ? 'Projected price' : 'Forecast'}
          forecastTone={returnPct == null ? 'neutral' : returnPct < 0 ? 'negative' : returnPct > 0 ? 'positive' : 'neutral'}
        />

        {/* Forecast accuracy + news used */}
        {isPriceForecast && payload.backtest ? (
          <div className="grid gap-3 sm:grid-cols-[1.15fr_1fr]">
            <div className={`rounded-lg border p-3 ${qualityClass(payload.backtest.quality)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] font-medium uppercase tracking-widest opacity-80">
                  Forecast Accuracy
                </div>
                <div className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest">
                  {qualityLabel(payload.backtest.quality)}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-widest opacity-70">Right direction</div>
                  <div className="mt-0.5 font-semibold tabular-nums">{formatHitRate(payload.backtest.directionHitRate)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest opacity-70">Typical error</div>
                  <div className="mt-0.5 font-semibold tabular-nums">
                    {payload.backtest.averageAbsoluteErrorPct === null ? 'n/a' : `${payload.backtest.averageAbsoluteErrorPct.toFixed(1)}%`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest opacity-70">Periods tested</div>
                  <div className="mt-0.5 font-semibold tabular-nums">{payload.backtest.sampleSize}</div>
                </div>
              </div>
              <div className="mt-2 text-xs leading-5 opacity-85">{payload.backtest.explanation}</div>
            </div>
            <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
              <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
                News & Events Used
              </div>
              <div className="mt-2 text-sm font-medium text-[var(--cb-text-primary)]">
                {liveHeadlineCount > 0
                  ? `${liveHeadlineCount} live headline${liveHeadlineCount === 1 ? '' : 's'} factored in`
                  : llmDiscoveryCount > 0
                    ? `${llmDiscoveryCount} AI-researched event${llmDiscoveryCount === 1 ? '' : 's'} factored in`
                    : 'Using general market themes'}
              </div>
              {topEvent ? (
                <div className="mt-1 text-xs leading-5 text-[var(--cb-text-muted)]">
                  AI price adjustment: {formatPctPoint(topEvent.forecastOverlayPct)} ({Math.round(topEvent.confidence * 100)}% confidence)
                </div>
              ) : (
                <div className="mt-1 text-xs leading-5 text-[var(--cb-text-muted)]">
                  Price model is the main driver — no strong event signal yet.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Chart signals */}
        {isPriceForecast && payload.technicals ? (
          <div className={`rounded-lg border p-3 ${verdictClass(payload.technicals.verdict)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest opacity-80">
                  Chart Signals
                </div>
                <div className="mt-1 text-sm font-semibold text-[var(--cb-text-primary)]">
                  {payload.technicals.verdict === 'confirms'
                    ? 'Charts support the forecast ✓'
                    : payload.technicals.verdict === 'conflicts'
                      ? 'Charts point the opposite direction ⚠'
                      : payload.technicals.verdict === 'mixed'
                        ? 'Charts are sending mixed signals'
                        : 'Not enough chart history'}
                </div>
              </div>
              <div className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest">
                {payload.technicals.trendBias} trend
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">vs 20-day avg</div>
                <div className="mt-0.5 font-semibold tabular-nums">{formatPctStat(payload.technicals.priceVsMa20Pct)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">vs 50-day avg</div>
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
                <div className="text-[10px] uppercase tracking-widest opacity-70">Volume trend</div>
                <div className="mt-0.5 font-semibold tabular-nums">{formatPctStat(payload.technicals.volumeTrendPct)}</div>
              </div>
            </div>
            <div className="mt-2 text-xs leading-5 opacity-85">{payload.technicals.explanation}</div>
          </div>
        ) : null}

        {/* How the forecast was built */}
        {payload.attributionExplanation ? (
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3 text-sm leading-6 text-[var(--cb-text-primary)]">
            {payload.attributionExplanation}
          </div>
        ) : null}

        {/* Events to watch */}
        {isPriceForecast && payload.newsWatch && payload.newsWatch.length > 0 ? (
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
                  Events to Watch
                </div>
                <div className="mt-0.5 text-xs text-[var(--cb-text-muted)]">
                  Things that could move this stock in the forecast window
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {payload.newsWatch.slice(0, 5).map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className="rounded-md border border-[var(--cb-border-subtle)] bg-black/10 p-3"
                >
                  {/* Timing + badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    {item.timing && item.timing !== 'watch' ? (
                      <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
                        {item.timing === 'ongoing' ? 'Ongoing' : item.timing}
                      </span>
                    ) : null}
                    {item.sourceType === 'live_news' ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-emerald-200">
                        Live news
                      </span>
                    ) : item.sourceType === 'llm_discovery' ? (
                      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-sky-200">
                        AI researched
                      </span>
                    ) : item.sourceType === 'calendar' ? (
                      <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-violet-200">
                        Scheduled event
                      </span>
                    ) : null}
                  </div>

                  {/* Title */}
                  <div className="mt-1.5">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold leading-5 text-[var(--cb-text-primary)] hover:text-emerald-200"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <div className="text-sm font-semibold leading-5 text-[var(--cb-text-primary)]">
                        {item.title}
                      </div>
                    )}
                  </div>

                  {/* Plain-English impact */}
                  <div className="mt-1 text-xs leading-5 text-[var(--cb-text-muted)]">
                    {item.impact}
                  </div>

                  {/* Event forecast details */}
                  {item.eventForecast ? (
                    <div className="mt-2 space-y-1.5 rounded-md border border-[var(--cb-border-subtle)] bg-black/15 p-2.5 text-xs leading-5">

                      {/* Scenario range (from hedge fund engine) */}
                      {item.eventForecast.priceImpactRangePct ? (
                        <div className="flex flex-wrap gap-3 pb-1.5 border-b border-[var(--cb-border-subtle)]">
                          <div className="text-center">
                            <div className="text-[10px] uppercase tracking-widest text-emerald-300/70">Best case</div>
                            <div className="font-semibold text-emerald-300">
                              {formatPctPoint(item.eventForecast.priceImpactRangePct.upside)}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Most likely</div>
                            <div className={`font-semibold ${item.eventForecast.priceImpactPct && item.eventForecast.priceImpactPct >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                              {typeof item.eventForecast.priceImpactPct === 'number'
                                ? formatPctPoint(item.eventForecast.priceImpactPct)
                                : 'n/a'}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] uppercase tracking-widest text-red-300/70">Worst case</div>
                            <div className="font-semibold text-red-300">
                              {formatPctPoint(item.eventForecast.priceImpactRangePct.downside)}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {item.eventForecast.expectedResult ? (
                        <div>
                          <span className="font-medium text-[var(--cb-text-primary)]">What to expect: </span>
                          <span className="text-[var(--cb-text-muted)]">{item.eventForecast.expectedResult}</span>
                        </div>
                      ) : null}

                      {item.eventForecast.surpriseToWatch ? (
                        <div>
                          <span className="font-medium text-[var(--cb-text-primary)]">Watch for: </span>
                          <span className="text-[var(--cb-text-muted)]">
                            {item.eventForecast.surpriseToWatch.replace(/^Key driver:\s*/i, '')}
                          </span>
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
                          <span className="font-medium text-[var(--cb-text-primary)]">Analyst note: </span>
                          <span className="text-[var(--cb-text-muted)]">{item.eventForecast.pmRead.replace(/^PM read:\s*/i, '')}</span>
                        </div>
                      ) : null}

                      {item.eventForecast.pmBrain ? (
                        <div>
                          <span className="font-medium text-[var(--cb-text-primary)]">AI outlook: </span>
                          <span className="text-[var(--cb-text-muted)]">
                            {item.eventForecast.pmBrain.pmView
                              .replace(/Bull /g, 'Best case ')
                              .replace(/Base /g, 'Base case ')
                              .replace(/Bear /g, 'Worst case ')}
                            {' '}({Math.round(item.eventForecast.pmBrain.confidence * 100)}% confidence)
                          </span>
                        </div>
                      ) : null}

                      {item.eventForecast.pmBrain?.invalidationSignal ? (
                        <div>
                          <span className="font-medium text-[var(--cb-text-primary)]">This changes if: </span>
                          <span className="text-[var(--cb-text-muted)]">
                            {item.eventForecast.pmBrain.invalidationSignal.replace(/^Invalidate if\s*/i, '')}
                          </span>
                        </div>
                      ) : null}

                      {item.eventForecast.institutional ? (
                        <div className="mt-1 grid gap-1 rounded border border-[var(--cb-border-subtle)] bg-black/10 p-2">
                          {item.eventForecast.institutional.whatPriced ? (
                            <div>
                              <span className="font-medium text-[var(--cb-text-primary)]">Already priced in: </span>
                              <span className="text-[var(--cb-text-muted)]">{item.eventForecast.institutional.whatPriced}</span>
                            </div>
                          ) : null}
                          {item.eventForecast.institutional.estimateRevisionRisk ? (
                            <div>
                              <span className="font-medium text-[var(--cb-text-primary)]">Earnings impact: </span>
                              <span className="text-[var(--cb-text-muted)]">{item.eventForecast.institutional.estimateRevisionRisk}</span>
                            </div>
                          ) : null}
                          {item.eventForecast.stockImpact ? (
                            <div>
                              <span className="font-medium text-[var(--cb-text-primary)]">Stock effect: </span>
                              <span className="text-[var(--cb-text-muted)]">{item.eventForecast.stockImpact}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        item.eventForecast.stockImpact && !item.eventForecast.priceImpactRangePct ? (
                          <div>
                            <span className="font-medium text-[var(--cb-text-primary)]">Stock effect: </span>
                            <span className="text-[var(--cb-text-muted)]">{item.eventForecast.stockImpact}</span>
                          </div>
                        ) : null
                      )}

                      {/* Direction + confidence footer */}
                      <div className="pt-1 text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                        {directionLabel(item.eventForecast.direction)}
                        {typeof item.eventForecast.priceImpactPct === 'number' && !item.eventForecast.priceImpactRangePct
                          ? Math.abs(item.eventForecast.priceImpactPct) >= 0.05
                            ? ` · est. ${formatPctPoint(item.eventForecast.priceImpactPct)}`
                            : ' · low direct impact'
                          : ''}
                        {' '}· {Math.round(item.eventForecast.confidence * 100)}% confidence
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Price table */}
        <div className="overflow-hidden rounded-lg border border-[var(--cb-border-subtle)]">
          <div className="grid grid-cols-3 bg-black/20 px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            <span>{isPriceForecast ? 'Date' : 'Period'}</span>
            <span className="text-right">{isPriceForecast ? 'Projected Price' : 'Revenue'}</span>
            <span className="text-right">{isPriceForecast ? 'Likely Range' : 'Growth'}</span>
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
              <span className="text-right tabular-nums text-[var(--cb-text-muted)]">
                {isPriceForecast
                  ? 'lower' in row && row.lower !== null && row.upper !== null
                    ? `${formatSharePrice(row.lower)} – ${formatSharePrice(row.upper)}`
                    : 'n/a'
                  : 'growth' in row
                    ? formatPct(row.growth)
                    : 'n/a'}
              </span>
            </div>
          ))}
        </div>

        {/* Recommendation */}
        {isPriceForecast && payload.tradingSignal ? (
          <div className={`rounded-lg border p-4 ${
            payload.tradingSignal.signal === 'LONG'
              ? 'border-emerald-400/25 bg-emerald-400/10'
              : payload.tradingSignal.signal === 'SHORT'
              ? 'border-red-400/25 bg-red-400/10'
              : 'border-[var(--cb-border-subtle)] bg-black/10'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
                Forecast Recommendation
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-bold tracking-wide ${
                payload.tradingSignal.signal === 'LONG'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : payload.tradingSignal.signal === 'SHORT'
                  ? 'bg-red-500/20 text-red-300'
                  : 'bg-zinc-500/20 text-zinc-300'
              }`}>
                {signalLabel(payload.tradingSignal.signal)}
              </span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[var(--cb-text-muted)]">
              {signalExplain(payload.tradingSignal.signal, payload.returnPct != null ? payload.returnPct * 100 : null)}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Confidence level</div>
                <div className="mt-0.5 font-semibold tabular-nums">{Math.round(payload.tradingSignal.conviction * 100)}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Suggested portfolio allocation</div>
                <div className="mt-0.5 font-semibold tabular-nums">{payload.tradingSignal.positionSizePct.toFixed(1)}% of portfolio</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Time horizon</div>
                <div className="mt-0.5 font-semibold">{payload.tradingSignal.horizon}</div>
              </div>
              {payload.combinedEventImpactPct !== null && payload.combinedEventImpactPct !== undefined ? (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Event-driven impact</div>
                  <div className={`mt-0.5 font-semibold tabular-nums ${payload.combinedEventImpactPct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {payload.combinedEventImpactPct >= 0 ? '+' : ''}{payload.combinedEventImpactPct.toFixed(1)}%
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Top risks */}
        {isPriceForecast && payload.riskProfile && payload.riskProfile.topRisks.length > 0 ? (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
            <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
              Top Risks to Be Aware Of
            </div>
            <ul className="mt-2 space-y-1.5">
              {payload.riskProfile.topRisks.map((risk, i) => (
                <li key={i} className="flex gap-2 text-xs leading-5 text-[var(--cb-text-primary)]">
                  <span className="mt-0.5 shrink-0 text-amber-400">⚠</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
            {payload.riskProfile.invalidationTriggers.length > 0 ? (
              <div className="mt-2.5 border-t border-amber-400/15 pt-2 text-xs leading-5 text-[var(--cb-text-muted)]">
                <span className="font-medium text-amber-300/80">When this forecast changes: </span>
                {payload.riskProfile.invalidationTriggers[0]}
              </div>
            ) : null}
          </div>
        ) : null}

        {payload.warning ? (
          <div className="text-xs leading-5 text-amber-300/90">{payload.warning}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
