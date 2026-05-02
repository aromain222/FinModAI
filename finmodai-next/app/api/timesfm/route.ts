import { NextRequest, NextResponse } from 'next/server';
import {
  buildProviderBackedPriceForecast,
  buildProviderBackedRevenueForecast,
} from '@/lib/forecast/providerBackedForecast';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL?.trim() || null;
const LOCAL_PYTHON_BACKEND = process.env.NODE_ENV === 'production' ? null : 'http://localhost:8082';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

function pythonBackendUrl(): string | null {
  return PYTHON_BACKEND || LOCAL_PYTHON_BACKEND;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type'); // 'price' | 'revenue'
  const ticker = searchParams.get('ticker');

  if (!type || !ticker) {
    return NextResponse.json({ error: 'type and ticker are required' }, { status: 400 });
  }
  if (type !== 'price' && type !== 'revenue') {
    return NextResponse.json({ error: 'type must be price or revenue' }, { status: 400 });
  }

  const params = new URLSearchParams({ ticker });
  if (type === 'price') {
    const horizon = searchParams.get('horizon') ?? '30';
    params.set('horizon', horizon);
  } else {
    const quarters = searchParams.get('quarters') ?? '4';
    params.set('quarters', quarters);
  }

  const backendUrl = pythonBackendUrl();
  const timesfmStatus: 'not_configured' | 'upstream_failed' = backendUrl ? 'upstream_failed' : 'not_configured';

  if (backendUrl) {
    try {
      const upstream = await fetch(`${backendUrl}/api/v1/timesfm/${type}?${params.toString()}`, {
        signal: AbortSignal.timeout(4500),
        cache: 'no-store',
      });

      if (upstream.ok) {
        const data = await upstream.json();
        return NextResponse.json(
          {
            ...data,
            model_source: data?.model_source ?? 'timesfm',
            timesfm_status: 'used',
            methodology: data?.methodology ?? 'TimesFM forecast service',
          },
          { headers: NO_STORE_HEADERS },
        );
      }
    } catch {
      // Fall through to provider-backed forecast below.
    }
  }

  if (type === 'price') {
    const fallback = await buildProviderBackedPriceForecast(ticker, Number(params.get('horizon') ?? 30));
    if (fallback) {
      return NextResponse.json({
        ...fallback,
        timesfm_status: timesfmStatus,
        warnings: [
          ...fallback.warnings,
          timesfmStatus === 'not_configured' ? 'timesfm:not_configured' : 'timesfm:upstream_failed',
        ],
      }, {
        headers: NO_STORE_HEADERS,
      });
    }
  } else {
    const fallback = await buildProviderBackedRevenueForecast(ticker, Number(params.get('quarters') ?? 4));
    if (fallback) {
      return NextResponse.json({
        ...fallback,
        timesfm_status: timesfmStatus,
        warnings: [
          ...fallback.warnings,
          timesfmStatus === 'not_configured' ? 'timesfm:not_configured' : 'timesfm:upstream_failed',
        ],
      }, {
        headers: NO_STORE_HEADERS,
      });
    }
  }

  return NextResponse.json(
    {
      error: 'Forecast unavailable',
      detail: backendUrl
        ? 'TimesFM service and provider-backed fallback were unavailable.'
        : 'PYTHON_BACKEND_URL is not configured and provider-backed fallback could not resolve enough data.',
    },
    { status: 503 },
  );
}
