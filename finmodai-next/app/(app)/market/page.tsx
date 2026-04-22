import { redirect } from 'next/navigation';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `News | ${APP_NAME}`,
  description: 'Redirects legacy market traffic into the news workflow.',
};

export default function MarketPage() {
  redirect('/news');
}
