import MarketingLayoutClient from './MarketingLayoutClient';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--cb-bg)]">
      <MarketingLayoutClient />
      {children}
    </div>
  );
}