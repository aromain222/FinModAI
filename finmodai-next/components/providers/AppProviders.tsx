'use client';

import React from 'react';
import 'antd/dist/reset.css';

import { QueryProvider } from './QueryProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AntdProvider } from './AntdProvider';

/**
 * Root client-side providers for the application
 * 
 * Wraps children with:
 * - React Query QueryProvider
 * - Theme Provider
 * - Ant Design Provider (dark theme)
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AntdProvider>
          {children}
        </AntdProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}

