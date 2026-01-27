import { redirect } from 'next/navigation';

/**
 * Redirect: /macro → /macro-iq
 * 
 * The "Macro Dashboard" has been deprecated.
 * Users are redirected to "Macro IQ" instead.
 */
export default function MacroDashboardRedirect() {
  redirect('/macro-iq');
}
