export type MacroEventImageCategory =
  | 'geopolitics'
  | 'rates_inflation'
  | 'energy'
  | 'ai_semis'
  | 'supply_chain'
  | 'crypto'
  | 'default';

export const CATEGORY_TO_PEXELS_QUERIES: Record<MacroEventImageCategory, string[]> = {
  geopolitics: [
    'middle east skyline editorial',
    'government building flags landscape',
    'military command center landscape',
  ],
  rates_inflation: [
    'central bank building exterior',
    'financial district skyline landscape',
    'economic data trading desk',
  ],
  energy: [
    'oil refinery at dusk',
    'natural gas facility landscape',
    'energy infrastructure industrial landscape',
  ],
  ai_semis: [
    'data center servers landscape',
    'semiconductor wafer clean room',
    'high performance computing racks',
  ],
  supply_chain: [
    'cargo ships port landscape',
    'shipping containers aerial view',
    'freight logistics terminal landscape',
  ],
  crypto: [
    'data center network hardware',
    'digital finance abstract screens',
    'server room blue lights',
  ],
  default: [
    'city skyline financial district',
    'global markets trading floor',
    'world map digital network',
  ],
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeCategory(category: string | null | undefined): MacroEventImageCategory {
  const normalized = normalizeToken(category ?? '');
  if (!normalized) return 'default';

  if (
    normalized.includes('geopolit') ||
    normalized.includes('conflict') ||
    normalized.includes('sanction') ||
    normalized.includes('war') ||
    normalized.includes('middle east')
  ) {
    return 'geopolitics';
  }

  if (
    normalized.includes('rate') ||
    normalized.includes('inflation') ||
    normalized.includes('policy') ||
    normalized.includes('central bank') ||
    normalized.includes('fed') ||
    normalized.includes('ecb')
  ) {
    return 'rates_inflation';
  }

  if (
    normalized.includes('energy') ||
    normalized.includes('oil') ||
    normalized.includes('opec') ||
    normalized.includes('crude')
  ) {
    return 'energy';
  }

  if (
    normalized.includes('ai') ||
    normalized.includes('chip') ||
    normalized.includes('semi') ||
    normalized.includes('nvidia') ||
    normalized.includes('data center')
  ) {
    return 'ai_semis';
  }

  if (
    normalized.includes('supply') ||
    normalized.includes('shipping') ||
    normalized.includes('freight') ||
    normalized.includes('logistics') ||
    normalized.includes('port')
  ) {
    return 'supply_chain';
  }

  if (
    normalized.includes('crypto') ||
    normalized.includes('bitcoin') ||
    normalized.includes('ether') ||
    normalized.includes('blockchain')
  ) {
    return 'crypto';
  }

  return 'default';
}

const FALLBACK_PALETTE: Record<MacroEventImageCategory, { base: string; accent: string; label: string }> = {
  geopolitics: { base: '#0f172a', accent: '#ef4444', label: 'Geopolitics' },
  rates_inflation: { base: '#111827', accent: '#3b82f6', label: 'Rates / Inflation' },
  energy: { base: '#111827', accent: '#f59e0b', label: 'Energy' },
  ai_semis: { base: '#0f172a', accent: '#10b981', label: 'AI / Semis' },
  supply_chain: { base: '#111827', accent: '#8b5cf6', label: 'Supply Chain' },
  crypto: { base: '#111827', accent: '#06b6d4', label: 'Crypto' },
  default: { base: '#111827', accent: '#64748b', label: 'Macro Event' },
};

export function getMacroEventFallbackImage(
  category: string | null | undefined,
  variant: 'hero' | 'thumb' = 'thumb'
): string {
  const normalized = normalizeCategory(category);
  const palette = FALLBACK_PALETTE[normalized];
  const width = variant === 'hero' ? 1600 : 640;
  const height = variant === 'hero' ? 900 : 360;
  const fontSize = variant === 'hero' ? 32 : 20;
  const label = palette.label;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.base}" />
          <stop offset="100%" stop-color="#030712" />
        </linearGradient>
        <radialGradient id="r" cx="82%" cy="18%" r="58%">
          <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.42" />
          <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#g)" />
      <rect width="${width}" height="${height}" fill="url(#r)" />
      <circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.22)}" r="${Math.round(height * 0.22)}" fill="${palette.accent}" opacity="0.12" />
      <circle cx="${Math.round(width * 0.26)}" cy="${Math.round(height * 0.72)}" r="${Math.round(height * 0.18)}" fill="#ffffff" opacity="0.04" />
      <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.2)}" width="${Math.round(width * 0.34)}" height="${Math.round(height * 0.02)}" rx="${Math.round(height * 0.01)}" fill="rgba(255,255,255,0.08)" />
      <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.28)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.02)}" rx="${Math.round(height * 0.01)}" fill="rgba(255,255,255,0.06)" />
      <rect x="${Math.round(width * 0.05)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.9)}" height="${Math.round(height * 0.84)}" rx="28" fill="none" stroke="rgba(255,255,255,0.10)" />
      <rect x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.78)}" width="${Math.round(width * 0.2)}" height="${Math.round(height * 0.08)}" rx="${Math.round(height * 0.04)}" fill="rgba(255,255,255,0.08)" />
      <text x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.835)}" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function summarizeTitle(title: string | null | undefined): { lineOne: string; lineTwo: string } {
  const cleaned = (title ?? '')
    .replace(/[^\w\s/&-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return {
      lineOne: 'Market-moving',
      lineTwo: 'event setup',
    };
  }

  const words = cleaned.split(' ').slice(0, 8);
  const midpoint = Math.max(2, Math.min(4, Math.ceil(words.length / 2)));
  const lineOne = words.slice(0, midpoint).join(' ');
  const lineTwo = words.slice(midpoint).join(' ') || 'event setup';
  return { lineOne, lineTwo };
}

