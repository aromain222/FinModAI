'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

export type AuthActionState = {
  status: 'idle' | 'error' | 'success';
  message?: string;
};

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get('email')?.toString().trim();
  const password = formData.get('password')?.toString();

  if (!email || !password) {
    return { status: 'error', message: 'Email and password are required.' };
  }

  try {
    const supabase = getSupabaseServerClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error('Supabase signUp error:', error);
      return {
        status: 'error',
        message: error.message ?? 'Supabase sign up failed.',
      };
    }

    return {
      status: 'success',
      message: 'Check your inbox to confirm your account.',
    };
  } catch (err: any) {
    console.error('signUpAction unexpected error:', err);
    return {
      status: 'error',
      message: err?.message ?? 'Unexpected error during sign up. Check server logs for details.',
    };
  }
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get('email')?.toString().trim();
  const password = formData.get('password')?.toString();

  if (!email || !password) {
    return { status: 'error', message: 'Email and password are required.' };
  }

  try {
    const supabase = getSupabaseServerClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Supabase signIn error:', error);
      return {
        status: 'error',
        message: error.message ?? 'Supabase sign in failed.',
      };
    }

    return {
      status: 'success',
      message: 'Signed in successfully.',
    };
  } catch (err: any) {
    console.error('signInAction unexpected error:', err);
    return {
      status: 'error',
      message: err?.message ?? 'Unexpected error during sign in. Check server logs for details.',
    };
  }
}

export async function signOutAction(): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error('signOutAction error:', err);
  }

  redirect('/login');
}

