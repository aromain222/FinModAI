import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[::1\]$/i,
];

function isPrivateHost(hostname: string): boolean {
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return true;
  const parts = hostname.split('.');
  if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
    const [a, b] = parts.map(Number);
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function sanitizeContentType(value: string | null): string {
  if (!value) return 'image/jpeg';
  return value.toLowerCase().startsWith('image/') ? value : 'image/jpeg';
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('src');
  if (!raw) {
    return NextResponse.json({ error: 'Missing src parameter.' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid image URL.' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return NextResponse.json({ error: 'Unsupported protocol.' }, { status: 400 });
  }

  if (isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: 'Blocked host.' }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      cache: 'no-store',
      headers: {
        'user-agent': 'CapitalBase-ImageProxy/1.0',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream image request failed (${upstream.status}).` }, { status: 502 });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const contentType = sanitizeContentType(upstream.headers.get('content-type'));

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to fetch event image.' }, { status: 502 });
  }
}
