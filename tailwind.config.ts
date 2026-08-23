import type { Config } from 'tailwindcss';

/**
 * VDEAR Crypto — design tokens.
 *
 * The type system inverts the usual dashboard hierarchy on purpose: the DEFAULT
 * face is monospace, not sans. Everything the instrument reports — nav, labels,
 * tables, every number — is set in IBM Plex Mono. The serif is reserved for the
 * few places a human judgement is being expressed: the regime name, the WHY /
 * RISKS prose, the hero score. The machine speaks mono; the analyst speaks serif.
 *
 * No component declares a font family, so `sans` here is what the whole app
 * inherits through preflight.
 *
 * Semantic colors (up/down/warn/info) are CSS variables so themes can be
 * swapped without touching components.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        'panel-2': 'rgb(var(--panel-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-2': 'rgb(var(--brand-2) / <alpha-value>)',
        up: 'rgb(var(--up) / <alpha-value>)',
        down: 'rgb(var(--down) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
      },
      /* Machined edges, not app-store rounding. rounded-full is a separate key,
         so dots and pills stay circular. */
      borderRadius: {
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
