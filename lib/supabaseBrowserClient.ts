// lib/supabaseBrowserClient.ts
"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type Database = any;

let cachedClient: SupabaseClient<Database> | null = null;

/**
 * Return a singleton Supabase client for client-side use.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check your .env.local."
    );
  }

  cachedClient = createClient<Database>(url, key);
  return cachedClient;
}
