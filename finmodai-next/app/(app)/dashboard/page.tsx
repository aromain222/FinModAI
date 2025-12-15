/**
 * Dashboard Page (Legacy Route)
 * 
 * Redirects to /app for consistency.
 */

import { redirect } from 'next/navigation';

export default function DashboardPage() {
  redirect('/app');
}
