import 'server-only';

import { cookies } from "next/headers";

type PreviewTable = { columns: string[]; rows: (string | number | null)[][] };

function normalizePreview(preview: any): PreviewTable | null {
  try {
    if (!preview) return null;

    const coerce = (val: any) => {
      if (val === null || val === undefined) return null;
      if (typeof val === "string" || typeof val === "number") return val;
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    };

    if (typeof preview === "string") {
      const trimmed = preview.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        return normalizePreview(parsed);
      } catch {
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        const columns = lines.length ? lines[0].split(/[,\t|]/).map((c) => c.trim()) : [];
        const rows = lines.slice(1).map((line) => line.split(/[,\t|]/).map(coerce));
        return columns.length ? { columns, rows } : null;
      }
    }

    if (Array.isArray(preview)) {
      if (!preview.length) return null;
      const first = preview[0];
      if (Array.isArray(first)) {
        const width = preview.reduce((m, row) => (Array.isArray(row) ? Math.max(m, row.length) : m), 0);
        const columns = Array.from({ length: width }, (_, i) => `Col ${i + 1}`);
        const rows = preview.map((row) =>
          Array.from({ length: width }, (_, i) => coerce(Array.isArray(row) ? row[i] : row))
        );
        return { columns, rows };
      }
      if (typeof first === "object") {
        const columns = Array.from(
          new Set(preview.flatMap((row) => (row && typeof row === "object" ? Object.keys(row) : [])))
        );
        const rows = preview.map((row) => columns.map((col) => coerce((row as any)?.[col])));
        return columns.length ? { columns, rows } : null;
      }
      return null;
    }

    if (typeof preview === "object") {
      const obj = preview as Record<string, any>;
      if (Array.isArray(obj.columns) && Array.isArray(obj.rows)) {
        const columns = obj.columns.map((c: any) => String(c));
        const rows = obj.rows.map((row: any) =>
          Array.isArray(row)
            ? row.map(coerce)
            : columns.map((col) => coerce((row as any)?.[col]))
        );
        return { columns, rows };
      }
      if (obj.preview || obj.data || obj.table) return normalizePreview(obj.preview || obj.data || obj.table);
    }
  } catch {
    // swallow and return null
  }
  return null;
}

export async function getModelContext(modelId: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/models/${encodeURIComponent(modelId)}`, {
      headers: { cookie: cookies().toString() },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const payload = await res.json();

    const keyResults = {
      enterpriseValue: payload?.results?.valuation?.enterpriseValue ?? payload?.results?.enterpriseValue ?? null,
      equityValue: payload?.results?.valuation?.equityValue ?? payload?.results?.equityValue ?? null,
      pricePerShare:
        payload?.results?.valuation?.pricePerShare ??
        payload?.results?.valuation?.impliedValuePerShare ??
        payload?.results?.pricePerShare ??
        null,
      wacc: payload?.assumptions?.wacc ?? payload?.normalized_assumptions?.wacc ?? null,
      terminalGrowth:
        payload?.assumptions?.terminalGrowth ?? payload?.normalized_assumptions?.terminalGrowth ?? null,
      revenueCagr:
        payload?.assumptions?.revenueGrowth ??
        payload?.normalized_assumptions?.revenueGrowth ??
        payload?.assumptions?.revenueGrowthPct ??
        null,
      ebitMargin:
        payload?.assumptions?.ebitdaMargin ??
        payload?.normalized_assumptions?.ebitdaMargin ??
        payload?.assumptions?.ebitMargin ??
        null,
    };

    const warnings: string[] = [];
    if (payload?.validation?.warnings) warnings.push(...payload.validation.warnings);
    if (payload?.error) warnings.push(payload.error);

    return {
      ok: true,
      data: {
        ticker: payload?.ticker ?? 'N/A',
        modelType: payload?.model_type ?? payload?.type ?? 'unknown',
        scenario: payload?.scenario ?? 'base',
        updatedAt: payload?.updated_at ?? payload?.created_at ?? null,
        keyResults,
        warnings,
        previewTable: normalizePreview(payload?.preview ?? null),
      },
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Unknown error' };
  }
}
