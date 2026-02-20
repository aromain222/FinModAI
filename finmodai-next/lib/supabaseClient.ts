/**
 * Supabase Client
 * Browser-side Supabase client
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabase: ReturnType<typeof createClient> | null = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[supabaseClient] Supabase client init failed:', (e as Error)?.message);
    }
  }
}

export { supabase };

if (!supabase) {
  console.warn('[supabaseClient] Supabase credentials not configured');
}

// Server-side client (same as browser for now)
export function getSupabaseServerClient() {
  return supabase;
}
