'use client';

import React from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';

export default function AntdProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          // Primary color (emerald green to match app theme)
          colorPrimary: '#22c55e',
          
          // Base colors
          colorBgBase: '#0b0f14',
          colorBgContainer: '#14181e',
          colorBgElevated: '#1a1f26',
          colorBgLayout: '#0b0f14',
          
          // Text colors
          colorText: '#e5e7eb',
          colorTextBase: '#e5e7eb',
          colorTextSecondary: '#9ba3b0',
          colorTextTertiary: '#6f7782',
          colorTextQuaternary: '#4a5568',
          
          // Border colors
          colorBorder: '#1b2028',
          colorBorderSecondary: '#27303a',
          
          // Fill colors
          colorFill: 'rgba(255, 255, 255, 0.06)',
          colorFillSecondary: 'rgba(255, 255, 255, 0.04)',
          colorFillTertiary: 'rgba(255, 255, 255, 0.02)',
          
          // Typography
          fontSize: 14,
          fontSizeLG: 16,
          fontSizeSM: 12,
          lineHeight: 1.5,
          
          // Border radius
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 4,
          
          // Control
          controlHeight: 36,
          controlHeightLG: 40,
          controlHeightSM: 28,
        },
        components: {
          // Card component
          Card: {
            colorBgContainer: '#14181e',
            colorBorderSecondary: '#1b2028',
            paddingLG: 20,
            padding: 16,
          },
          // Table component
          Table: {
            colorBgContainer: '#14181e',
            colorBorderSecondary: '#1b2028',
            colorFillAlter: 'rgba(255, 255, 255, 0.02)',
            colorFillSecondary: 'rgba(255, 255, 255, 0.04)',
          },
          // Alert component
          Alert: {
            colorBgContainer: '#14181e',
            colorBorder: '#1b2028',
          },
          // Segmented component
          Segmented: {
            colorBgLayout: '#1a1f26',
            colorBgElevated: '#14181e',
            colorBorder: '#1b2028',
          },
          // Select/Dropdown component
          Select: {
            colorBgContainer: '#14181e',
            colorBorder: '#1b2028',
            colorText: '#e5e7eb',
            optionSelectedBg: 'rgba(34, 197, 94, 0.15)',
          },
          // Input component
          Input: {
            colorBgContainer: '#0b0f15',
            colorBorder: '#1b2028',
            colorText: '#f9fafb',
            colorTextPlaceholder: '#6f7782',
          },
          // Button component
          Button: {
            colorBgContainer: '#14181e',
            colorBorder: '#1b2028',
          },
          // Collapse component
          Collapse: {
            colorBgContainer: '#14181e',
            colorBorder: '#1b2028',
            colorText: '#e5e7eb',
          },
          // List component
          List: {
            colorBgContainer: '#14181e',
            colorBorder: '#1b2028',
          },
          // Tag component
          Tag: {
            colorBgContainer: '#1a1f26',
            colorBorder: '#27303a',
          },
          // Badge component
          Badge: {
            colorBgContainer: '#14181e',
          },
          // Tooltip component
          Tooltip: {
            colorBgSpotlight: '#1a1f26',
          },
          // Empty component
          Empty: {
            colorTextSecondary: '#6f7782',
          },
          // Skeleton component
          Skeleton: {
            colorFill: 'rgba(255, 255, 255, 0.06)',
            colorFillContent: 'rgba(255, 255, 255, 0.04)',
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
