'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import type { MacroEvent } from '@/lib/view_models/macroEventBuilder';

type MacroEventCardProps = {
  event: MacroEvent;
  index: number;
};

const categoryColors: Record<MacroEvent['category'], string> = {
  CPI: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  FED: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  JOBS: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  OIL: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  GEOPOLITICS: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

const confidenceColors: Record<MacroEvent['confidence'], string> = {
  Low: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Medium: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  High: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

const bucketColors: Record<string, string> = {
  Equities: 'text-emerald-300',
  Rates: 'text-blue-300',
  'USD/FX': 'text-purple-300',
  Commodities: 'text-orange-300',
};

export function MacroEventCard({ event, index }: MacroEventCardProps) {
  // Check if event has new template structure
  const hasTemplateStructure = 'whatHappened' in event && 'marketImpact' in event && 'winnersLosers' in event;

  if (!hasTemplateStructure) {
    // Fallback to old structure (shouldn't happen after migration)
    return (
      <Card className="rounded-2xl border border-white/5 bg-slate-950/70 backdrop-blur-sm p-6">
        <div className="text-slate-400 text-sm">Event structure unavailable</div>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border border-white/5 bg-slate-950/70 backdrop-blur-sm p-6">
      {/* Title + Badges */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="flex-1 text-lg font-semibold text-white">{event.eventTitle}</h3>
        <div className="flex items-center gap-2">
          <Badge className={cn('text-xs px-2 py-0.5', categoryColors[event.category])}>
            {event.category}
          </Badge>
          {event.isBackfill && (
            <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-xs px-2 py-0.5">
              Template (No headline)
            </Badge>
          )}
          <Badge className={cn('text-xs px-2 py-0.5', confidenceColors[event.confidence])}>
            {event.confidence}
          </Badge>
        </div>
      </div>

      {/* What Happened */}
      <Accordion type="single" collapsible className="mb-4">
        <AccordionItem value="what-happened" className="border-white/5">
          <AccordionTrigger className="text-sm font-semibold text-slate-300 hover:no-underline">
            What Happened
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-2">
              <p className="text-sm text-slate-200 leading-relaxed">{event.whatHappened.oneLine}</p>
              {event.whatHappened.details.length > 0 && (
                <ul className="space-y-1.5">
                  {event.whatHappened.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-emerald-400 mt-0.5">•</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Market Impact */}
      <Accordion type="single" collapsible className="mb-4">
        <AccordionItem value="market-impact" className="border-white/5">
          <AccordionTrigger className="text-sm font-semibold text-slate-300 hover:no-underline">
            Market Impact
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              {event.marketImpact.map((impact, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-slate-900/40 p-3">
                  <div className={cn('text-xs font-semibold mb-2 uppercase tracking-wide', bucketColors[impact.bucket] || 'text-slate-300')}>
                    {impact.bucket}
                  </div>
                  <p className="text-xs text-slate-300 mb-2">{impact.shortTerm}</p>
                  <div className="text-xs text-slate-400">
                    {impact.watch.startsWith('Watch for') ? (
                      <span>{impact.watch}</span>
                    ) : (
                      <>
                        <span className="font-semibold">Watch for confirmation via:</span> {impact.watch}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Winners & Losers */}
      <Accordion type="single" collapsible className="mb-4">
        <AccordionItem value="winners-losers" className="border-white/5">
          <AccordionTrigger className="text-sm font-semibold text-slate-300 hover:no-underline">
            Winners & Losers
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              {/* Sectors Up */}
              {event.winnersLosers.sectorsUp.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-emerald-300 mb-2 uppercase tracking-wide">Most Sensitive Sectors (Up)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {event.winnersLosers.sectorsUp.map((sector, i) => (
                      <Badge key={i} className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-xs px-2 py-0.5">
                        {sector}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Sectors Down */}
              {event.winnersLosers.sectorsDown.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-rose-300 mb-2 uppercase tracking-wide">Most Sensitive Sectors (Down)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {event.winnersLosers.sectorsDown.map((sector, i) => (
                      <Badge key={i} className="bg-rose-500/10 text-rose-300 border-rose-500/30 text-xs px-2 py-0.5">
                        {sector}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Stocks to Watch */}
              {event.winnersLosers.stocksToWatch.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-blue-300 mb-2 uppercase tracking-wide">Stocks to Watch</div>
                  <div className="space-y-2">
                    {event.winnersLosers.stocksToWatch.map((stock, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-xs px-2 py-0.5">
                          {stock.ticker}
                        </Badge>
                        <span className="text-slate-300 flex-1">{stock.why}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Scenarios */}
      <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/40 p-4">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Scenarios</div>
        <div className="space-y-4">
          {event.scenarios.map((scenario, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-200">{scenario.name}</span>
                <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/30 text-xs px-2 py-0">
                  {scenario.prob}%
                </Badge>
              </div>
              
              {/* Assumptions */}
              {scenario.assumptions.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs text-slate-400 mb-1">Assumptions:</div>
                  <ul className="space-y-1">
                    {scenario.assumptions.map((assumption, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="text-slate-500 mt-0.5">•</span>
                        <span>{assumption}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Asset Moves */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-400">SPY:</span> <span className="text-slate-300">{scenario.assetMoves.SPY}</span></div>
                <div><span className="text-slate-400">VIX:</span> <span className="text-slate-300">{scenario.assetMoves.VIX}</span></div>
                <div><span className="text-slate-400">10Y:</span> <span className="text-slate-300">{scenario.assetMoves['10Y']}</span></div>
                <div><span className="text-slate-400">WTI:</span> <span className="text-slate-300">{scenario.assetMoves.WTI}</span></div>
                <div className="col-span-2"><span className="text-slate-400">Gold:</span> <span className="text-slate-300">{scenario.assetMoves.Gold}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sources */}
      {event.sources.length > 0 && (
        <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3">
          <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Sources</div>
          <div className="space-y-1">
            {event.sources.map((source, i) => (
              <div key={i} className="text-xs text-slate-300">
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                    {source.name}
                  </a>
                ) : (
                  <span>{source.name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
