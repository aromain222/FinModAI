/**
 * PageShell - Consistent page layout wrapper
 * 
 * Provides:
 * - Max width container (1400px on large screens)
 * - Consistent padding (24px on desktop, 16px on mobile)
 * - Ant Design Layout structure
 */

'use client';

import React from 'react';
import { Layout, Grid } from 'antd';
import type { ReactNode } from 'react';

const { Content } = Layout;
const { useBreakpoint } = Grid;

interface PageShellProps {
  children: ReactNode;
  maxWidth?: number;
  padding?: number | { desktop: number; mobile: number };
}

export function PageShell({ 
  children, 
  maxWidth = 1300,
  padding = { desktop: 24, mobile: 16 }
}: PageShellProps) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const paddingValue = typeof padding === 'number' 
    ? padding 
    : isMobile 
    ? padding.mobile 
    : padding.desktop;

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Content
        style={{
          maxWidth: `${maxWidth}px`,
          width: '100%',
          margin: '0 auto',
          padding: `${paddingValue}px`,
        }}
      >
        {children}
      </Content>
    </Layout>
  );
}

