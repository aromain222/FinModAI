import type { Metadata } from 'next';
import * as Sentry from '@sentry/nextjs';
import '@/styles/globals.css';
import 'antd/dist/reset.css';
import { APP_NAME } from '@/lib/branding';
import { ThemeProvider } from '@/components/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import AntdProvider from '@/app/antd-provider';

export function generateMetadata(): Metadata {
  return {
    title: APP_NAME,
    description: 'Institutional-grade financial modeling intelligence.',
    other: {
      ...Sentry.getTraceData(),
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans">
        <QueryProvider>
          <ThemeProvider>
            <AntdProvider>{children}</AntdProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
