import 'server-only';

export async function getStartupTrends(range: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/startups/trends?range=${range}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Unknown error' };
  }
}
