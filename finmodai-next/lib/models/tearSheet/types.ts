/**
 * Canonical Tear Sheet Types
 * 
 * Defines the structure that all model tear sheets must conform to.
 * The UI renders ONLY from this TearSheet object. No random per-model shape reading.
 */

import type { FormatType } from '@/lib/format/finance';

export type MoneyUnit = 'raw' | 'thousands' | 'millions' | 'billions';

export type TearSheetKpi = {
  label: string;
  value: number | null;
  format: 'money' | 'pct' | 'multiple' | 'text';
  note?: string;
  unit?: MoneyUnit;
  decimals?: number;
};

export type TearSheetChip = {
  label: string;
  value: string; // Already formatted
};

export type TearSheetTableBlock = {
  type: 'table';
  title: string;
  columns: Array<{
    header: string;
    format?: FormatType;
    align?: 'left' | 'right' | 'center';
    unit?: MoneyUnit;
    decimals?: number;
  }>;
  rows: (string | number | null)[][];
  unitNote?: string;
};

export type TearSheetBridgeBlock = {
  type: 'bridge';
  title: string;
  lines: Array<{
    label: string;
    value: number | null;
    format: FormatType;
    unit?: MoneyUnit;
    decimals?: number;
    isSubtotal?: boolean;
    isTotal?: boolean;
  }>;
};

export type TearSheetChartBlock = {
  type: 'chart';
  title: string;
  data: any; // Chart-specific data structure
};

export type TearSheetCalloutBlock = {
  type: 'callout';
  tone: 'warning' | 'info';
  title: string;
  bullets: string[];
  ctaLabel?: string;
  ctaHref?: string;
};

export type TearSheetMainBlock =
  | TearSheetTableBlock
  | TearSheetBridgeBlock
  | TearSheetChartBlock
  | TearSheetCalloutBlock;

export type TearSheetDiagnostic = {
  label: string;
  status: 'available' | 'partial' | 'unavailable';
  note?: string;
};

export type TearSheet = {
  header: {
    ticker: string;
    modelName: string;
    scenario?: string;
    createdAt?: string;
  };
  kpis: TearSheetKpi[];
  chips: TearSheetChip[];
  mainBlocks: TearSheetMainBlock[];
  sidebar: {
    diagnostics: {
      coverage: TearSheetDiagnostic[];
      defaults: Array<{ path: string; value: any }>;
      warnings: string[];
    };
    assumptions?: TearSheetChip[];
  };
  bottomBlocks?: TearSheetMainBlock[];
};
