import { ShoppingAssistant } from "@/components/search/ShoppingAssistant";

type ResultsPageProps = {
  searchParams?: {
    q?: string | string[];
  };
};

export default function ResultsPage({ searchParams }: ResultsPageProps) {
  const queryValue = searchParams?.q;
  const initialQuery = typeof queryValue === "string" ? queryValue : "";

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-soft">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Results</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">Conversational shopping workspace</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-ink/70">
          This page combines the AI search bar, follow-up prompts, filters, ranking explanations, and save actions in one responsive flow.
        </p>
      </section>

      <ShoppingAssistant initialQuery={initialQuery} />
    </div>
  );
}
