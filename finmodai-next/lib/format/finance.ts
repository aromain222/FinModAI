export type FormatType = 'currency' | 'percent' | 'number' | 'multiple' | 'text';

export type FormatOptions = {
  unit?: 'raw' | 'thousands' | 'millions' | 'billions';
  decimals?: number;
};

export function formatValue(
  value: number | string | null | undefined,
  type: FormatType = 'number',
  opts: FormatOptions = {}
): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(num)) return '—';

  const decimals = typeof opts.decimals === 'number' && Number.isFinite(opts.decimals) ? opts.decimals : 2;
  const unit = opts.unit ?? 'raw';

  const unitDiv =
    unit === 'billions' ? 1e9 :
    unit === 'millions' ? 1e6 :
    unit === 'thousands' ? 1e3 :
    1;
  const scaled = unitDiv === 1 ? num : num / unitDiv;
  
  switch (type) {
    case 'text':
      return String(value).trim().length ? String(value) : '—';
    case 'currency':
      // If caller specified a unit, honor it (e.g., show "$34.5B" as "$34.50B").
      if (unit !== 'raw') {
        const suffix = unit === 'billions' ? 'B' : unit === 'millions' ? 'M' : 'K';
        return `$${scaled.toFixed(decimals)}${suffix}`;
      }
      // Otherwise, auto-suffix for readability.
      if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
      if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
      if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
      return `$${num.toFixed(decimals)}`;
    case 'percent':
      return `${(num * 100).toFixed(decimals)}%`;
    case 'multiple':
      return `${num.toFixed(decimals)}x`;
    case 'number':
    default:
      if (unit !== 'raw') {
        const suffix = unit === 'billions' ? 'B' : unit === 'millions' ? 'M' : 'K';
        return `${scaled.toFixed(decimals)}${suffix}`;
      }
      return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
  }
}
