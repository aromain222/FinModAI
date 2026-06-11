import type { Metadata } from 'next';
import { Inspector } from '@/components/agents/Inspector';

export const metadata: Metadata = {
  title: 'Agent Inspector — CapitalBase',
  description: 'Deep view of what each quant scout produced and what the senior committee decided.',
};

export const dynamic = 'force-dynamic';

export default function InspectorPage({
  searchParams,
}: {
  searchParams?: { ticker?: string; analyst?: string };
}) {
  const ticker = (searchParams?.ticker ?? '').toUpperCase();
  const analyst = searchParams?.analyst ?? undefined;
  return <Inspector ticker={ticker || null} analyst={analyst ?? null} />;
}
