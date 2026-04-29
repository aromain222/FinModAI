import Link from "next/link";

const navLinks = [
  { href: "/", label: "Discover" },
  { href: "/results", label: "Results" },
  { href: "/saved", label: "Saved" }
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-panel/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-lg font-semibold text-white">
            S
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">ShopAI</div>
            <div className="text-sm text-ink/70">Conversational shopping assistant</div>
          </div>
        </Link>
        <nav className="flex items-center gap-2 rounded-full border border-black/5 bg-white/80 p-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
