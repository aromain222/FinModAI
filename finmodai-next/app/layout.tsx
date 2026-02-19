import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { APP_NAME } from '@/lib/branding';

// Validate API keys at startup (server-side only)
if (typeof window === 'undefined') {
  try {
    require('@/lib/startupValidation');
  } catch (error) {
    // Ignore errors during build
  }
}
import { ThemeProvider } from '@/components/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Institutional-grade financial modeling intelligence.'
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
