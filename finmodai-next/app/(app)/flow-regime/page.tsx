"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

type FlowItem = {
  symbol: string;
  last: number;
  changePct: number;
  volumeShock: number;
  realizedVol: number;
  meta?: { sourceUsed?: string; stale?: boolean };
  points?: { t: number; v: number }[];
};

type Regime = {
  risk: string;
  volState: string;
  liquidity: string;
  summary: string;
  evidence: string[];
};

type SectorMomentum = {
  sector: string;
  score: number;
  direction: string;
  summary: string;
  drivers: { label: string; value: number; impact: number; evidence: string[] }[];
  drags: { label: string; value: number; impact: number; evidence: string[] }[];
  constituents: { symbol: string; score: number; movePct: number; volumeShock: number; evidence: string[] }[];
};

export default function FlowRegimePage() {
  const [indices, setIndices] = useState<FlowItem[]>([]);
  const [regime, setRegime] = useState<Regime | null>(null);
  const [sectors, setSectors] = useState<SectorMomentum[]>([]);
  const [flowLeaders, setFlowLeaders] = useState<FlowItem[]>([]);

  useEffect(() => {
    (async () => {
      const idxRes = await fetch("/api/market/index").then((r) => r.json());
      setIndices(idxRes.data || []);
      const flowRes = await fetch("/api/market/flow?symbols=AAPL,MSFT,NVDA,AMZN,TSLA,META,SPY,QQQ,DIA").then((r) => r.json());
      setFlowLeaders(flowRes.data || []);
      const regRes = await fetch("/api/market/regime").then((r) => r.json());
      setRegime(regRes.data || null);
      const secRes = await fetch("/api/market/sector-momentum").then((r) => r.json());
      setSectors(secRes.data || []);
    })();
  }, []);

  const indexTape = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {indices.map((idx) => (
        <Card key={idx.symbol} className="border border-white/10 bg-black/50 backdrop-blur p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-slate-400">{idx.symbol}</div>
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-200">
              {idx.meta?.sourceUsed || "databento"}
            </Badge>
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">${idx.last?.toFixed(2)}</div>
          <div className={cn("flex items-center gap-2 text-sm", idx.changePct >= 0 ? "text-emerald-300" : "text-rose-300")}>
            {idx.changePct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {idx.changePct?.toFixed(2)}%
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">Vol {idx.realizedVol?.toFixed(2)}</Badge>
            <Badge variant="outline" className="border-white/10 text-slate-300">Flow {idx.volumeShock?.toFixed(2)}</Badge>
          </div>
          {idx.points && idx.points.length > 0 && (
            <div className="mt-3 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={idx.points.map((p) => ({ t: p.t, v: p.v }))}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Line type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      ))}
    </div>
  );

  const regimeCard = regime ? (
    <Card className="border border-white/10 bg-black/60 backdrop-blur rounded-xl p-5">
      <div className="flex items-center gap-2 text-white text-lg font-semibold">
        <Activity className="h-5 w-5 text-emerald-400" />
        Market Regime
      </div>
      <p className="mt-2 text-slate-300">{regime.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">Risk: {regime.risk}</Badge>
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">Vol: {regime.volState}</Badge>
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">Liquidity: {regime.liquidity}</Badge>
      </div>
      <div className="mt-3 text-xs text-slate-400 space-y-1">
        {regime.evidence.map((e, idx) => (
          <div key={idx}>• {e}</div>
        ))}
      </div>
    </Card>
  ) : null;

  const flowLeadersList = (direction: "up" | "down") => {
    const filtered = flowLeaders
      .filter((f) => (direction === "up" ? f.changePct >= 0 : f.changePct < 0))
      .sort((a, b) => (direction === "up" ? b.changePct - a.changePct : a.changePct - b.changePct))
      .slice(0, 12);

    return (
      <Accordion type="single" collapsible className="space-y-2">
        {filtered.map((f) => (
          <AccordionItem key={f.symbol} value={`${direction}-${f.symbol}`} className="border border-white/10 rounded-lg bg-black/40">
            <AccordionTrigger className="px-3 py-2 text-sm text-white hover:bg-white/5">
              <div className="flex items-center gap-2">
                {direction === "up" ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-rose-400" />}
                <span className="font-semibold">{f.symbol}</span>
              </div>
              <div className={cn("text-sm", direction === "up" ? "text-emerald-300" : "text-rose-300")}>
                {f.changePct.toFixed(2)}% · Shock {f.volumeShock?.toFixed(2)}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 text-xs text-slate-300">
              <div className="flex gap-3 flex-wrap">
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">Vol {f.realizedVol?.toFixed(2)}</Badge>
                <Badge variant="outline" className="border-white/10 text-slate-300">Flow {f.volumeShock?.toFixed(2)}</Badge>
                {f.meta?.stale && <Badge variant="outline" className="border-amber-500/40 text-amber-200">Stale</Badge>}
              </div>
              <p className="mt-2 text-slate-400">Evidence: price move +{f.changePct.toFixed(2)}%, volume shock {f.volumeShock.toFixed(2)}, vol {f.realizedVol?.toFixed(2)}.</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  };

  const sectorList = (
    <Accordion type="single" collapsible className="space-y-2">
      {sectors.map((s) => (
        <AccordionItem key={s.sector} value={s.sector} className="border border-white/10 bg-black/40 rounded-lg">
          <AccordionTrigger className="px-4 py-3 text-left text-white hover:bg-white/5">
            <div>
              <div className="text-sm font-semibold">{s.sector}</div>
              <div className="text-xs text-slate-400">{s.summary}</div>
            </div>
            <Badge
              className={cn(
                "text-xs",
                s.direction === "up" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : s.direction === "down" ? "bg-rose-500/10 text-rose-200 border-rose-500/30" : "bg-slate-700/40 text-slate-200 border-slate-600/40"
              )}
            >
              {s.score}
            </Badge>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 text-sm text-slate-300 space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Why rising</div>
              <ul className="space-y-1 text-xs text-emerald-200">
                {s.drivers.slice(0, 4).map((d, idx) => (
                  <li key={idx}>• {d.label} (impact {d.impact.toFixed(2)})</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Why falling</div>
              <ul className="space-y-1 text-xs text-rose-200">
                {s.drags.slice(0, 4).map((d, idx) => (
                  <li key={idx}>• {d.label} (impact {d.impact.toFixed(2)})</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Constituents</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {s.constituents.slice(0, 8).map((c) => (
                  <div key={c.symbol} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 flex items-center justify-between">
                    <span>{c.symbol}</span>
                    <span className={cn(c.movePct >= 0 ? "text-emerald-300" : "text-rose-300")}>{c.movePct.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-500">What this score means: combines price move, volume shock, breadth, and vol. Clamped -100..100.</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black text-white px-4 py-8 md:px-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">CapitalBase</p>
          <h1 className="text-3xl font-semibold">Flow & Regime</h1>
          <p className="text-slate-400 text-sm">Databento-driven market microstructure dashboard.</p>
        </div>
        <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30">Databento</Badge>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Index Tape</h2>
        {indexTape}
      </div>

      {regimeCard && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Regime</h2>
          {regimeCard}
        </div>
      )}

      <Tabs defaultValue="leaders" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Flow Leaders</h2>
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="leaders">Trending Up</TabsTrigger>
            <TabsTrigger value="laggards">Trending Down</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="leaders">{flowLeadersList("up")}</TabsContent>
        <TabsContent value="laggards">{flowLeadersList("down")}</TabsContent>
      </Tabs>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Sector Momentum</h2>
        {sectors.length === 0 ? (
          <Card className="border border-white/10 bg-black/40 p-4 text-slate-300">Loading sector momentum...</Card>
        ) : (
          sectorList
        )}
      </div>

      <div className="mt-6">
        <AlertTriangle className="h-4 w-4 inline text-amber-400 mr-2" />
        <span className="text-xs text-slate-400">Databento calls are cached and may be stale in case of provider downtime.</span>
      </div>
    </div>
  );
}
