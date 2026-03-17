import { DealIntelligenceFeed } from '@/components/deal-intelligence/DealIntelligenceFeed';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `Deal Intelligence | ${APP_NAME}`,
  description: 'Weekly institutional deal intelligence feed across M&A, venture, PE, ECM, DCM, partnerships, and restructuring.',
};

export default function DealIntelligencePage() {
  return <DealIntelligenceFeed />;
}
