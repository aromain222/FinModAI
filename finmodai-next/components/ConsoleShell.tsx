'use client';

import { usePathname } from 'next/navigation';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { DashboardTopbar } from '@/components/DashboardTopbar';
import { cn } from '@/lib/utils';

type ConsoleShellProps = {
  children: React.ReactNode;
};

// Routes that need the full-height workspace treatment (no padding, overflow-hidden)
const WORKSPACE_ROUTES = new Set(['/app']);

export function ConsoleShell({ children }: ConsoleShellProps) {
  const pathname = usePathname();
  const isWorkspace = WORKSPACE_ROUTES.has(pathname);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--cb-bg)] text-[var(--cb-text-body)] transition-colors">
      <DashboardSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardTopbar />
        <main
          className={cn(
            'min-h-0 min-w-0 flex-1',
            isWorkspace
              ? 'overflow-hidden'
              : 'overflow-y-auto overflow-x-hidden bg-[var(--cb-surface-subtle)] px-4 py-6 text-[var(--cb-text-body)] transition-colors md:px-8',
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
