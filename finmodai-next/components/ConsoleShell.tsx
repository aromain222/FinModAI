'use client';

import { usePathname } from 'next/navigation';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { DashboardTopbar } from '@/components/DashboardTopbar';
import { WorkspaceBar } from '@/components/WorkspaceBar';
import { cn } from '@/lib/utils';

type ConsoleShellProps = {
  children: React.ReactNode;
};

// Routes that render as a full-height workspace: no sidebar, no padding, compact top bar only
const WORKSPACE_ROUTES = new Set(['/app']);

export function ConsoleShell({ children }: ConsoleShellProps) {
  const pathname = usePathname();
  const isWorkspace = WORKSPACE_ROUTES.has(pathname);

  // ── Workspace layout: global sidebar + compact bar + full-height content ──
  if (isWorkspace) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[var(--cb-bg)] text-[var(--cb-text-body)] transition-colors">
        <DashboardSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceBar />
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // ── Standard app layout: sidebar + topbar + padded content ───────────────
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--cb-bg)] text-[var(--cb-text-body)] transition-colors">
      <DashboardSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardTopbar />
        <main className={cn(
          'min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden',
          'bg-[var(--cb-surface-subtle)] px-4 py-6 text-[var(--cb-text-body)] transition-colors md:px-8',
        )}>
          {children}
        </main>
      </div>
    </div>
  );
}
