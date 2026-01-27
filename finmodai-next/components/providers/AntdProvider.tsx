'use client';

import React from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';

/**
 * Ant Design dark theme provider
 * 
 * Provides a true dark theme that matches the existing dark UI.
 * Must be a client component to use theme algorithms.
 */
export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          // Base colors
          colorBgBase: '#000000',
          colorBgContainer: '#0a0a0a',
          colorText: '#ffffff',
          colorTextSecondary: '#a0a0a0',
          colorBorder: '#262626',
          
          // Brand colors
          colorPrimary: '#1890ff',
          colorSuccess: '#52c41a',
          colorWarning: '#faad14',
          colorError: '#ff4d4f',
          colorInfo: '#1890ff',
          
          // Spacing and sizing
          borderRadiusLG: 12,
          controlHeight: 40,
        },
        components: {
          Card: {
            headerBg: '#141414',
            colorBgContainer: '#0a0a0a',
            colorBorder: '#262626',
            borderRadiusLG: 12,
          },
          Table: {
            colorBgContainer: '#0a0a0a',
            headerBg: '#141414',
            headerColor: '#ffffff',
            colorText: '#ffffff',
            colorTextHeading: '#ffffff',
            colorBorderSecondary: '#262626',
            rowHoverBg: '#141414',
          },
          Select: {
            colorBgContainer: '#0a0a0a',
            colorBorder: '#262626',
            colorText: '#ffffff',
            colorTextPlaceholder: '#a0a0a0',
            optionSelectedBg: '#1890ff',
            optionSelectedColor: '#ffffff',
            optionActiveBg: '#141414',
            colorBgElevated: '#141414',
          },
          Segmented: {
            itemColor: '#ffffff',
            itemSelectedBg: '#1890ff',
            itemSelectedColor: '#ffffff',
            itemHoverBg: '#141414',
            trackBg: '#0a0a0a',
            colorBgLayout: '#0a0a0a',
          },
          Tabs: {
            itemColor: '#a0a0a0',
            itemSelectedColor: '#1890ff',
            itemHoverColor: '#ffffff',
            itemActiveColor: '#1890ff',
            inkBarColor: '#1890ff',
            colorBorderSecondary: '#262626',
            colorBgContainer: '#0a0a0a',
          },
          Typography: {
            colorText: '#ffffff',
            colorTextSecondary: '#a0a0a0',
            colorTextHeading: '#ffffff',
          },
          Alert: {
            colorInfoBg: '#0a0a0a',
            colorInfoBorder: '#1890ff',
            colorWarningBg: '#0a0a0a',
            colorWarningBorder: '#faad14',
            colorErrorBg: '#0a0a0a',
            colorErrorBorder: '#ff4d4f',
            colorSuccessBg: '#0a0a0a',
            colorSuccessBorder: '#52c41a',
            colorText: '#ffffff',
          },
          Collapse: {
            headerBg: '#0a0a0a',
            contentBg: '#0a0a0a',
            headerPadding: '12px 16px',
            contentPadding: '0 16px 12px 16px',
            colorBorder: '#262626',
            colorText: '#ffffff',
            colorTextHeading: '#ffffff',
          },
          List: {
            itemPadding: '8px 0',
            headerBg: '#0a0a0a',
            footerBg: '#0a0a0a',
            colorText: '#ffffff',
            colorTextDescription: '#a0a0a0',
          },
          Statistic: {
            contentFontSize: 20,
            colorText: '#ffffff',
            colorTextDescription: '#a0a0a0',
          },
          Tag: {
            defaultBg: '#262626',
            defaultColor: '#ffffff',
          },
          Tooltip: {
            colorBgSpotlight: '#141414',
            colorText: '#ffffff',
          },
          Radio: {
            buttonBg: '#0a0a0a',
            buttonSolidCheckedBg: '#1890ff',
            buttonSolidCheckedColor: '#ffffff',
            buttonCheckedBg: '#1890ff',
            buttonCheckedActiveBg: '#1890ff',
            colorBorder: '#262626',
            colorText: '#ffffff',
          },
          Input: {
            colorBgContainer: '#0a0a0a',
            colorBorder: '#262626',
            colorText: '#ffffff',
            colorTextPlaceholder: '#a0a0a0',
          },
          Button: {
            colorBgContainer: '#0a0a0a',
            colorBorder: '#262626',
            colorText: '#ffffff',
            defaultHoverBg: '#141414',
            defaultHoverBorderColor: '#1890ff',
            defaultHoverColor: '#ffffff',
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

