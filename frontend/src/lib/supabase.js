import { createClient } from '@supabase/supabase-js';

const config = window.__SUPABASE_CONFIG__ || {};

if (!config.url || !config.anonKey) {
  console.warn(
    'Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.'
  );
}

export const supabase = createClient(config.url || '', config.anonKey || '');

