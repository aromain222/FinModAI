import NewsPage from '@/components/news/NewsPage';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `News | ${APP_NAME}`,
  description: 'Market headlines and macro event summaries',
};

export default function NewsRoute() {
  return <NewsPage />;
}
