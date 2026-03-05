export type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color?: string;
  src: {
    original?: string;
    large2x?: string;
    large?: string;
    medium?: string;
    small?: string;
    landscape?: string;
    portrait?: string;
    tiny?: string;
  };
};

type PexelsResponse = {
  photos?: PexelsPhoto[];
};

export async function searchPexelsPhotos(query: string): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('PEXELS_API_KEY is not configured');
  }

  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Pexels query is required');
  }

  const qs = new URLSearchParams({
    query: trimmed,
    per_page: '8',
    orientation: 'landscape',
  });

  const response = await fetch(`https://api.pexels.com/v1/search?${qs.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: apiKey,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PEXELS_HTTP_${response.status}${text ? `:${text.slice(0, 180)}` : ''}`);
  }

  const payload = (await response.json()) as PexelsResponse;
  return Array.isArray(payload.photos) ? payload.photos : [];
}
