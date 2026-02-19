import MacroDashboard from '@/components/macro/MacroDashboard';
import { Activity } from 'lucide-react';
import { APP_NAME } from '@/lib/branding';

export const metadata = {
  title: `Macro Dashboard | ${APP_NAME}`,
  description: 'Real-time macro indicators and AI-powered market analysis',
};

export default function MacroPage() {
  return (
    <div className="w-full px-6 lg:px-8 2xl:px-10 h-[calc(100vh-72px)] overflow-hidden">
      <div className="flex items-center gap-3 py-4">
        <Activity className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Macro IQ</h1>
          <p className="text-xs text-muted-foreground">Real-time macro indicators and event intelligence</p>
        </div>
      </div>
      <div className="h-[calc(100%-60px)] min-h-0">
        <MacroDashboard />
      </div>
    </div>
  );
}
