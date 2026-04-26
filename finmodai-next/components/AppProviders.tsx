'use client';

import { ModelAssumptionsProvider } from '@/lib/modelAssumptionsStore';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return <ModelAssumptionsProvider>{children}</ModelAssumptionsProvider>;
}
