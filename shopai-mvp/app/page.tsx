import Link from "next/link";
import { HeroSearch } from "@/components/home/HeroSearch";

const FEATURE_BLOCKS = [
  {
    title: "Natural language intake",
    body: "Users describe what they want in plain English, and ShopAI extracts category, price, style, and quality signals."
  },
  {
    title: "Retrieval + ranking",
    body: "The MVP searches a seeded catalog, scores product fit, and writes compact one-line reasoning for every recommendation."
  },
  {
    title: "Conversation-driven refinement",
    body: "Follow-up prompts such as “show cheaper options” or “make it more minimalist” re-rank the same shortlist dynamically."
  }
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <HeroSearch />

      <section className="grid gap-6 lg:grid-cols-3">
        {FEATURE_BLOCKS.map((feature) => (
          <article key={feature.title} className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-soft">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Core feature</div>
            <h2 className="mt-4 text-2xl font-semibold text-ink">{feature.title}</h2>
            <p className="mt-3 text-sm leading-7 text-ink/70">{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] bg-white p-8 shadow-soft">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">MVP flow</div>
            <h2 className="mt-3 text-3xl font-semibold text-ink">From prompt to purchase path in one interface.</h2>
          </div>
          <Link
            href="/results"
            className="inline-flex rounded-2xl bg-ink px-5 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-accent"
          >
            Explore the results workspace
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-canvas p-5">
            <div className="text-sm font-semibold text-ink">1. Query understanding</div>
            <p className="mt-2 text-sm leading-6 text-ink/65">ShopAI parses the request into structured buying constraints.</p>
          </div>
          <div className="rounded-3xl bg-canvas p-5">
            <div className="text-sm font-semibold text-ink">2. Product ranking</div>
            <p className="mt-2 text-sm leading-6 text-ink/65">The engine ranks catalog candidates with explicit budget and style weighting.</p>
          </div>
          <div className="rounded-3xl bg-canvas p-5">
            <div className="text-sm font-semibold text-ink">3. Decision support</div>
            <p className="mt-2 text-sm leading-6 text-ink/65">Cards, saved items, and product detail pages reduce comparison friction.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
