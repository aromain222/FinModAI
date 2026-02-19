/**
 * ModelDocument Schema
 * 
 * Single source of truth for all financial models
 * Used by both Excel generation and UI preview rendering
 */

/**
 * Model Metadata
 */
export interface ModelMeta {
  modelType: 'comps' | 'dcf' | 'three-statement' | 'lbo' | 'merger' | 'operating' | 'scorecard';
  companyName: string;
  ticker: string;
  asOfDate: string; // ISO date string
  currency: string; // e.g., 'USD'
  units: string; // e.g., 'millions'
  generatedAt: string; // ISO timestamp
  version?: string;
}

/**
 * Provenance Status
 */
export type ProvenanceStatus = 'reported' | 'derived' | 'inferred' | 'user_provided' | 'ai_parse' | 'missing';

/**
 * Confidence Level
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Cell Metadata (Provenance)
 */
export interface CellMeta {
  status: ProvenanceStatus;
  method?: string; // How value was obtained
  inputs_used?: string[]; // Keys used in derivation
  as_of?: string; // Date if known
  confidence?: ConfidenceLevel;
  warnings?: string[];
  source?: string; // API source name
}

/**
 * Cell Value
 */
export interface Cell {
  value: string | number | null;
  display?: string; // Preformatted string (ONLY if necessary)
  formula?: string; // Excel formula (UI ignores, uses value)
  meta?: CellMeta;
  style?: string; // Style token reference
}

/**
 * Column Definition
 */
export interface Column {
  key: string; // Canonical identifier
  label: string;
  type: 'text' | 'number' | 'currency' | 'percent' | 'multiple' | 'date';
  format?: string; // Excel-style format string (e.g., "$#,##0", "0.0%")
  align: 'left' | 'right' | 'center';
  width?: number; // Column width
  group?: string; // Group header name (for multi-level headers)
}

/**
 * Row Type
 */
export type RowType = 'header' | 'data' | 'subtotal' | 'total' | 'blank';

/**
 * Row Definition
 */
export interface Row {
  rowKey: string; // Canonical identifier
  labelCell?: string; // Label for row header
  cells: Record<string, Cell>; // Map of columnKey -> Cell
  rowType: RowType;
  indentLevel?: number; // 0..n for hierarchical rows
  style?: string; // Style token reference
}

/**
 * Table Grid Configuration
 */
export interface TableGrid {
  freezePanes?: {
    row?: number;
    column?: number;
  };
  columnWidths?: Record<string, number>; // Map of columnKey -> width
  hideGridlines?: boolean;
}

/**
 * Table Block
 */
export interface TableBlock {
  type: 'table';
  tableId: string;
  title?: string;
  subtitle?: string;
  columns: Column[];
  rows: Row[];
  styles?: Record<string, string>; // Style token references
  grid?: TableGrid;
  footnotes?: string[];
}

/**
 * Text Block
 */
export interface TextBlock {
  type: 'text';
  content: string;
  style?: string;
}

/**
 * Spacer Block
 */
export interface SpacerBlock {
  type: 'spacer';
  height?: number; // Rows of spacing
}

/**
 * Chart Block (ONLY if Excel model contains chart)
 */
export interface ChartBlock {
  type: 'chart';
  chartId: string;
  chartType: 'line' | 'bar' | 'column' | 'pie' | 'scatter';
  title?: string;
  dataRange?: string; // Excel range reference
  // Chart configuration would go here
  // For now, charts are represented but not fully defined
}

/**
 * Callout Block (Notes/Disclaimers)
 */
export interface CalloutBlock {
  type: 'callout';
  content: string;
  variant?: 'note' | 'warning' | 'disclaimer';
  style?: string;
}

/**
 * Block Union Type
 */
export type Block = TableBlock | TextBlock | SpacerBlock | ChartBlock | CalloutBlock;

/**
 * Section Layout
 */
export type SectionLayout = 'fullWidth' | 'twoColumn' | 'grid' | 'stacked';

/**
 * Section
 */
export interface Section {
  id: string;
  title?: string;
  subtitle?: string;
  sheetName?: string;
  layout: SectionLayout;
  blocks: Block[];
  style?: string;
}

/**
 * Model Document (Root)
 */
export interface ModelDocument {
  meta: ModelMeta;
  sections: Section[];
  globalStyles?: Record<string, any>; // Style token definitions
}

/**
 * Type Guards
 */
export function isTableBlock(block: Block): block is TableBlock {
  return block.type === 'table';
}

export function isTextBlock(block: Block): block is TextBlock {
  return block.type === 'text';
}

export function isSpacerBlock(block: Block): block is SpacerBlock {
  return block.type === 'spacer';
}

export function isChartBlock(block: Block): block is ChartBlock {
  return block.type === 'chart';
}

export function isCalloutBlock(block: Block): block is CalloutBlock {
  return block.type === 'callout';
}
