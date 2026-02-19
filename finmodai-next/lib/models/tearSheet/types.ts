/**
 * TearSheet Types
 *
 * Canonical "results-page" render contract for model outputs.
 * This is intentionally UI-focused (tables/blocks) and distinct from ModelDocument.
 */

export type TearSheetBadgeTone = 'neutral' | 'success' | 'danger' | 'warning';

export type TearSheetFormat = 'currency' | 'percent' | 'number' | 'multiple' | 'text';

export type TearSheetTableColumn = {
  header: string;
  format?: TearSheetFormat;
  align?: 'left' | 'right' | 'center';
  unit?: 'raw' | 'thousands' | 'millions' | 'billions';
  decimals?: number;
};

export type TearSheetTableRow = Array<string | number | null | undefined>;

export type TearSheetBlock =
  | {
      type: 'table';
      title: string;
      columns: TearSheetTableColumn[];
      rows: TearSheetTableRow[];
      unitNote?: string;
    }
  | {
      type: 'bridge';
      title: string;
      lines: Array<{
        label: string;
        value: number | null | undefined;
        format: TearSheetFormat;
        unit?: 'raw' | 'thousands' | 'millions' | 'billions';
        decimals?: number;
        isSubtotal?: boolean;
        isTotal?: boolean;
      }>;
    }
  | {
      type: 'callout';
      tone: 'info' | 'warning';
      title: string;
      bullets: string[];
      ctaLabel?: string;
      ctaHref?: string;
    }
  | {
      type: 'chart';
      title: string;
      // Placeholder until chart block is implemented.
      data?: any;
    };

export type TearSheetAssumptionChip = {
  label: string;
  value: number | string | null | undefined;
  format: TearSheetFormat;
  unit?: 'raw' | 'thousands' | 'millions' | 'billions';
  decimals?: number;
};

export interface TearSheet {
  header: {
    ticker: string;
    modelName: string;
    createdAt?: string;
    scenario?: string;
  };
  kpis: Array<{
    label: string;
    value: number | null | undefined;
    format: TearSheetFormat;
    note?: string;
    unit?: 'raw' | 'thousands' | 'millions' | 'billions';
    decimals?: number;
  }>;
  mainBlocks: TearSheetBlock[];
  bottomBlocks?: TearSheetBlock[];
  sidebar: {
    assumptions?: TearSheetAssumptionChip[];
    diagnostics: {
      coverage?: Array<{
        label: string;
        status: 'available' | 'partial' | 'unavailable';
        note?: string;
      }>;
      defaults?: Array<{ path: string; value: any }>;
      warnings?: string[];
    };
  };
}
