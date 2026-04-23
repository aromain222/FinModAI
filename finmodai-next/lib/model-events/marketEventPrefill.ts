import type { MarketEvent } from '@/lib/news/marketEventsTypes';

function toSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildMarketEventPrefillText(event: MarketEvent): string {
  const drivers = Array.isArray(event?.drivers) ? event.drivers : [];
  const transmissionPath = Array.isArray(event?.transmissionPath) ? event.transmissionPath : [];
  const summary = drivers[0] ? toSentence(drivers[0]) : toSentence(event?.title ?? 'Market event');
  const secondaryDrivers = drivers.slice(1).map((driver) => driver.trim()).filter(Boolean);
  const driverSentence = secondaryDrivers.length
    ? toSentence(`Key drivers: ${secondaryDrivers.join('; ')}`)
    : '';
  const transmissionSentence = transmissionPath.length
    ? toSentence(`Transmission path: ${transmissionPath.join(' -> ')}`)
    : '';

  return [summary, driverSentence, transmissionSentence].filter(Boolean).join(' ');
}

export function buildMarketEventModelCreateHref(event: MarketEvent): string {
  const leadSource = Array.isArray(event?.sources) ? event.sources[0] : undefined;
  const params = new URLSearchParams({
    eventSourceType: 'feed_item',
    eventId: event?.id ?? 'event',
    eventTitle: event?.title ?? 'Market event',
    eventText: buildMarketEventPrefillText(event),
  });

  if (leadSource?.url) params.set('eventUrl', leadSource.url);
  if (leadSource?.name) params.set('eventSource', leadSource.name);
  if (leadSource?.publishedAt) params.set('eventPublishedAt', leadSource.publishedAt);

  return `/models/create?${params.toString()}`;
}
