/**
 * /demo redirects to /request-demo so the name+email form is always shown (avoids cached old page).
 */

import { redirect } from 'next/navigation';

export default function DemoPage() {
  redirect('/request-demo');
}