export function getSpecificEventFallbackImage(
  title: string | null | undefined,
  category: string | null | undefined,
  variant: 'hero' | 'thumb' = 'thumb'
): string {
  const normalized = normalizeCategory(category);
  const palette = FALLBACK_PALETTE[normalized];
  const width = variant === 'hero' ? 1600 : 640;
  const height = variant === 'hero' ? 900 : 360;
  const categoryFont = variant === 'hero' ? 22 : 16;
  const titleFont = variant === 'hero' ? 42 : 24;
  const subFont = variant === 'hero' ? 24 : 16;
  const { lineOne, lineTwo } = summarizeTitle(title);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#050816" />
          <stop offset="100%" stop-color="#02040a" />
        </linearGradient>
        <radialGradient id="glow" cx="82%" cy="18%" r="58%">
          <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <rect width="${width}" height="${height}" fill="url(#glow)" />
      <rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.12)}" width="${Math.round(width * 0.88)}" height="${Math.round(height * 0.76)}" rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />
      <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.16)}" width="${Math.round(width * 0.24)}" height="${Math.round(height * 0.1)}" rx="${Math.round(height * 0.05)}" fill="rgba(255,255,255,0.06)" />
      <text x="${Math.round(width * 0.105)}" y="${Math.round(height * 0.225)}" fill="${palette.accent}" font-family="Arial, Helvetica, sans-serif" font-size="${categoryFont}" font-weight="700" letter-spacing="2">${palette.label}</text>
      <text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.46)}" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="${titleFont}" font-weight="700">${lineOne}</text>
      <text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.58)}" fill="#e4e4e7" font-family="Arial, Helvetica, sans-serif" font-size="${subFont}" font-weight="500">${lineTwo}</text>
      <circle cx="${Math.round(width * 0.83)}" cy="${Math.round(height * 0.24)}" r="${Math.round(height * 0.16)}" fill="${palette.accent}" opacity="0.12" />
      <rect x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.72)}" width="${Math.round(width * 0.28)}" height="${Math.round(height * 0.025)}" rx="${Math.round(height * 0.012)}" fill="rgba(255,255,255,0.08)" />
      <rect x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.78)}" width="${Math.round(width * 0.18)}" height="${Math.round(height * 0.025)}" rx="${Math.round(height * 0.012)}" fill="rgba(255,255,255,0.05)" />
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
