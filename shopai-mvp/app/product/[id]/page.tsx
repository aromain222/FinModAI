import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductById, PRODUCTS } from "@/lib/data/products";
import { formatCurrency } from "@/lib/shopping/format";

type ProductPageProps = {
  params: {
    id: string;
  };
};

export default function ProductPage({ params }: ProductPageProps) {
  const product = getProductById(params.id);

  if (!product) {
    notFound();
  }

  const similarItems = PRODUCTS.filter(
    (candidate) => candidate.category === product.category && candidate.id !== product.id
  ).slice(0, 3);

  return (
    <div className="space-y-8">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-soft">
          <div className="h-[420px] bg-gradient-to-br from-amber-100 via-white to-teal-100">
            <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
          </div>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-white p-8 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">{product.brand}</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">{product.name}</h1>
          <p className="mt-4 text-lg leading-8 text-ink/70">{product.description}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-canvas p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Price</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{formatCurrency(product.price)}</div>
            </div>
            <div className="rounded-3xl bg-canvas p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Rating</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{product.rating.toFixed(1)}</div>
            </div>
            <div className="rounded-3xl bg-canvas p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Retailer</div>
              <div className="mt-2 text-lg font-semibold text-ink">{product.retailer}</div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl bg-ink p-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-highlight">AI Take</div>
            <p className="mt-3 text-base leading-7">
              {product.name} is a strong fit if you want something {product.styles.slice(0, 2).join(" and ")}
              , with a {formatCurrency(product.price)} price point and {product.rating.toFixed(1)} rating.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {product.styles.concat(product.colors).slice(0, 6).map((tag) => (
              <span
                key={`${product.id}-${tag}`}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-ink/70"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-8 flex gap-3">
            <a
              href={product.purchaseUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-2xl bg-ink px-5 py-4 text-center text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-accent"
            >
              View Product
            </a>
            <Link
              href="/saved"
              className="flex-1 rounded-2xl border border-black/10 px-5 py-4 text-center text-sm font-semibold uppercase tracking-[0.16em] text-ink transition hover:border-accent hover:text-accent"
            >
              Open Saved
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-black/5 bg-white p-8 shadow-soft">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Similar items</div>
            <h2 className="mt-3 text-3xl font-semibold text-ink">More in this category</h2>
          </div>
          <Link href="/results" className="text-sm font-semibold text-accent">
            Back to search
          </Link>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {similarItems.map((item) => (
            <Link
              key={item.id}
              href={`/product/${item.id}`}
              className="rounded-[1.5rem] bg-canvas p-5 transition hover:-translate-y-1"
            >
              <div className="overflow-hidden rounded-3xl bg-white">
                <img src={item.image} alt={item.name} className="h-40 w-full object-cover" />
              </div>
              <div className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-accent">{item.brand}</div>
              <div className="mt-2 text-xl font-semibold text-ink">{item.name}</div>
              <div className="mt-2 text-sm text-ink/60">{formatCurrency(item.price)}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
