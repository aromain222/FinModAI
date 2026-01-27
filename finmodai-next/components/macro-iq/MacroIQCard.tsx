'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import type { MacroIQCard } from '@/lib/macro-iq/types';

type MacroIQCardProps = {
  card: MacroIQCard;
  index: number;
};

const eventTypeColors: Record<MacroIQCard['eventType'], string> = {
  CPI_PRINT: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  JOBS_REPORT: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  FOMC_UPDATE: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  OIL_SHOCK: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  GEOPOLITICS: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

const confidenceColors: Record<MacroIQCard['confidence'], string> = {
  LOW: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  MED: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  HIGH: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

export function MacroIQCardComponent({ card, index }: MacroIQCardProps) {
  const investorBriefBody = (() => {
    const lines = card.investorBrief.split('\n');
    if (lines[0] !== card.title) return card.investorBrief;
    const start = lines[1] === '' ? 2 : 1;
    return lines.slice(start).join('\n').trim();
  })();

  return (
    <Card className="rounded-2xl border border-white/5 bg-slate-950/70 backdrop-blur-sm p-6">
      {/* Title + Badges */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-1">{card.title}</h3>
          <Badge className={cn('text-xs px-2 py-0.5', eventTypeColors[card.eventType])}>
            {card.tag}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn('text-xs px-2 py-0.5', confidenceColors[card.confidence])}>
            {card.confidence}
          </Badge>
        </div>
      </div>

      {/* Investor Brief */}
      <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/40 p-4">
        <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Investor Brief</div>
        <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{investorBriefBody}</div>
      </div>

      {/* Market Transmission */}
      <Accordion type="single" collapsible className="mb-4">
        <AccordionItem value="market-transmission" className="border-white/5">
          <AccordionTrigger className="text-sm font-semibold text-slate-300 hover:no-underline">
            Market Transmission
          </AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-2 pt-2">
              {card.marketTransmission.bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="text-emerald-400 mt-0.5">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Sectors */}
      <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/40 p-4">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Sectors</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-emerald-300 mb-2">Winners</div>
            <div className="flex flex-wrap gap-1.5">
              {card.sectors.winners.map((sector, i) => (
                <Badge key={i} className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-xs px-2 py-0.5">
                  {sector}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-rose-300 mb-2">Losers</div>
            <div className="flex flex-wrap gap-1.5">
              {card.sectors.losers.map((sector, i) => (
                <Badge key={i} className="bg-rose-500/10 text-rose-300 border-rose-500/30 text-xs px-2 py-0.5">
                  {sector}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tickers to Watch */}
      <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/40 p-4">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Tickers to Watch</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-emerald-300 mb-2">Winners</div>
            <div className="flex flex-wrap gap-1.5">
              {card.tickersToWatch.winners.map((ticker, i) => (
                <Badge key={i} className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-xs px-2 py-0.5">
                  {ticker}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-rose-300 mb-2">Losers</div>
            <div className="flex flex-wrap gap-1.5">
              {card.tickersToWatch.losers.map((ticker, i) => (
                <Badge key={i} className="bg-rose-500/10 text-rose-300 border-rose-500/30 text-xs px-2 py-0.5">
                  {ticker}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scenarios */}
      <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/40 p-4">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Scenarios</div>
        <div className="space-y-3">
          {card.scenarios.map((scenario, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-200">{scenario.name}</span>
                <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/30 text-xs px-2 py-0">
                  {scenario.prob}%
                </Badge>
              </div>
              <p className="text-xs text-slate-300">{scenario.impact}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What to Watch */}
      <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/40 p-4">
        <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">What to Watch</div>
        <ul className="space-y-1.5">
          {card.whatToWatch.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Data Coverage */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400">Data:</span>
        <span className={cn('px-2 py-0.5 rounded', card.dataCoverage.news ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/50 text-slate-500')}>
          News {card.dataCoverage.news ? '✓' : '✗'}
        </span>
        <span className={cn('px-2 py-0.5 rounded', card.dataCoverage.macro ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/50 text-slate-500')}>
          Macro {card.dataCoverage.macro ? '✓' : '✗'}
        </span>
        <span className={cn('px-2 py-0.5 rounded', card.dataCoverage.prices ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/50 text-slate-500')}>
          Prices {card.dataCoverage.prices ? '✓' : '✗'}
        </span>
      </div>
    </Card>
  );
}
