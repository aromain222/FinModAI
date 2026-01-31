/**
 * Supabase Client
 * Browser-side Supabase client
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!supabase) {
  console.warn('[supabaseClient] Supabase credentials not configured');
}

// Server-side client (same as browser for now)
export function getSupabaseServerClient() {
  return supabase;
}
