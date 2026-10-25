import type { Config } from 'tailwindcss'

// Design tokens live as RGB triplets in app/globals.css (light + dark), so every
// utility below follows the theme. Mark colours were checked with the dataviz
// palette validator (lightness band + >= 3:1 vs surface) in both modes.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        line: token('line'),
        track: token('track'),
        'mark-muted': token('mark-muted'),
        accent: { DEFAULT: token('accent'), soft: token('accent-soft') },
        good: { DEFAULT: token('good'), soft: token('good-soft'), strong: token('good-strong') },
        bad: { DEFAULT: token('bad'), soft: token('bad-soft'), strong: token('bad-strong') },
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      borderRadius: {
        panel: '20px',
      },
      boxShadow: {
        panel: '0 1px 2px rgb(16 24 40 / 0.04), 0 12px 32px -12px rgb(16 24 40 / 0.10)',
        pill: '0 1px 2px rgb(16 24 40 / 0.06), 0 2px 8px -2px rgb(16 24 40 / 0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
