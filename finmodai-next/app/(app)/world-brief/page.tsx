import type { Metadata } from 'next';
import WorldBriefPage from '@/components/world-brief/WorldBriefPage';
import { APP_NAME } from '@/lib/branding';

export const metadata: Metadata = {
  title: `World Brief | ${APP_NAME}`,
  description: 'Geopolitics, policy, and major world developments with structured market implications.',
};

export default function WorldBriefRoute() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <WorldBriefPage />
    </div>
  );
}
