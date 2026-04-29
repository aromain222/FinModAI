"use client";

import { FormEvent, useEffect, useState } from "react";
import { ProductCard } from "@/components/search/ProductCard";
import { formatCurrency } from "@/lib/shopping/format";
import { ConversationTurn, SearchFilters, SearchResponse } from "@/lib/shopping/types";

const QUICK_REFINEMENTS = ["Show cheaper options", "Only brands with good reviews", "Make it more minimalist"];

type ShoppingAssistantProps = {
  initialQuery: string;
};

export function ShoppingAssistant({ initialQuery }: ShoppingAssistantProps) {
  const [draft, setDraft] = useState(initialQuery);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshSaved();
  }, []);

  useEffect(() => {
    if (!initialQuery) {
      return;
    }

    setConversation([]);
    setResponse(null);
    setFilters({});
    setDraft(initialQuery);
    void executeSearch(initialQuery, {}, true, []);
  }, [initialQuery]);

  async function refreshSaved() {
    const savedResponse = await fetch("/api/saved", { method: "GET" });
    const payload = (await savedResponse.json()) as { savedIds: string[] };
    setSavedIds(payload.savedIds);
  }

  function getLastUserPrompt() {
    const latestUserTurn = [...conversation].reverse().find((turn) => turn.role === "user");
    return latestUserTurn?.content ?? initialQuery;
  }

  async function executeSearch(
    nextQuery: string,
    nextFilters: SearchFilters,
    appendConversation = true,
    historyOverride?: ConversationTurn[]
  ) {
    if (!nextQuery.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchResponse = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nextQuery,
          history: historyOverride ?? conversation,
          filters: nextFilters
        })
      });

      if (!searchResponse.ok) {
        throw new Error("Search request failed");
      }

      const payload = (await searchResponse.json()) as SearchResponse;
      setResponse(payload);
      if (appendConversation) {
        setConversation((current) => [
          ...current,
          { role: "user", content: nextQuery },
          { role: "assistant", content: payload.summary }
        ]);
      }
      setDraft(appendConversation ? "" : nextQuery);
      setFilters(nextFilters);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to complete the search.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await executeSearch(draft, filters, true);
  }

  async function handleApplyFilters() {
    await executeSearch(getLastUserPrompt(), filters, false);
  }

  async function toggleSaved(productId: string) {
    const savedResponse = await fetch("/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId })
    });
    const payload = (await savedResponse.json()) as { savedIds: string[] };
    setSavedIds(payload.savedIds);
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Conversation</div>
          <div className="mt-4 space-y-3">
            {conversation.length === 0 ? (
              <p className="rounded-2xl bg-canvas p-4 text-sm leading-6 text-ink/70">
                Start with a plain-English shopping prompt and refine from there.
              </p>
            ) : (
              conversation.map((turn, index) => (
                <div
                  key={`${turn.role}-${index}`}
                  className={`rounded-2xl p-4 text-sm leading-6 ${
                    turn.role === "user" ? "bg-ink text-white" : "bg-canvas text-ink/80"
                  }`}
                >
                  {turn.content}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Filters</div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">Max price</span>
              <input
                type="number"
                min="0"
                value={filters.maxPrice ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    maxPrice: event.target.value ? Number(event.target.value) : undefined
                  }))
                }
                className="w-full rounded-2xl border border-black/10 bg-canvas px-4 py-3 outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">Min rating</span>
              <select
                value={filters.minRating ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    minRating: event.target.value ? Number(event.target.value) : undefined
                  }))
                }
                className="w-full rounded-2xl border border-black/10 bg-canvas px-4 py-3 outline-none"
              >
                <option value="">Any rating</option>
                <option value="4.3">4.3+</option>
                <option value="4.5">4.5+</option>
                <option value="4.7">4.7+</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">Brand</span>
              <select
                value={filters.brand ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    brand: event.target.value || undefined
                  }))
                }
                className="w-full rounded-2xl border border-black/10 bg-canvas px-4 py-3 outline-none"
              >
                <option value="">All brands</option>
                {(response?.availableBrands ?? []).map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleApplyFilters}
              className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent"
            >
              Apply filters
            </button>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Refine fast</div>
          <div className="mt-4 flex flex-col gap-3">
            {QUICK_REFINEMENTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setDraft(prompt);
                  void executeSearch(prompt, filters, true);
                }}
                className="rounded-2xl border border-black/5 px-4 py-3 text-left text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="space-y-6">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-soft"
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Refine with natural language..."
              className="w-full rounded-2xl border border-black/10 bg-canvas px-5 py-4 text-base outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-accent px-6 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Searching..." : "Ask ShopAI"}
            </button>
          </div>
        </form>

        {error ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {response ? (
          <>
            <section className="rounded-[2rem] bg-ink p-6 text-white shadow-soft">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-highlight">ShopAI Summary</div>
              <p className="mt-3 text-xl leading-8">{response.summary}</p>
              <div className="mt-5 flex flex-wrap gap-3 text-sm text-white/70">
                {response.structuredQuery.category ? (
                  <span className="rounded-full bg-white/10 px-4 py-2">
                    Category: {response.structuredQuery.category}
                  </span>
                ) : null}
                {response.structuredQuery.maxPrice ? (
                  <span className="rounded-full bg-white/10 px-4 py-2">
                    Budget: {formatCurrency(response.structuredQuery.maxPrice)}
                  </span>
                ) : null}
                {response.structuredQuery.styles.map((style) => (
                  <span key={style} className="rounded-full bg-white/10 px-4 py-2">
                    {style}
                  </span>
                ))}
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
              {response.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isSaved={savedIds.includes(product.id)}
                  onToggleSave={toggleSaved}
                />
              ))}
            </section>
          </>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-black/10 bg-white/70 p-10 text-center shadow-soft">
            <p className="text-lg font-medium text-ink">Enter a shopping request to see ranked recommendations.</p>
            <p className="mt-3 text-sm text-ink/60">
              Natural language parsing, retrieval, ranking, and concise reasoning all happen through the `/api/search` endpoint.
            </p>
          </section>
        )}
      </section>
    </div>
  );
}
