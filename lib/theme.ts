/**
 * Theme colours for canvas and chart libraries.
 *
 * Recharts and Lightweight Charts paint into a canvas, so they cannot inherit a
 * Tailwind class. Reading the CSS variable at call time keeps them on the same
 * palette as everything else — including when the light theme is toggled —
 * instead of pinning a second, silently diverging copy of the colours.
 *
 * The fallbacks are the dark values, used during SSR and in any environment
 * without a computed style. They must stay in sync with :root in globals.css.
 */
export type ThemeToken =
  | 'bg' | 'panel' | 'panel-2' | 'border' | 'muted' | 'text'
  | 'brand' | 'brand-2' | 'up' | 'down' | 'warn' | 'info';

const FALLBACK: Record<ThemeToken, string> = {
  bg: '10 9 6',
  panel: '18 16 10',
  'panel-2': '27 24 16',
  border: '44 39 24',
  muted: '154 144 120',
  text: '237 231 214',
  brand: '216 163 43',
  'brand-2': '156 122 34',
  up: '79 180 119',
  down: '224 87 79',
  warn: '216 163 43',
  info: '156 122 34',
};

function triple(token: ThemeToken): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return FALLBACK[token];
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${token}`)
    .trim();
  return value || FALLBACK[token];
}

/**
 * `themeColor('up')` -> `rgb(62, 158, 119)`; with alpha -> `rgba(62, 158, 119, 0.4)`.
 *
 * Deliberately the legacy comma form rather than the CSS Color 4 slash syntax the
 * tokens are stored in. Browsers accept both, so canvas and SVG would not care —
 * but Lightweight Charts parses colour strings itself instead of handing them to
 * the browser, and a parser that only knows the comma form would fail at runtime,
 * after a green build. The comma form is understood everywhere and costs nothing.
 */
export function themeColor(token: ThemeToken, alpha?: number): string {
  const [r = '0', g = '0', b = '0'] = triple(token).split(/[\s,/]+/).filter(Boolean);
  return alpha == null ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The app's monospace stack, for canvas `ctx.font` and chart layout options. */
export const CHART_FONT_FAMILY = '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
