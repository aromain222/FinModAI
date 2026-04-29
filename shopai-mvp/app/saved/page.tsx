import { SavedItemsView } from "@/components/saved/SavedItemsView";

export default function SavedPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-soft">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Saved</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">Your saved comparison list</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-ink/70">
          This page surfaces products bookmarked from the results flow so a shopper can revisit options before purchasing.
        </p>
      </section>

      <SavedItemsView />
    </div>
  );
}
