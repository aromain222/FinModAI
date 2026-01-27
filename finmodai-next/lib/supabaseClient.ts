import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type Database = any

let cachedClient: SupabaseClient<Database> | null = null

const getSupabaseEnv = () => {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase URL or anon key missing. Fix your .env.local')
  }

  return { url, key }
}

export const getSupabaseServerClient = (): SupabaseClient<Database> => {
  if (cachedClient) return cachedClient

  const { url, key } = getSupabaseEnv()

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false },
  })

  cachedClient = client
  return client
}
