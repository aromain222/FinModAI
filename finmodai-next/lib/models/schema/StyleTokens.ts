/**
 * Style Tokens System
 * 
 * Shared style definitions that both Excel and UI can interpret
 * Ensures consistent appearance across Excel and preview
 */

/**
 * Typography Tokens
 */
export interface TypographyTokens {
  fontFamily: {
    default: string; // e.g., 'Calibri'
    monospace: string; // e.g., 'Courier New'
  };
  fontSize: {
    small: number; // e.g., 9
    default: number; // e.g., 11
    large: number; // e.g., 14
    xlarge: number; // e.g., 16
  };
  fontWeight: {
    normal: string; // 'normal' or '400'
    semibold: string; // '600'
    bold: string; // 'bold' or '700'
  };
}

/**
 * Color Tokens (CapitalBase Palette)
 */
export interface ColorTokens {
  background: {
    default: string; // e.g., '#FFFFFF'
    muted: string; // e.g., '#F5F5F5'
    alt: string; // e.g., '#F9F9F9'
    header: string; // e.g., '#E8E8E8'
    target: string; // e.g., '#E8F0F8' (light blue for target company)
  };
  border: {
    default: string; // e.g., '#CCCCCC'
    light: string; // e.g., '#E0E0E0'
    dark: string; // e.g., '#999999'
  };
  text: {
    default: string; // e.g., '#000000'
    muted: string; // e.g., '#666666'
    input: string; // e.g., '#0066CC' (blue for user inputs)
    formula: string; // e.g., '#000000' (black for formulas)
    link: string; // e.g., '#008000' (green for links)
    error: string; // e.g., '#FF0000' (red for errors/checks)
    warning: string; // e.g., '#FF6600' (orange for warnings)
  };
}

/**
 * Spacing Tokens
 */
export interface SpacingTokens {
  padding: {
    cell: number; // e.g., 2 (pixels)
    section: number; // e.g., 16
  };
  rowHeight: {
    default: number; // e.g., 15
    header: number; // e.g., 20
    tall: number; // e.g., 30 (for wrapped text)
  };
  borderWidth: {
    thin: number; // e.g., 1
    medium: number; // e.g., 2
    thick: number; // e.g., 3
  };
}

/**
 * Style Conventions
 */
export interface StyleConventions {
  inputs: {
    color: string; // Blue text
    italic?: boolean;
  };
  formulas: {
    color: string; // Black text
  };
  links: {
    color: string; // Green text
  };
  checks: {
    color: string; // Red text for errors
  };
  errors: {
    color: string; // Red text
  };
}

/**
 * Complete Style Tokens
 */
export interface StyleTokens {
  typography: TypographyTokens;
  colors: ColorTokens;
  spacing: SpacingTokens;
  conventions: StyleConventions;
}

/**
 * Default CapitalBase Style Tokens
 */
export const DEFAULT_STYLE_TOKENS: StyleTokens = {
  typography: {
    fontFamily: {
      default: 'Calibri',
      monospace: 'Courier New',
    },
    fontSize: {
      small: 9,
      default: 11,
      large: 14,
      xlarge: 16,
    },
    fontWeight: {
      normal: 'normal',
      semibold: '600',
      bold: 'bold',
    },
  },
  colors: {
    background: {
      default: '#FFFFFF',
      muted: '#F5F5F5',
      alt: '#F9F9F9',
      header: '#E8E8E8',
      target: '#E8F0F8', // Light blue for target company
    },
    border: {
      default: '#CCCCCC',
      light: '#E0E0E0',
      dark: '#999999',
    },
    text: {
      default: '#000000',
      muted: '#666666',
      input: '#0066CC', // Blue for user inputs
      formula: '#000000', // Black for formulas
      link: '#008000', // Green for links
      error: '#FF0000', // Red for errors
      warning: '#FF6600', // Orange for warnings
    },
  },
  spacing: {
    padding: {
      cell: 2,
      section: 16,
    },
    rowHeight: {
      default: 15,
      header: 20,
      tall: 30,
    },
    borderWidth: {
      thin: 1,
      medium: 2,
      thick: 3,
    },
  },
  conventions: {
    inputs: {
      color: '#0066CC', // Blue
      italic: true,
    },
    formulas: {
      color: '#000000', // Black
    },
    links: {
      color: '#008000', // Green
    },
    checks: {
      color: '#FF0000', // Red
    },
    errors: {
      color: '#FF0000', // Red
    },
  },
};

/**
 * Style Token References
 * 
 * Cells/rows/tables reference styles by these keys
 */
export type StyleTokenKey =
  | 'cell.default'
  | 'cell.input'
  | 'cell.formula'
  | 'cell.header'
  | 'cell.total'
  | 'cell.subtotal'
  | 'cell.target'
  | 'row.header'
  | 'row.data'
  | 'row.total'
  | 'row.subtotal'
  | 'row.target'
  | 'table.default'
  | 'table.header'
  | 'section.default';

/**
 * Get style for a token key
 */
export function getStyleForToken(
  tokenKey: StyleTokenKey,
  tokens: StyleTokens = DEFAULT_STYLE_TOKENS
): {
  font?: { name?: string; size?: number; bold?: boolean; italic?: boolean; color?: string };
  fill?: { fgColor?: { rgb?: string } };
  border?: any;
  alignment?: { horizontal?: string; vertical?: string };
} {
  // This is a simplified mapping - full implementation would map all tokens
  const style: any = {};

  if (tokenKey.includes('input')) {
    style.font = {
      color: tokens.colors.text.input,
      italic: tokens.conventions.inputs.italic,
    };
  } else if (tokenKey.includes('formula')) {
    style.font = {
      color: tokens.colors.text.formula,
    };
  } else if (tokenKey.includes('header')) {
    style.font = {
      bold: true,
      size: tokens.typography.fontSize.default,
    };
    style.fill = {
      fgColor: { rgb: tokens.colors.background.header },
    };
  } else if (tokenKey.includes('total') || tokenKey.includes('subtotal')) {
    style.font = {
      bold: true,
    };
    style.border = {
      top: { style: 'medium' },
    };
  } else if (tokenKey.includes('target')) {
    style.fill = {
      fgColor: { rgb: tokens.colors.background.target },
    };
  }

  return style;
}
