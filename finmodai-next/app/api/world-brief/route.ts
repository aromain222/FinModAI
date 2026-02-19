import { NextRequest, NextResponse } from 'next/server';
import type { WorldBriefEventCard, WorldBriefResponseV2 } from '@/types/worldBrief';

export const dynamic = 'force-dynamic';

function nowUtc(): string {
  return new Date().toISOString();
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const region = (searchParams.get('region') || 'all').toLowerCase();
    const impactTag = (searchParams.get('tag') || 'all').toLowerCase();
    const timeframe = (searchParams.get('timeframe') || '').toLowerCase();
    const debug = searchParams.get('debug') === '1';
    const nowUtcIso = nowUtc();
    const clusterId = `world_brief_${nowUtcIso.slice(0, 10)}_${randomSuffix()}`;

    if (debug) {
      return NextResponse.json(
        {
          cluster_id: clusterId,
          now_utc: nowUtcIso,
          sources: [],
        },
        { status: 200 }
      );
    }

    const events: WorldBriefEventCard[] = [
      {
        event_id: `${clusterId}_1`,
        headline: 'U.S. CPI shows core inflation remains elevated',
        what_happened:
          'The latest CPI release showed headline inflation moderating slightly while core services and shelter remained elevated. Markets reacted with volatility as traders recalibrated the timing of Fed rate cuts.',
        why_it_matters:
          'Persistent core inflation reduces near-term rate-cut odds, supporting long-end yields and keeping discount rates elevated for equities. Sticky inflation also pressures real income growth and margin recovery expectations.',
        key_points: ['UST10Y ↑', 'UST2Y ↑', 'Growth Equities ↓', 'Financials ↑', 'USD ↑', 'Watch: PCE inflation, wage growth, Fed commentary'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Rates', 'Inflation', 'Equities', 'FX'],
        sources: [],
      },
      {
        event_id: `${clusterId}_2`,
        headline: 'Treasury auction demand weakens as bid-to-cover slips',
        what_happened:
          'A long-duration Treasury auction cleared with weaker-than-expected demand and lighter indirect bids, pushing yields higher intraday.',
        why_it_matters:
          'Soft auction demand implies higher compensation required to absorb issuance, lifting yields and tightening financial conditions even without policy changes. Higher term premia pressure equity valuations and mortgage rates.',
        key_points: ['UST30Y ↑', 'Mortgage Rates ↑', 'Real Estate ↓', 'Tech ↓', 'Watch: next auction demand, foreign reserve data, term premium indicators'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Rates', 'Liquidity', 'Credit'],
        sources: [],
      },
      {
        event_id: `${clusterId}_3`,
        headline: 'Weekly jobless claims dip, labor market stays resilient',
        what_happened:
          'Initial jobless claims declined week-over-week, signaling layoffs remain contained despite tighter financial conditions.',
        why_it_matters:
          'Labor resilience supports consumption but complicates the Fed’s easing path. Firm employment can keep services inflation elevated and delay rate-cut expectations.',
        key_points: ['UST2Y ↑', 'Consumer Discretionary ↑', 'Growth Equities ↓', 'USD ↑', 'Watch: nonfarm payrolls, wage growth, participation rate'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Labor', 'Rates', 'Growth', 'FX'],
        sources: [],
      },
      {
        event_id: `${clusterId}_4`,
        headline: 'OPEC+ reiterates production discipline amid uncertainty',
        what_happened:
          'OPEC+ officials reiterated commitments to production controls with no immediate output increases announced.',
        why_it_matters:
          'Constrained supply supports crude prices and sustains inflation risk through energy channels, benefiting energy equities while pressuring fuel-sensitive industries.',
        key_points: ['WTI ↑', 'Energy ↑', 'Airlines ↓', 'Industrials ↓', 'Watch: inventory data, shipping disruptions, compliance levels'],
        confidence: 'high',
        primary_regions: ['Global'],
        tags: ['Commodities', 'Energy', 'Inflation'],
        sources: [],
      },
      {
        event_id: `${clusterId}_5`,
        headline: 'Dollar extends gains as rate differentials widen',
        what_happened:
          'The U.S. dollar strengthened against major currencies as U.S. yields outpaced global peers following domestic macro data.',
        why_it_matters:
          'Dollar strength tightens global liquidity, pressures EM balance sheets, and weighs on USD-translated multinational earnings. Prolonged appreciation can dampen commodities.',
        key_points: ['DXY ↑', 'EMFX ↓', 'Commodities ↓', 'U.S. Multinationals ↓', 'Watch: ECB/BOJ signals, capital flows, global growth divergence'],
        confidence: 'high',
        primary_regions: ['Global'],
        tags: ['FX', 'Rates', 'Commodities', 'Growth'],
        sources: [],
      },
      {
        event_id: `${clusterId}_6`,
        headline: 'Fed officials reiterate higher-for-longer policy bias',
        what_happened:
          'Multiple Fed speakers emphasized patience in cutting rates, reinforcing inflation-risk vigilance and reducing early-easing odds.',
        why_it_matters:
          'Hawkish guidance lifts discount rates and suppresses equity multiples. Rate-sensitive sectors remain vulnerable if financial conditions tighten further.',
        key_points: ['UST Curve ↑', 'Growth Equities ↓', 'Financials ↑', 'Real Estate ↓', 'Watch: FOMC minutes, dot plot revisions'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Policy', 'Rates', 'Equities'],
        sources: [],
      },
      {
        event_id: `${clusterId}_7`,
        headline: 'Existing home sales miss as mortgage rates bite',
        what_happened:
          'Housing transaction volumes declined as elevated mortgage rates constrained affordability.',
        why_it_matters:
          'Housing is a key transmission channel for monetary policy. Weak turnover dampens construction demand and consumer spending momentum.',
        key_points: ['Homebuilders ↓', 'Mortgage REITs ↓', 'Banks ↕', 'Watch: mortgage rate trajectory, housing inventory'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Housing', 'Consumer', 'Rates'],
        sources: [],
      },
      {
        event_id: `${clusterId}_8`,
        headline: 'Core PCE remains above target, easing outlook delayed',
        what_happened:
          'Core PCE printed with modest but persistent price pressure, above target.',
        why_it_matters:
          'Sustained readings constrain the Fed’s flexibility for early easing and lift real yields, capping equity valuation upside.',
        key_points: ['Real Yields ↑', 'Growth ↓', 'USD ↑', 'Watch: services inflation, shelter trends'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Inflation', 'Rates', 'FX'],
        sources: [],
      },
      {
        event_id: `${clusterId}_9`,
        headline: 'China industrial output slows, global demand risks rise',
        what_happened:
          'China’s industrial production data indicated softer manufacturing momentum.',
        why_it_matters:
          'China is a key driver of global commodity demand. Slower output pressures metals and energy while weighing on EM and multinational earnings.',
        key_points: ['Copper ↓', 'Energy ↓', 'EM Equities ↓', 'Watch: stimulus measures, export data'],
        confidence: 'high',
        primary_regions: ['APAC'],
        tags: ['Growth', 'Commodities', 'Equities'],
        sources: [],
      },
      {
        event_id: `${clusterId}_10`,
        headline: 'Corporate credit issuance accelerates as firms lock funding',
        what_happened:
          'Investment-grade issuance picked up as issuers moved to secure current borrowing costs.',
        why_it_matters:
          'Robust issuance signals liquidity and demand but can pressure spreads near-term. Refinancing activity provides insight into balance sheet positioning.',
        key_points: ['IG Bonds ↑', 'Banks ↑', 'High Yield ↕', 'Watch: spread movements, default metrics'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Credit', 'Rates', 'Financials'],
        sources: [],
      },
      {
        event_id: `${clusterId}_11`,
        headline: 'Payrolls surprise higher, reinforcing labor resilience',
        what_happened:
          'Nonfarm payrolls exceeded consensus, underscoring economic momentum.',
        why_it_matters:
          'Strong hiring supports consumption but may delay easing. Wage pressures can sustain inflation risk, keeping rate sensitivity elevated.',
        key_points: ['UST2Y ↑', 'Consumer Discretionary ↑', 'Growth Stocks ↓', 'Watch: average hourly earnings, participation rate'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Labor', 'Rates', 'Growth'],
        sources: [],
      },
      {
        event_id: `${clusterId}_12`,
        headline: 'Global PMIs mixed as services expand, manufacturing soft',
        what_happened:
          'PMI data showed expansion in services with continued weakness in manufacturing across regions.',
        why_it_matters:
          'Sector divergence shapes supply chains and trade flows, pressuring industrial equities while supporting services-linked employment stability.',
        key_points: ['Industrials ↓', 'Services ↑', 'FX Volatility ↑', 'Watch: new orders, export components'],
        confidence: 'high',
        primary_regions: ['Global'],
        tags: ['Growth', 'Trade', 'FX'],
        sources: [],
      },
      {
        event_id: `${clusterId}_13`,
        headline: 'ECB holds rates steady as growth slows',
        what_happened:
          'The ECB kept policy rates unchanged while acknowledging economic deceleration.',
        why_it_matters:
          'Rate divergence versus the U.S. supports dollar strength and weighs on European equities. Bond markets may anticipate eventual easing.',
        key_points: ['EUR ↓', 'DXY ↑', 'European Equities ↓', 'Watch: Eurozone inflation, fiscal policy'],
        confidence: 'high',
        primary_regions: ['EMEA'],
        tags: ['Policy', 'FX', 'Equities'],
        sources: [],
      },
      {
        event_id: `${clusterId}_14`,
        headline: 'Energy inventory draw tightens crude balances',
        what_happened:
          'Weekly energy inventory data showed a larger-than-expected crude drawdown.',
        why_it_matters:
          'Tighter supply supports crude prices and can feed inflation expectations, benefiting energy equities while pressuring fuel-sensitive sectors.',
        key_points: ['WTI ↑', 'Energy ↑', 'Airlines ↓', 'Watch: demand trends, refinery utilization'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Commodities', 'Energy', 'Inflation'],
        sources: [],
      },
      {
        event_id: `${clusterId}_15`,
        headline: 'Yield curve steepens as long-end yields rise',
        what_happened:
          'The curve steepened with long-duration yields rising faster than short-term rates.',
        why_it_matters:
          'A steeper curve can lift bank NIMs but raises borrowing costs economy-wide and keeps pressure on rate-sensitive equity multiples.',
        key_points: ['Banks ↑', 'Real Estate ↓', 'Growth Stocks ↓', 'Watch: Treasury supply, inflation expectations'],
        confidence: 'high',
        primary_regions: ['US'],
        tags: ['Rates', 'Financials', 'Equities'],
        sources: [],
      },
    ];

    const response: WorldBriefResponseV2 = {
      cluster_id: clusterId,
      now_utc: nowUtcIso,
      region,
      tag: impactTag,
      timeframe,
      events,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error('[world-brief] error', error);
    return NextResponse.json(
      {
        cluster_id: `world_brief_${new Date().toISOString().slice(0, 10)}_${randomSuffix()}`,
        now_utc: nowUtc(),
        region: 'all',
        tag: 'all',
        timeframe: '72h',
        events: [],
      },
      { status: 500 }
    );
  }
}
