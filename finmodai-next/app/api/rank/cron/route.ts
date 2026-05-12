/**
 * GET /api/rank/cron
 *
 * Called by Vercel Cron every 10 minutes.
 * Scores the next BATCH_PER_RUN tickers from the full watchlist and
 * upserts results into the ranked_stocks Supabase table.
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}.
 * Vercel automatically sets Authorization: Bearer ${CRON_SECRET} on
 * internally-triggered cron requests, so no manual token management needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { scoreMultiple } from '@/lib/ranking/score';
import { writeCache, readCronOffset, writeCronOffset } from '@/lib/ranking/rankCache';
import { mockFallback } from '@/lib/ranking/mock';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

// Score this many tickers per cron invocation (~15–25s with BATCH_SIZE=72)
const BATCH_PER_RUN = 200;

// Full watchlist — keep in sync with route.ts DEFAULT_WATCHLIST
const FULL_WATCHLIST = [
  'SOFI', 'HOOD', 'COIN', 'PLTR', 'AMD',
  'NVDA', 'TSLA', 'META', 'AMZN', 'GOOGL',
  'MSFT', 'AAPL', 'UBER', 'SHOP', 'SNOW',
  'NFLX', 'ROKU', 'AFRM', 'SQ', 'PYPL',
  'CRWD', 'DDOG', 'NET', 'MDB', 'NOW',
  'ORCL', 'AVGO', 'TSM', 'ASML', 'ARM',
  'MU', 'INTC', 'QCOM', 'SMCI', 'PANW',
  'ZS', 'OKTA', 'TEAM', 'ABNB', 'DASH',
  'BKNG', 'MELI', 'SPOT', 'DIS', 'LLY',
  'NVO', 'JPM', 'GS', 'V', 'MA',
  'CRM', 'ADBE', 'INTU', 'ADSK', 'WDAY',
  'SNPS', 'CDNS', 'ANET', 'DELL', 'HPE',
  'HPQ', 'STX', 'WDC', 'TXN', 'ADI',
  'NXPI', 'MRVL', 'LRCX', 'KLAC', 'AMAT',
  'ON', 'MPWR', 'TER', 'ENPH', 'FSLR',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG',
  'OXY', 'LNG', 'NEE', 'DUK', 'SO',
  'GE', 'HON', 'CAT', 'DE', 'ETN',
  'EMR', 'PH', 'BA', 'LMT', 'RTX',
  'WMT', 'COST', 'TGT', 'HD', 'LOW',
  'NKE', 'SBUX', 'MCD', 'CMG', 'YUM',
  'KO', 'PEP', 'PG', 'CL', 'EL',
  'LULU', 'TJX', 'ULTA', 'RCL', 'CCL',
  'BAC', 'C', 'MS', 'BLK', 'SCHW',
  'AXP', 'COF', 'ALLY', 'DFS', 'KKR',
  'BX', 'APO', 'ICE', 'CME', 'SPGI',
  'MCO', 'BRK.B', 'TROW', 'USB', 'PNC',
  'UNH', 'HUM', 'CI', 'ELV', 'CVS',
  'ABBV', 'MRK', 'PFE', 'BMY', 'GILD',
  'AMGN', 'REGN', 'VRTX', 'ISRG', 'SYK',
  'MDT', 'TMO', 'DHR', 'BSX', 'ZBH',
  'PDD', 'BABA', 'BIDU', 'JD', 'SE',
  'MSTR', 'RIOT', 'MARA', 'UPST', 'LCID',
  'RBLX', 'PINS', 'SNAP', 'ZM', 'DOCU',
  'FVRR', 'UPWK', 'ETSY', 'EBAY', 'W',
  'CVNA', 'CAR', 'GME', 'AMC', 'CHWY',
  'CAVA', 'SG', 'WING', 'DPZ', 'BROS',
  'CELH', 'MNST', 'KDP', 'TAP', 'STZ',
  'PM', 'MO', 'BTI', 'AI', 'PATH',
  'GTLB', 'CFLT', 'ESTC', 'DT', 'S',
  'PCOR', 'BILL', 'PAYC', 'TOST', 'FOUR',
  'GDDY', 'HUBS', 'APP', 'TTD', 'DOCS',
  'TEM', 'DUOL', 'U', 'TTWO', 'EA',
  'MRNA', 'BNTX', 'BIIB', 'ILMN', 'ALNY',
  'CRSP', 'BEAM', 'NTLA', 'VCYT', 'EXAS',
  'GH', 'NVCR', 'IOVA', 'VKTX', 'RXRX',
  'SDGR', 'WAL', 'FITB', 'KEY', 'RF',
  'TFC', 'HBAN', 'CMA', 'ZION', 'MTB',
  'PLD', 'AMT', 'CCI', 'EQIX', 'O',
  'SPG', 'VICI', 'PSA', 'FCX', 'NEM',
  'GOLD', 'AA', 'NUE', 'STLD', 'CLF',
  'X', 'SCCO', 'ALB', 'LAC', 'HAL',
  'BKR', 'DVN', 'FANG', 'EQT', 'CTRA',
  'WMB', 'KMI', 'ENB', 'TRP', 'NOC',
  'GD', 'HII', 'TDG', 'DAL', 'UAL',
  'AAL', 'LUV', 'FDX', 'UPS', 'CSX',
  'UNP', 'NSC', 'GM', 'F', 'RIVN',
  'NIO', 'LI', 'XPEV',
  'T', 'VZ', 'TMUS', 'CHTR', 'CMCSA', 'LBRDK', 'WBD', 'PARA',
  'JNJ', 'ABT', 'ZTS', 'GEHC', 'BAX', 'BDX', 'WAT', 'A',
  'PODD', 'DXCM', 'INSP', 'IRTC', 'ALGN', 'HOLX', 'IDXX',
  'MTD', 'IQV', 'CRL', 'LH', 'DGX', 'HSIC', 'PDCO',
  'TRV', 'CB', 'ALL', 'AIG', 'AFL', 'MET', 'PRU', 'HIG',
  'RE', 'CINF', 'RNR', 'ACGL', 'LPLA', 'IBKR', 'MKTX', 'VIRT',
  'WFC', 'STT', 'BK', 'NTRS',
  'ITW', 'IR', 'GRMN', 'ROP', 'FTV', 'AME', 'XYL', 'OTIS',
  'CARR', 'TT', 'AXON', 'LDOS', 'SAIC', 'BAH', 'KTOS', 'HEI',
  'TDY', 'BWA', 'LEA', 'MGA', 'APTV',
  'LIN', 'APD', 'ECL', 'SHW', 'PPG', 'CE', 'EMN', 'IFF',
  'RPM', 'HUN', 'FMC', 'MOS', 'CF', 'NTR',
  'AEP', 'EXC', 'PCG', 'XEL', 'ES', 'AWK', 'CNP', 'WEC',
  'CMS', 'DTE', 'PPL', 'AES', 'FE', 'D',
  'FIVE', 'DG', 'DLTR', 'BBWI', 'RL', 'PVH', 'CPRI', 'FL',
  'GPS', 'ANF', 'AEO', 'URBN',
  'QSR', 'TXRH', 'DNUT', 'SHAK',
  'KHC', 'GIS', 'CPB', 'SJM', 'MKC', 'HSY', 'MDLZ', 'CAG',
  'WBA', 'HLT', 'MAR', 'H',
  'WPC', 'NNN', 'STAG', 'REXR', 'ELS', 'SUI', 'INVH', 'LXP',
  'ARE', 'CBRE', 'JLL',
  'ZI', 'BRZE', 'NTNX', 'PSTG', 'RAMP', 'CWAN', 'NCNO',
  'MSCI', 'VRSK', 'FDS', 'FICO', 'TYL', 'MANH', 'VEEV', 'SPSC',
  'ENTG', 'ONTO', 'ACLS', 'SWKS', 'QRVO', 'MCHP', 'SITM',
  'SAP', 'AZN', 'GSK', 'SNY', 'NVS', 'UL', 'BP',
  'SHEL', 'TTE', 'VALE', 'RIO', 'BHP', 'TM', 'HMC', 'SONY',
  'NTES', 'TCEHY', 'GRAB', 'DKNG', 'WIX',
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify Vercel cron signature or manual secret
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const total  = FULL_WATCHLIST.length;

  // Read current offset, score next slice, advance
  const offset = await readCronOffset();
  const end    = Math.min(offset + BATCH_PER_RUN, total);
  const batch  = FULL_WATCHLIST.slice(offset, end);
  const next   = end >= total ? 0 : end;

  let scored;
  try {
    scored = await scoreMultiple(batch, origin, 6);
  } catch {
    scored = batch.map(t => mockFallback(t, 6));
  }

  await writeCache(scored);
  await writeCronOffset(next);

  return NextResponse.json({
    ok: true,
    scored: scored.length,
    offset,
    next,
    total,
    cycleComplete: next === 0,
  });
}
