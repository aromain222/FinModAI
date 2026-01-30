'use client';

/**
 * Minimal client component so Next.js emits layout_client-reference-manifest.js
 * for the (marketing) route group. Belt-and-suspenders for Vercel trace ENOENT.
 */
export default function MarketingLayoutClient() {
  return <span aria-hidden="true" className="sr-only" />;
}
