/**
 * Centralized theme tokens for CapitalBase
 * Ensures consistent colors, spacing, and typography across the app
 */

export const theme = {
  colors: {
    // Backgrounds
    bg: {
      light: '#f5f7fb',
      dark: '#0b0e13',
    },
    panel: {
      light: '#ffffff',
      dark: '#12161c',
    },
    card: {
      light: '#ffffff',
      dark: '#14181e',
    },
    surface: {
      light: '#f1f5f9',
      dark: '#111418',
    },
    
    // Borders
    border: {
      light: '#d1d5db',
      dark: '#1b2028',
    },
    borderSubtle: {
      light: '#e5e7eb',
      dark: '#1b2028',
    },
    borderStrong: {
      light: '#94a3b8',
      dark: '#27303a',
    },
    
    // Text
    text: {
      light: '#0f172a',
      dark: '#ffffff',
    },
    textSecondary: {
      light: '#1f2937',
      dark: '#e6e9ed',
    },
    textMuted: {
      light: '#94a3b8',
      dark: '#6f7782',
    },
    textBody: {
      light: '#475569',
      dark: '#9ba3b0',
    },
    
    // Accent (electric green)
    accent: '#00e387',
    accentSoft: 'rgba(0, 227, 135, 0.1)',
    accentHover: '#00c975',
    
    // Status colors
    danger: '#f25f5c',
    warning: '#f59e0b',
    success: '#00e387',
    
    // Inputs
    inputBg: {
      light: '#ffffff',
      dark: '#0b0f15',
    },
    inputText: {
      light: '#0f172a',
      dark: '#f9fafb',
    },
    inputPlaceholder: {
      light: '#9ca3af',
      dark: '#6f7782',
    },
  },
  
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
  },
  
  borderRadius: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
  },
  
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    panel: '0px 0px 8px rgba(0, 0, 0, 0.4)',
  },
} as const;

/**
 * Get theme-aware color value based on dark mode
 */
export function getThemeColor(
  colorKey: keyof typeof theme.colors,
  isDark: boolean
): string {
  const color = theme.colors[colorKey];
  if (typeof color === 'string') {
    return color;
  }
  return isDark ? color.dark : color.light;
}

/**
 * CSS variable names for use in Tailwind/CSS
 */
export const cssVars = {
  bg: '--cb-bg',
  panel: '--cb-panel',
  card: '--cb-card',
  surface: '--cb-surface',
  border: '--cb-border',
  borderSubtle: '--cb-border-subtle',
  borderStrong: '--cb-border-strong',
  text: '--cb-text-primary',
  textSecondary: '--cb-text-secondary',
  textMuted: '--cb-text-muted',
  textBody: '--cb-text-body',
  accent: '--cb-green',
  accentSoft: '--cb-accent-soft',
  danger: '--cb-danger',
  warning: '--cb-warning',
  inputBg: '--cb-input-bg',
  inputText: '--cb-input-text',
  inputPlaceholder: '--cb-input-placeholder',
} as const;
