"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_PROMPTS = [
  "Best running shoes under $150",
  "Minimalist desk setup under $500",
  "Vanilla cologne similar to Tobacco Vanille"
];

const TRENDING_SEARCHES = [
  "Professional black quarter-zips",
  "Gift-worthy coffee tools",
  "Wireless earbuds for travel",
  "Small apartment desk setups"
];

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState(
    "I want a high quality black quarter zip sweater under $120 that looks professional but modern."
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      return;
    }

    router.push(`/results?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <section className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="rounded-[2rem] border border-black/5 bg-white/90 p-8 shadow-soft">
        <div className="mb-5 inline-flex rounded-full bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-accent">
          Search like you talk
        </div>
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
          Tell ShopAI what you want and get ranked product picks in seconds.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/70">
          The MVP interprets natural language, extracts buying intent, searches a curated catalog, and explains why each product deserves a look.
        </p>

        <form onSubmit={submitSearch} className="mt-8 rounded-[1.75rem] border border-black/5 bg-canvas p-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-2xl border border-black/5 bg-white px-5 py-4 text-base text-ink outline-none ring-0 placeholder:text-ink/35"
              placeholder="Describe exactly what you want..."
            />
            <button
              type="submit"
              className="rounded-2xl bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-accent"
            >
              Start Search
            </button>
          </div>
        </form>

        <div className="mt-8">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">Example prompts</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setQuery(prompt)}
                className="rounded-full border border-black/5 bg-white px-4 py-2 text-sm text-ink transition hover:border-accent hover:text-accent"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="rounded-[2rem] bg-ink p-8 text-white shadow-soft">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-highlight">Trending searches</div>
        <ul className="mt-6 space-y-4">
          {TRENDING_SEARCHES.map((item, index) => (
            <li key={item} className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/50">#{index + 1}</div>
              <div className="mt-2 text-lg font-medium text-white">{item}</div>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
