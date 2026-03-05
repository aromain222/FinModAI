import EventsDashboard from '@/components/market/EventsDashboard';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `Events | ${APP_NAME}`,
  description: 'Macro risk dashboard for market-moving event threads',
};

export default function EventsPage() {
  return <EventsDashboard />;
}
