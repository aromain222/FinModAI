export type FormatType = 'currency' | 'percent' | 'number' | 'multiple';

export function formatValue(value: number | null | undefined, type: FormatType = 'number'): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  
  switch (type) {
    case 'currency':
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
      if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
      return `$${value.toFixed(2)}`;
    case 'percent':
      return `${(value * 100).toFixed(2)}%`;
    case 'multiple':
      return `${value.toFixed(2)}x`;
    case 'number':
    default:
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}
