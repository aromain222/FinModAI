/**
 * ModelDocument Schema
 * 
 * Single source of truth for all financial models
 * Used by both Excel generation and UI preview rendering
 */

// Core Schema
export type {
  ModelDocument,
  ModelMeta,
  Section,
  Block,
  TableBlock,
  TextBlock,
  SpacerBlock,
  ChartBlock,
  CalloutBlock,
  Column,
  Row,
  Cell,
  CellMeta,
  RowType,
  SectionLayout,
  TableGrid,
  ProvenanceStatus,
  ConfidenceLevel,
} from './ModelDocument';

export {
  isTableBlock,
  isTextBlock,
  isSpacerBlock,
  isChartBlock,
  isCalloutBlock,
} from './ModelDocument';

// Style Tokens
export type {
  StyleTokens,
  TypographyTokens,
  ColorTokens,
  SpacingTokens,
  StyleConventions,
  StyleTokenKey,
} from './StyleTokens';

export {
  DEFAULT_STYLE_TOKENS,
  getStyleForToken,
} from './StyleTokens';

// Mappings
export type {
  UIPreviewConfig,
} from './mappings';

export {
  mapDocumentToExcel,
  mapTableBlockToExcel,
  getTruncatedRows,
  getTruncatedColumns,
  formatCellForUI,
  getCellStyleForUI,
} from './mappings';

// Examples
export {
  EXAMPLE_TRADING_COMPS,
  EXAMPLE_DCF_SUMMARY,
  EXAMPLE_THREE_STATEMENT,
} from './examples';
