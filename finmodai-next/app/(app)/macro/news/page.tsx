import MacroNewsPage from '@/components/macro/MacroNewsPage';
import { Newspaper } from 'lucide-react';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `Macro News & AI Oversight | ${APP_NAME}`,
  description: 'Recent macro headlines with AI-generated insights and analysis',
};

export default function NewsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <MacroNewsPage />
    </div>
  );
}
