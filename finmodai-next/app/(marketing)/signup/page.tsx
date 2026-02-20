/**
 * Signup Page (Marketing Route)
 * 
 * Session redirect is done client-side to avoid server-side Supabase errors on Vercel.
 */

import { AuthPage } from '@/components/auth/AuthPage';
import { SignupAuthRedirect } from '@/components/auth/SignupAuthRedirect';

export default function SignupPage() {
  return (
    <SignupAuthRedirect>
      <AuthPage initialMode="signup" />
    </SignupAuthRedirect>
  );
}
