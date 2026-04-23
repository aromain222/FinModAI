import dynamic from 'next/dynamic';

const CreateModelPageClient = dynamic(() => import('./CreateModelPageClient'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[var(--cb-background)] px-6 py-10 text-sm text-[var(--cb-text-secondary)]">
      Loading model workspace…
    </div>
  ),
});

export default function CreateModelPage() {
  return <CreateModelPageClient />;
}
