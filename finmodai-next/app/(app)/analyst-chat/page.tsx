import Link from 'next/link';
import { AnalystChatApp } from '@/components/analyst/AnalystChatApp';
import { listAllModels } from '@/lib/modelsRepo';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/branding';

type AnalystChatPageProps = {
  searchParams?: Record<string, string>;
};

export default async function AnalystChatPage({ searchParams }: AnalystChatPageProps) {
  const models = await listAllModels();
  const defaultModelId = searchParams?.modelId;

  return (
    <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <header className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--cb-green)]">{APP_NAME}</p>
            <h1 className="text-3xl font-semibold text-[var(--cb-text-primary)]">Analyst Chat</h1>
            <p className="text-sm text-[var(--cb-text-secondary)]">
              Ask questions with ticker or model context. Attach PDFs to capture memo highlights.
            </p>
          </header>
          <Button asChild variant="outline">
            <Link href="/app">Back to Dashboard</Link>
          </Button>
        </div>
        <AnalystChatApp models={models} defaultModelId={defaultModelId} />
      </div>
    </main>
  );
}
