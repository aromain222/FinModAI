import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: '#1B2028',
        input: '#1E242C',
        ring: '#00E387',
        background: '#0B0E13',
        foreground: '#E6E9ED',
        primary: {
          DEFAULT: '#00E387',
          foreground: '#041007'
        },
        secondary: {
          DEFAULT: '#111418',
          foreground: '#E6E9ED'
        },
        muted: {
          DEFAULT: '#151A20',
          foreground: '#6F7782'
        },
        accent: {
          DEFAULT: '#14181E',
          foreground: '#E6E9ED'
        },
        destructive: {
          DEFAULT: '#F25F5C',
          foreground: '#0B0E13'
        },
        cb: {
          navy: '#0B0E13',
          blue: '#00E387',
          ink: '#FFFFFF',
          slate: '#9BA3B0',
          soft: '#111418',
          line: '#1B2028',
          gold: '#E6E9ED',
          success: '#00E387',
          danger: '#F25F5C',
          text: {
            main: '#FFFFFF',
            muted: '#6F7782'
          }
        },
        panel: {
          DEFAULT: '#12161C',
          subtle: '#111418',
          raised: '#1A1F29'
        },
        brand: {
          green: '#00E387'
        }
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem'
      },
      boxShadow: {
        panel: '0px 0px 8px rgba(0,0,0,0.4)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [animate]
};

export default config;
