import EventDetailScreen from '@/components/market/EventDetailScreen';
import { APP_NAME } from '@/lib/branding';
import type { MarketEventsProvider, MarketEventsView } from '@/lib/news/marketEventsTypes';

type EventDetailPageProps = {
  params: { eventId: string };
  searchParams?: {
    provider?: string;
    view?: string;
  };
};

export async function generateMetadata({ params }: EventDetailPageProps) {
  return {
    title: `Event | ${decodeURIComponent(params.eventId)} | ${APP_NAME}`,
    description: 'Detailed market-moving event thread view',
  };
}

function parseProvider(value?: string): MarketEventsProvider {
  return value === 'demo-seed' ? 'demo-seed' : 'live';
}

function parseView(value?: string): MarketEventsView {
  return value === 'resolved' ? 'resolved' : 'active';
}

export default function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  return (
    <EventDetailScreen
      eventId={decodeURIComponent(params.eventId)}
      initialProvider={parseProvider(searchParams?.provider)}
      initialView={parseView(searchParams?.view)}
    />
  );
}
