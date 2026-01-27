import { DashboardSidebar } from '@/components/DashboardSidebar';
import { DashboardTopbar } from '@/components/DashboardTopbar';
import { ToastProvider } from '@/components/ToastProvider';

type ConsoleShellProps = {
  children: React.ReactNode;
};

export function ConsoleShell({ children }: ConsoleShellProps) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[var(--cb-bg)] text-[var(--cb-text-body)] transition-colors">
        <div className="flex min-h-screen">
          <DashboardSidebar />
          <div className="flex flex-1 flex-col">
            <DashboardTopbar />
            <main className="flex-1 bg-[var(--cb-surface-subtle)] px-4 py-6 text-[var(--cb-text-body)] transition-colors md:px-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
