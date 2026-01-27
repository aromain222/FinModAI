export type PreviewV3 = {
  version: 3;
  sheetName?: string;
  columns: string[];
  rows: (string | number | null)[][];
  stats?: { rowCount: number; colCount: number; truncated: boolean };
  warnings?: string[];
  debugShape?: string;
};

export function isPreviewV3(x: unknown): x is PreviewV3 {
  return (
    !!x &&
    typeof x === 'object' &&
    (x as any).version === 3 &&
    Array.isArray((x as any).columns) &&
    Array.isArray((x as any).rows)
  );
}

export function previewV3Summary(x: PreviewV3 | null): string {
  if (!x) return 'no preview';
  const rows = x.rows?.length ?? 0;
  const cols = x.columns?.length ?? 0;
  const truncated = x.stats?.truncated ? ' (truncated)' : '';
  return `${rows}x${cols}${truncated}`;
}
