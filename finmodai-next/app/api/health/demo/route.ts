import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HealthCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type HealthResponse = {
  status: 'green' | 'yellow' | 'red';
  checks: HealthCheck[];
  lastCheckedISO: string;
};

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not available in production', { status: 404 });
  }

  const traceId = randomUUID();
  const checks: HealthCheck[] = [];
  let status: 'green' | 'yellow' | 'red' = 'green';

  // Check 1: Auth session / Demo bypass
  try {
    const demoBypass = process.env.DEMO_BYPASS_AUTH === '1' || process.env.BYPASS_AUTH === '1';
    const demoMode = process.env.DEMO_MODE === '1';
    if (demoBypass || demoMode) {
      checks.push({ name: 'auth', ok: true, detail: 'Demo mode enabled (bypass auth)' });
    } else {
      // In production, we'd check for actual session
      // For demo health, we just check if auth is configured
      const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
      checks.push({
        name: 'auth',
        ok: hasSupabaseUrl,
        detail: hasSupabaseUrl ? 'Auth configured' : 'Supabase URL missing',
      });
      if (!hasSupabaseUrl) status = 'yellow';
    }
  } catch (error: any) {
    checks.push({ name: 'auth', ok: false, detail: toSafeText(error) });
    status = 'red';
  }

  // Check 2: Market data provider (stooq or yfinance)
  try {
    const hasStooq = true; // Stooq is always available (public API)
    const hasYfinance = !!process.env.PYTHON_BIN;
    if (hasStooq || hasYfinance) {
      checks.push({
        name: 'market_data',
        ok: true,
        detail: hasYfinance ? 'yfinance + stooq available' : 'stooq available',
      });
    } else {
      checks.push({
        name: 'market_data',
        ok: false,
        detail: 'No market data provider configured',
      });
      status = status === 'green' ? 'yellow' : 'red';
    }
  } catch (error: any) {
    checks.push({ name: 'market_data', ok: false, detail: toSafeText(error) });
    status = 'red';
  }

  // Check 3: Macro provider (FRED)
  try {
    const hasFred = !!process.env.FRED_API_KEY;
    checks.push({
      name: 'macro_data',
      ok: hasFred,
      detail: hasFred ? 'FRED API configured' : 'FRED_API_KEY missing (will use fallback)',
    });
    if (!hasFred && status === 'green') status = 'yellow';
  } catch (error: any) {
    checks.push({ name: 'macro_data', ok: false, detail: toSafeText(error) });
    status = 'red';
  }

  // Check 4: News provider (Webz or fallback)
  try {
    const hasWebz = !!process.env.WEBZIO_API_KEY;
    checks.push({
      name: 'news_data',
      ok: hasWebz,
      detail: hasWebz ? 'Webz.io configured' : 'WEBZIO_API_KEY missing (will use demo fixtures)',
    });
    if (!hasWebz && status === 'green') status = 'yellow';
  } catch (error: any) {
    checks.push({ name: 'news_data', ok: false, detail: toSafeText(error) });
    status = 'red';
  }

  // Check 5: Storage/download (R2 or local fallback)
  try {
    const hasR2 =
      !!process.env.R2_ACCOUNT_ID &&
      !!process.env.R2_ACCESS_KEY_ID &&
      !!process.env.R2_SECRET_ACCESS_KEY &&
      !!process.env.R2_BUCKET_NAME;
    checks.push({
      name: 'storage',
      ok: true, // Always ok since we have on-demand fallback
      detail: hasR2 ? 'R2 configured' : 'R2 not configured (will generate on-demand)',
    });
  } catch (error: any) {
    checks.push({ name: 'storage', ok: false, detail: toSafeText(error) });
    status = 'red';
  }

  const failedChecks = checks.filter((c) => !c.ok);
  if (failedChecks.length > 0 && status === 'green') {
    status = failedChecks.length >= 3 ? 'red' : 'yellow';
  }

  const response: HealthResponse = {
    status,
    checks,
    lastCheckedISO: new Date().toISOString(),
  };

  return NextResponse.json(response, { status: 200 });
}

function toSafeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message || 'Error';
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 500 ? json.slice(0, 500) + '...' : json;
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}
