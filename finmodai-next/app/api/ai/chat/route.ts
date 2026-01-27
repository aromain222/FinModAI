import { NextRequest, NextResponse } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import type { AnalystAnswer, AiToolResult } from '@/types/ai';
import { getModelContext } from '@/lib/ai/tools/getModelContext';
import { deriveDrivers } from '@/lib/ai/analysis/modelDrivers';
import { getMarketSnapshot } from '@/lib/ai/tools/getMarketSnapshot';
import { getSectorMomentum } from '@/lib/ai/tools/sector';
import { explainSectorMomentum } from '@/lib/ai/analysis/sectorExplain';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Mode = 'market' | 'macro';

const pct = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(2)}%`;
};

const matchSector = (query: string, sectors: any[]) => {
  const q = query.toLowerCase();
  const synonyms: Record<string, string> = {
    semis: 'Technology',
    semiconductor: 'Technology',
    semiconductors: 'Technology',
    tech: 'Technology',
    energy: 'Energy',
    financials: 'Financials',
    banks: 'Financials',
    utilities: 'Utilities',
    healthcare: 'Health Care',
    health: 'Health Care',
    staples: 'Consumer Staples',
    discretionary: 'Consumer Discretionary',
    industrials: 'Industrials',
    materials: 'Materials',
    realestate: 'Real Estate',
    communications: 'Communication Services',
    telecom: 'Communication Services',
  };

  const compact = q.replace(/\s+/g, '');
  if (synonyms[compact]) {
    const target = synonyms[compact];
    return sectors.find((s) => s.sector.toLowerCase() === target.toLowerCase());
  }

  for (const [key, value] of Object.entries(synonyms)) {
    if (q.includes(key)) {
      const target = value;
      const found = sectors.find((s) => s.sector.toLowerCase() === target.toLowerCase());
      if (found) return found;
    }
  }

  return sectors.find((s) => q.includes(s.sector.toLowerCase()));
};

function buildAnswer(tools: AiToolResult[], mode: Mode, range: string, lastUserMsg: string, includeSector: boolean): AnalystAnswer {
  const citedEvidence: AnalystAnswer['citedEvidence'] = [];
  const bullets: string[] = [];
  const nextActions: string[] = [];
  const warnings: string[] = [];

  const market = tools.find((t) => t.name === 'getMarketSnapshot' && t.data);
  if (market?.data) {
    if (market.data.unavailable) {
      bullets.push(`Market snapshot unavailable: ${market.data.reason || 'configuration missing'}.`);
      warnings.push(market.data.reason || 'Market data unavailable');
      citedEvidence.push({ label: 'Market snapshot', value: 'Unavailable', source: 'getMarketSnapshot' });
    } else {
      const idx = market.data.indices;
      const vol = market.data.vol?.VIX;
      const rates = market.data.rates;
      bullets.push(
        `Equities (${range}): SPY ${pct(idx.SPY.changePct)}, QQQ ${pct(idx.QQQ.changePct)}, DIA ${pct(idx.DIA.changePct)}.`
      );
      bullets.push(`Vol/Rates: VIX ${pct(vol?.changePct)}; 2Y ${pct(rates.twoY.changePct)}, 10Y ${pct(rates.tenY.changePct)}.`);
      citedEvidence.push({ label: 'SPY change', value: pct(idx.SPY.changePct), source: 'getMarketSnapshot.indices.SPY.changePct' });
      citedEvidence.push({ label: 'QQQ change', value: pct(idx.QQQ.changePct), source: 'getMarketSnapshot.indices.QQQ.changePct' });
      citedEvidence.push({ label: 'DIA change', value: pct(idx.DIA.changePct), source: 'getMarketSnapshot.indices.DIA.changePct' });
      citedEvidence.push({ label: 'VIX change', value: pct(vol?.changePct), source: 'getMarketSnapshot.vol.VIX.changePct' });
      citedEvidence.push({ label: '2Y change', value: pct(rates.twoY.changePct), source: 'getMarketSnapshot.rates.twoY.changePct' });
      citedEvidence.push({ label: '10Y change', value: pct(rates.tenY.changePct), source: 'getMarketSnapshot.rates.tenY.changePct' });
    }
  } else {
    bullets.push('Market snapshot unavailable: not returned by tools.');
    warnings.push('Market data unavailable');
    citedEvidence.push({ label: 'Market snapshot', value: 'Unavailable', source: 'getMarketSnapshot' });
  }

  const sectorTool = tools.find((t) => t.name === 'getSectorMomentum' && t.data);
  if (includeSector) {
    if (sectorTool?.data?.items?.length) {
      const sectors = sectorTool.data.items;
      const topRising = [...sectors].sort((a, b) => b.score - a.score).slice(0, 2);
      const topFalling = [...sectors].sort((a, b) => a.score - b.score).slice(0, 2);
      bullets.push(
        `Rising: ${topRising.map((s: any) => `${s.sector} score ${s.score}`).join('; ')}; Falling: ${topFalling
          .map((s: any) => `${s.sector} score ${s.score}`)
          .join('; ')}.`
      );
      topRising.forEach((s: any) =>
        citedEvidence.push({
          label: `${s.sector} score`,
          value: pct(s.score),
          source: 'getSectorMomentum.items',
        })
      );
      topFalling.forEach((s: any) =>
        citedEvidence.push({
          label: `${s.sector} score`,
          value: pct(s.score),
          source: 'getSectorMomentum.items',
        })
      );

      const target = matchSector(lastUserMsg, sectors);
      if (target) {
        const explained = explainSectorMomentum(target);
        bullets.push(`Focus: ${explained.summary}`);
        explained.drivers.slice(0, 2).forEach((d, idx) =>
          citedEvidence.push({
            label: `Driver ${idx + 1}`,
            value: d.label,
            source: `getSectorMomentum.items.${target.sector}.drivers`,
          })
        );
        explained.drags.slice(0, 2).forEach((d, idx) =>
          citedEvidence.push({
            label: `Drag ${idx + 1}`,
            value: d.label,
            source: `getSectorMomentum.items.${target.sector}.drags`,
          })
        );
      }
    } else {
      bullets.push('Sector momentum: Not available in CapitalBase yet.');
      warnings.push('Sector momentum unavailable');
      citedEvidence.push({ label: 'Sector momentum', value: 'Unavailable', source: 'getSectorMomentum' });
    }
  }

  const modelContext = tools.find((t) => t.name === 'getModelContext' && t.data);
  const drivers = tools.find((t) => t.name === 'modelDrivers' && t.data);
  if (modelContext?.data) {
    const m = modelContext.data;
    bullets.push(`Model ${m.ticker} ${m.modelType} scenario ${m.scenario}.`);
    const kr = m.keyResults;
    if (kr.pricePerShare !== null) {
      citedEvidence.push({
        label: 'Price per share',
        value: String(kr.pricePerShare),
        source: 'getModelContext.keyResults.pricePerShare',
      });
    }
    if (kr.wacc !== null) {
      citedEvidence.push({
        label: 'WACC',
        value: String(kr.wacc),
        source: 'getModelContext.keyResults.wacc',
      });
    }
  }
  if (drivers?.data?.drivers?.length) {
    bullets.push(`Key drivers: ${drivers.data.drivers.slice(0, 2).map((d: any) => d.detail).join(' ')}`);
    drivers.data.drivers.slice(0, 2).forEach((d: any, idx: number) =>
      citedEvidence.push({
        label: `Driver ${idx + 1}`,
        value: d.detail,
        source: `modelDrivers.drivers[${idx}]`,
      })
    );
  }
  if (drivers?.data?.risks?.length) {
    bullets.push(`Risks: ${drivers.data.risks.slice(0, 2).map((r: any) => r.detail).join(' ')}`);
    drivers.data.risks.slice(0, 2).forEach((r: any, idx: number) =>
      citedEvidence.push({
        label: `Risk ${idx + 1}`,
        value: r.detail,
        source: `modelDrivers.risks[${idx}]`,
      })
    );
  }

  if (tools.some((t) => t.error || t.unavailable)) {
    nextActions.push('Verify data sources and retry.');
  }
  if (includeSector) {
    nextActions.push('Open Macro IQ for sector evidence.');
  } else {
    nextActions.push('Open Flow & Regime for microstructure detail.');
  }
  if (modelContext?.data) {
    nextActions.push('Download workbook to validate assumptions.');
  }

  const hasFailures = tools.some((t) => t.error || t.unavailable || t.data?.unavailable);
  const confidence = hasFailures ? 'medium' : 'high';

  return {
    answer: `Grounded ${mode === 'macro' ? 'macro and sector' : 'market'} view for ${range}, citing live CapitalBase data.`,
    bullets: bullets.slice(0, 8),
    citedEvidence: citedEvidence.length
      ? citedEvidence
      : [{ label: 'Data', value: 'No tool data available', source: 'tools' }],
    confidence,
    nextActions: nextActions.slice(0, 5),
    warnings: warnings.length ? warnings : undefined,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages = (body?.messages || []) as ChatMessage[];
  const context = body?.context || {};
  const range = context.range || '1M';
  const modelId = context.modelId;
  const mode: Mode = context.mode === 'macro' ? 'macro' : 'market';
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const sectorHint = /sector|semi|tech|energy|financial|industrial|utility|health|materials|discretionary|staples|real estate|communication/i;
  const includeSector = mode === 'macro' || sectorHint.test(lastUserMsg);

  const supabase = supabaseRouteClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const toolResults: AiToolResult[] = [];

  if (mode === 'market' || mode === 'macro') {
    const snap = await getMarketSnapshot(range);
    if (snap.ok) {
      toolResults.push({ name: 'getMarketSnapshot', data: snap.data });
    } else {
      toolResults.push({ name: 'getMarketSnapshot', error: snap.error, unavailable: true });
    }
  }

  if (includeSector) {
    const sectorRes = await getSectorMomentum(range);
    if (sectorRes.ok) {
      toolResults.push({ name: 'getSectorMomentum', data: sectorRes.data });
    } else {
      toolResults.push({ name: 'getSectorMomentum', error: sectorRes.error, unavailable: true });
    }
  }

  if (modelId) {
    const ctx = await getModelContext(modelId);
    if (ctx.ok && ctx.data) {
      const drivers = deriveDrivers(ctx.data.keyResults);
      toolResults.push({ name: 'getModelContext', data: ctx.data });
      toolResults.push({ name: 'modelDrivers', data: drivers });
    } else {
      toolResults.push({ name: 'getModelContext', error: ctx.error, unavailable: true });
    }
  }

  const response = buildAnswer(toolResults, mode, range, lastUserMsg, includeSector);

  // log
  try {
    await supabase.from('chat_runs').insert({
      user_id: session?.user?.id ?? null,
      messages,
      tool_context: toolResults,
    });
  } catch (error) {
    console.warn('[chat] log failed', error);
  }

  return NextResponse.json({ response, tools: toolResults });
}
