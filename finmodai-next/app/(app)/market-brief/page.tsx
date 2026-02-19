import MarketBriefPage from '@/components/market-brief/MarketBriefPage';
import { Newspaper } from 'lucide-react';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `Market Brief | ${APP_NAME}`,
  description: 'AI-powered market analysis with stock performance and news insights',
};

export default function MarketBriefRoute() {
  return (
    <div className="w-full min-h-screen px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Newspaper className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Market Brief</h1>
        </div>
        <p className="text-muted-foreground">
          Real-time market performance, news analysis, and AI-powered insights
        </p>
      </div>
      <MarketBriefPage />
    </div>
  );
}
