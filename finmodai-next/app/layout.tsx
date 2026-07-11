import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { APP_NAME } from '@/lib/branding';
import { ThemeProvider } from '@/components/ThemeProvider';

// Startup validation disabled in root layout to avoid server-side throws on Vercel.
// Run validation in dev via a separate script or API route if needed.

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Institutional-grade financial modeling intelligence.',
  icons: { icon: '/capitalbase-icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
