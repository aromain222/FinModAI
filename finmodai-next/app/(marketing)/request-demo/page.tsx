/**
 * Legacy /request-demo – redirects to waitlist. No imports that can break the build.
 */

import { redirect } from 'next/navigation';

export default function RequestDemoPage() {
  redirect('/waitlist');
}
