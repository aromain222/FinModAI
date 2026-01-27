/**
 * Marketing Layout
 * 
 * Minimal layout for public marketing pages.
 * No sidebar, no app shell - just centered content.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--cb-bg)]">
      {children}
    </div>
  );
}
