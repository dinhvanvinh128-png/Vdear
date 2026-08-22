/** Presentation formatters — pure, locale-stable (en-US) for SSR/CSR parity. */

export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : abs >= 0.0001 ? 6 : 8;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return '$' + fmtPrice(v);
}

/** Compact big numbers: 1.2K, 3.4M, 5.6B, 7.8T. */
export function fmtCompact(v: number | null | undefined, prefix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const units: [number, string][] = [
    [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'],
  ];
  for (const [n, s] of units) {
    if (abs >= n) return `${sign}${prefix}${(abs / n).toFixed(2)}${s}`;
  }
  return `${sign}${prefix}${abs.toFixed(2)}`;
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(digits)}%`;
}

/** Funding rate is a fraction; render as percent with more precision. */
export function fmtFunding(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—';
  const pct = rate * 100;
  const s = pct > 0 ? '+' : '';
  return `${s}${pct.toFixed(4)}%`;
}

export function ago(ts: number | null | undefined): string {
  if (!ts) return '—';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return `${s.toFixed(1)}s ago`;
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
