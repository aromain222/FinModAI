import MacroDashboard from '@/components/macro/MacroDashboard';
import { Activity } from 'lucide-react';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `Macro Dashboard | ${APP_NAME}`,
  description: 'Real-time macro indicators and AI-powered market analysis',
};

export default function MacroPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Activity className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Macro Dashboard</h1>
        </div>
        <p className="text-muted-foreground">
          Real-time macro indicators, risk analysis, and AI-powered market insights
        </p>
      </div>

      {/* Dashboard */}
      <MacroDashboard />
    </div>
  );
}
