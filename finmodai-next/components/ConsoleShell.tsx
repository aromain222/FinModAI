import { DashboardSidebar } from '@/components/DashboardSidebar';
import { DashboardTopbar } from '@/components/DashboardTopbar';

type ConsoleShellProps = {
  children: React.ReactNode;
};

export function ConsoleShell({ children }: ConsoleShellProps) {
  return (
    <div className="h-screen overflow-hidden bg-[var(--cb-bg)] text-[var(--cb-text-body)] transition-colors">
      <div className="flex h-full min-h-0">
        <DashboardSidebar />
        <div className="flex min-h-0 flex-1 flex-col">
          <DashboardTopbar />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--cb-surface-subtle)] px-4 py-6 text-[var(--cb-text-body)] transition-colors md:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
