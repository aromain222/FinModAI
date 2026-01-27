import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'node:crypto';
import path from 'path';
import type { Facts } from '@/lib/facts/types';
import { createEmptyFacts, mergeFacts, toUpperTicker } from '@/lib/facts/normalize';

export const runtime = 'nodejs';

const YFINANCE_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'yf_facts.py');
const YFINANCE_TIMEOUT_MS = 8000;

/**
 * GET /api/facts/yfinance?ticker=AAPL
 * 
 * Dev-only endpoint to fetch facts via yfinance Python script.
 * In production, returns error indicating use of /api/facts instead.
 */
export async function GET(request: NextRequest) {
  const traceId = randomUUID();
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker');

  // Production guard
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        ok: false,
        error: 'YFINANCE_UNAVAILABLE',
        details: 'yfinance route unavailable in production; use /api/facts for provider abstraction',
        traceId,
      },
      { status: 400 }
    );
  }

  if (!ticker || ticker.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'TICKER_REQUIRED',
        details: 'ticker query parameter is required',
        traceId,
      },
      { status: 400 }
    );
  }

  const normalizedTicker = toUpperTicker(ticker);

  try {
    const facts = await fetchYfinanceFacts(normalizedTicker, traceId);
    return NextResponse.json(
      {
        ok: true,
        data: facts,
        traceId,
      },
      { status: 200 }
    );
  } catch (error: any) {
    const errorMessage = error?.message || String(error) || 'Unknown error';
    console.error('[yfinance:facts]', { traceId, ticker: normalizedTicker, error: errorMessage });
    return NextResponse.json(
      {
        ok: false,
        error: 'YFINANCE_FAILED',
        details: errorMessage,
        traceId,
      },
      { status: 500 }
    );
  }
}

/**
 * Spawn Python script and parse JSON output
 */
async function fetchYfinanceFacts(ticker: string, traceId: string): Promise<Facts> {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [YFINANCE_SCRIPT_PATH, ticker], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout | null = null;

    // Set timeout
    timeoutId = setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error(`yfinance script timeout after ${YFINANCE_TIMEOUT_MS}ms`));
    }, YFINANCE_TIMEOUT_MS);

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);

      if (code !== 0) {
        const errorMsg = stderr || `Python script exited with code ${code}`;
        reject(new Error(errorMsg));
        return;
      }

      try {
        const jsonData = JSON.parse(stdout.trim());
        const facts = normalizeYfinanceResponse(jsonData, ticker);
        resolve(facts);
      } catch (parseError: any) {
        reject(new Error(`Failed to parse JSON: ${parseError?.message || String(parseError)}`));
      }
    });

    pythonProcess.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });
  });
}

/**
 * Normalize yfinance JSON response to Facts format
 */
function normalizeYfinanceResponse(data: any, ticker: string): Facts {
  const base = createEmptyFacts(ticker);

  const facts: Partial<Facts> = {
    ticker: toUpperTicker(data.ticker || ticker),
    companyName: data.companyName || null,
    currency: data.currency || null,
    exchange: data.exchange || null,
    price: data.price ?? null,
    sharesOutstanding: data.sharesOutstanding ?? null,
    marketCap: data.marketCap ?? null,
    asOf: data.asOf || new Date().toISOString(),
    source: {
      primary: 'yfinance',
      fallbacks: [],
    },
    confidence: 'medium', // yfinance is fallback, so medium confidence
    freshness: 'delayed', // yfinance is delayed
    missing: [],
  };

  return mergeFacts(base, facts);
}
