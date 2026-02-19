import MarketDashboard from '@/components/market/MarketDashboard';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `Market | ${APP_NAME}`,
  description: 'Market dashboard focused on SPY, movers, and sectors',
};

export default function MarketPage() {
  return <MarketDashboard />;
}
