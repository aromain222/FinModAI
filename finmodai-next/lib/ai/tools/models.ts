import 'server-only';

import { cookies } from "next/headers";

export async function getModel(modelId: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/models/${encodeURIComponent(modelId)}`, {
      headers: { cookie: cookies().toString() },
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

export async function listModels(limit = 10) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/models/log?limit=${limit}`, {
      headers: { cookie: cookies().toString() },
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
