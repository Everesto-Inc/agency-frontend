const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export const num = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
export const short = (n: number | null | undefined) => (n == null ? '—' : compact.format(n));
export const usd = (n: number | null | undefined) =>
  n == null ? '—' : `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
export const pct = (n: number | null | undefined, digits = 0) => (n == null ? '—' : `${(n * 100).toFixed(digits)}%`);
export const signedPct = (n: number | null | undefined) => (n == null ? null : `${n > 0 ? '+' : ''}${n.toFixed(0)}%`);
export const date = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
