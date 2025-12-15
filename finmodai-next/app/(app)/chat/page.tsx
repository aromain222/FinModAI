import { Metadata } from 'next';
import Link from 'next/link';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_NAME } from '@/lib/branding';

export const metadata: Metadata = {
  title: `${APP_NAME} Analyst Chat`,
  description: 'Macro-aware financial reasoning assistant.'
};

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-10">
      <div className="mx-auto mb-4 max-w-6xl">
        <Link href="/models" className="text-sm text-muted-foreground transition hover:text-secondary">
          ← Back to Models
        </Link>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row">
        <Card className="md:w-72">
          <CardHeader>
            <CardTitle className="text-lg text-cb-ink">{APP_NAME} Analyst Chat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>This analyst is macro-aware and focused on institutional reasoning only.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Requires ticker, timeframe, and assumptions.</li>
              <li>Explains frameworks, never gives advice.</li>
              <li>Integrates macro data automatically.</li>
            </ul>
          </CardContent>
        </Card>

        <div className="flex-1">
          <ChatInterface userEmail="analyst@capitalbase.app" />
        </div>
      </div>
    </div>
  );
}
