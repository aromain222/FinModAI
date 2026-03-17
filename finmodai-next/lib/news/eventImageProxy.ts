const EVENT_IMAGE_PROXY_PATH = '/api/market/events/image';

export function proxiedEventImageUrl(url: string | null | undefined): string | undefined {
  if (typeof url !== 'string' || !url.trim()) return undefined;
  return `${EVENT_IMAGE_PROXY_PATH}?src=${encodeURIComponent(url.trim())}`;
}
