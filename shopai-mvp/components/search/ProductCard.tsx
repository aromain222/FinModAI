"use client";

import Link from "next/link";
import { Product, RankedProduct } from "@/lib/shopping/types";
import { formatCurrency } from "@/lib/shopping/format";

type DisplayProduct = Product & Partial<Pick<RankedProduct, "explanation" | "score">>;

type ProductCardProps = {
  product: DisplayProduct;
  isSaved?: boolean;
  onToggleSave?: (productId: string) => void;
  saveLabel?: string;
  savedLabel?: string;
};

export function ProductCard({
  product,
  isSaved = false,
  onToggleSave,
  saveLabel = "Save",
  savedLabel = "Saved"
}: ProductCardProps) {
  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-soft">
      <div className="relative h-52 overflow-hidden bg-gradient-to-br from-amber-100 via-white to-teal-100">
        <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink">
          {product.category}
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{product.brand}</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{product.name}</h3>
          </div>
          <div className="rounded-2xl bg-canvas px-3 py-2 text-right">
            <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Price</div>
            <div className="text-lg font-semibold text-ink">{formatCurrency(product.price)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-ink/65">
          <span>{product.retailer}</span>
          <span>{product.rating.toFixed(1)} / 5.0</span>
        </div>

        <p className="text-sm leading-6 text-ink/75">{product.explanation ?? product.summary}</p>

        <div className="flex flex-wrap gap-2">
          {product.styles.slice(0, 3).map((style) => (
            <span
              key={`${product.id}-${style}`}
              className="rounded-full bg-ink/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-ink/70"
            >
              {style}
            </span>
          ))}
        </div>

        <div className="flex gap-3">
          <Link
            href={`/product/${product.id}`}
            className="flex-1 rounded-2xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent"
          >
            View Product
          </Link>
          <a
            href={product.purchaseUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-2xl border border-black/10 px-4 py-3 text-center text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
          >
            Retailer
          </a>
        </div>

        {onToggleSave ? (
          <button
            type="button"
            onClick={() => onToggleSave(product.id)}
            className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              isSaved
                ? "bg-highlight text-white hover:bg-highlight/90"
                : "bg-canvas text-ink hover:bg-ink hover:text-white"
            }`}
          >
            {isSaved ? savedLabel : saveLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}
