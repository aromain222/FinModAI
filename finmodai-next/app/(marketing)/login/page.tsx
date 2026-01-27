/**
 * Login Page (Marketing Route) - DEPRECATED
 * 
 * Redirects to /auth for unified auth experience.
 * This route is kept for backward compatibility.
 */

import { redirect } from 'next/navigation';

export default async function LoginPage() {
  redirect('/auth');
}
