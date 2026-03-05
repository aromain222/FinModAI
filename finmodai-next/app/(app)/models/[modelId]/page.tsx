import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ModelWizard } from '@/components/models/ModelWizard';
import { getModel } from '@/lib/models/core/registry';
import { APP_NAME } from '@/lib/branding';

export const dynamic = 'force-dynamic';

type ModelPageProps = {
  params: {
    modelId: string;
  };
};

export default function ModelPage({ params }: ModelPageProps) {
  const slug = params.modelId;
  const model = getModel(slug);

  if (!model) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] p-6 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <header className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--cb-green)]">{APP_NAME}</p>
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-3 py-1 text-xs font-medium text-[var(--cb-text-secondary)]">
                {model.category} Template
              </div>
              <h1 className="text-4xl font-semibold tracking-tight text-[var(--cb-text-primary)]">{model.name}</h1>
              <p className="max-w-3xl text-sm leading-7 text-[var(--cb-text-secondary)] md:text-base">
                {model.description}
              </p>
            </header>
            <Button asChild variant="outline" className="h-11 px-5">
              <Link href="/models?tab=templates">Back to Templates</Link>
            </Button>
          </div>
        </section>

        <ModelWizard slug={model.slug} name={model.name} description={model.description} uiSchema={model.uiSchema} />
      </div>
    </main>
  );
}
