import { redirect } from 'next/navigation';

/**
 * Redirect: /macro/news → /market-intelligence
 * 
 * The "Market Pulse" has been deprecated.
 * Users are redirected to "Market Brief" instead.
 */
export default function MarketPulseRedirect() {
  redirect('/market-intelligence');
}
