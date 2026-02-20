/**
 * Login Page (Marketing Route)
 * 
 * Session redirect is done client-side (LoginPageClient) to avoid server-side
 * Supabase errors on Vercel.
 */

import { AuthPage } from '@/components/auth/AuthPage';
import { LoginPageClient } from '@/components/auth/LoginPageClient';

export default function LoginPage() {
  return (
    <LoginPageClient>
      <AuthPage initialMode="login" />
    </LoginPageClient>
  );
}
