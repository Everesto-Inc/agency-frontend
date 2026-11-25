import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usd } from '@/lib/format';

export type DayPoint = { day: string; cost_usd: number; runs: number };

/** Cost per day (bars). Own chunk: loaded only with the usage screens. */
export default function DailyChart({ data }: { data: DayPoint[] }) {
  const rows = data.map(d => ({ ...d, label: d.day.slice(8) }));
  return (
    <div className="h-48 w-full" role="img" aria-label="Cost per day">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted)" interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted)" tickFormatter={v => `$${v}`} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--color-brand-soft)' }}
            contentStyle={{ background: 'var(--color-panel)', border: 'none', borderRadius: 8, boxShadow: 'var(--shadow-lift)', color: 'var(--color-ink)' }}
            formatter={(v, name) => (name === 'cost_usd' ? [usd(Number(v)), 'Cost'] : [String(v), 'Questions'])}
            labelFormatter={(_, p) => p?.[0]?.payload?.day ?? ''}
          />
          <Bar dataKey="cost_usd" fill="var(--color-brand)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
