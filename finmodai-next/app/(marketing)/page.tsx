import type { Metadata } from 'next';
import { APP_NAME } from '@/lib/branding';
import { LandingSlides } from '@/components/marketing/LandingSlides';

export const metadata: Metadata = {
  title: `${APP_NAME} | AI Financial Modeling and Market Intelligence`,
  description:
    'CapitalBase automates financial modeling and surfaces market intelligence for investors and analysts.',
};

export default function MarketingPage() {
  return <LandingSlides />;
}
