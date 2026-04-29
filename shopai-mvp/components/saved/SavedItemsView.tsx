"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/search/ProductCard";
import { Product } from "@/lib/shopping/types";

type SavedPayload = {
  savedIds: string[];
  items: Product[];
};

export function SavedItemsView() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const response = await fetch("/api/saved", { method: "GET" });
    const payload = (await response.json()) as SavedPayload;
    setSavedIds(payload.savedIds);
    setItems(payload.items);
  }

  async function removeItem(productId: string) {
    const response = await fetch("/api/saved", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId })
    });
    const payload = (await response.json()) as SavedPayload;
    setSavedIds(payload.savedIds);
    setItems(payload.items);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-ink p-6 text-white shadow-soft">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-highlight">Saved List</div>
        <p className="mt-3 text-xl leading-8">
          Your saved shortlist stays available through the MVP&apos;s `saved_items` flow and can be swapped to Supabase later.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-black/10 bg-white p-10 text-center shadow-soft">
          <p className="text-lg font-medium text-ink">You have not saved any products yet.</p>
          <p className="mt-2 text-sm text-ink/60">
            Save items from the results page to build a comparison shortlist.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              isSaved={savedIds.includes(item.id)}
              onToggleSave={removeItem}
              saveLabel="Remove"
              savedLabel="Remove"
            />
          ))}
        </div>
      )}
    </section>
  );
}
