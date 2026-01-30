'use client';

/**
 * Minimal client component so Next.js emits page_client-reference-manifest.js
 * for the (marketing) route group. Fixes Vercel ENOENT during trace collection.
 */
export default function MarketingClient() {
  return <span aria-hidden="true" className="sr-only" />;
}
