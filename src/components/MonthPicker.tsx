import type { Schemas } from '@/api/client';

/** Month select on the gradient board (white on glass). */
export function MonthPicker({ months, value, onChange }:
  { months?: Schemas['MonthsResponse']; value?: string; onChange: (m: string) => void }) {
  if (!months) return null;
  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold text-white">
      <span className="sr-only">Month</span>
      <select
        value={value ?? months.current}
        onChange={e => onChange(e.target.value)}
        className="h-9 rounded-lg bg-white/20 px-3 font-semibold text-white outline-none hover:bg-white/30 [&>option]:text-ink"
      >
        {months.months.map(m => <option key={m.month} value={m.month} disabled={!m.has_data && !m.is_current}>{m.label}</option>)}
      </select>
    </label>
  );
}
