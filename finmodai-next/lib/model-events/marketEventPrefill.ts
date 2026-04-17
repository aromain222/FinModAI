import type { MarketEvent } from '@/lib/news/marketEventsTypes';

function toSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildMarketEventPrefillText(event: MarketEvent): string {
  const summary = event.drivers[0] ? toSentence(event.drivers[0]) : toSentence(event.title);
  const secondaryDrivers = event.drivers.slice(1).map((driver) => driver.trim()).filter(Boolean);
  const driverSentence = secondaryDrivers.length
    ? toSentence(`Key drivers: ${secondaryDrivers.join('; ')}`)
    : '';
  const transmissionSentence = event.transmissionPath.length
    ? toSentence(`Transmission path: ${event.transmissionPath.join(' -> ')}`)
    : '';

  return [summary, driverSentence, transmissionSentence].filter(Boolean).join(' ');
}

export function buildMarketEventModelCreateHref(event: MarketEvent): string {
  const leadSource = event.sources[0];
  const params = new URLSearchParams({
    eventSourceType: 'feed_item',
    eventId: event.id,
    eventTitle: event.title,
    eventText: buildMarketEventPrefillText(event),
  });

  if (leadSource?.url) params.set('eventUrl', leadSource.url);
  if (leadSource?.name) params.set('eventSource', leadSource.name);
  if (leadSource?.publishedAt) params.set('eventPublishedAt', leadSource.publishedAt);

  return `/models/create?${params.toString()}`;
}
