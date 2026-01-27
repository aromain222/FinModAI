// lib/supabaseBrowserClient.ts
"use client";

import { createClientComponentClient, SupabaseClient } from "@supabase/auth-helpers-nextjs";

export type Database = any;

let cachedClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = createClientComponentClient<Database>();
  return cachedClient;
}
