import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/shared/NavBar";

export const metadata: Metadata = {
  title: "ShopAI MVP",
  description: "Conversational product discovery and ranking assistant."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-canvas text-ink">
          <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,_rgba(13,148,136,0.12),_transparent_30%),radial-gradient(circle_at_10%_20%,_rgba(217,119,6,0.1),_transparent_25%),linear-gradient(180deg,_#fcfaf5_0%,_#f8f6f2_100%)]" />
          <NavBar />
          <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
