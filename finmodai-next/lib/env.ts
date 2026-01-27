/**
 * Client-safe env exports.
 *
 * Do NOT import server-only env values from here. Use:
 * - `@/lib/env/server` for server-only keys (includes `import 'server-only'`)
 * - `@/lib/env/public` for NEXT_PUBLIC_* keys
 *
 * This file intentionally does not import `server-only` to prevent client bundle crashes.
 */

export { getPublicEnv, PUBLIC_ENV } from '@/lib/env/public';
