import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '@/api/client';
import { messageOf } from '@/api/errors';
import { AdminTabs } from '@/components/AdminTabs';
import { MonthPicker } from '@/components/MonthPicker';
import { Alert, Board, BoardHeader, Card, Label, List, Metric, Spinner } from '@/components/ui';
import { num, pct, short, signedPct, usd } from '@/lib/format';
import { EmptyCard } from '../UsagePage';

const DailyChart = lazy(() => import('@/components/DailyChart'));

/** Platform overview for admins: money, people, assistants, models — as a board. */
export default function AdminOverviewPage() {
  const [month, setMonth] = useState<string>();
  const months = useQuery({ queryKey: ['admin-months'], queryFn: () => unwrap(api.GET('/api/v1/admin/dashboard/months')) });
  const dash = useQuery({
    queryKey: ['admin-dashboard', month],
    queryFn: () => unwrap(api.GET('/api/v1/admin/dashboard', { params: { query: month ? { month } : {} } })),
  });
  const d = dash.data;

  return (
    <>
      <BoardHeader title="Overview" sub={d?.period.label} action={<MonthPicker months={months.data} value={month} onChange={setMonth} />} />
      <AdminTabs />
      {dash.isPending && <Spinner light />}
      {dash.error && <Alert>{messageOf(dash.error)}</Alert>}
      {d && (
        <>
          <Card className="mb-3">
            <div className="mb-1 text-sm font-semibold">Platform cost per day</div>
            <Suspense fallback={<div className="h-48" />}><DailyChart data={d.daily} /></Suspense>
          </Card>
          <Board>
            <List title="This month">
              <Metric label="Cost" value={usd(d.totals.cost_usd)} sub={signedPct(d.change.cost_usd_pct) ?? 'first month'} />
              <Metric label="Questions" value={num(d.runs.runs)} sub={`${pct(d.runs.success_rate)} answered`} />
              <Metric label="Tokens" value={short(d.totals.total_tokens)} sub={`${pct(d.runs.cache_hit_rate)} from cache`} />
            </List>
            <List title="People">
              <Metric label="Accounts" value={num(d.users.total)} sub={`${num(d.users.new_signups)} new · ${num(d.users.disabled)} disabled`} />
              <Card labels={['yellow']}>
                <div className="mb-2 text-xs font-semibold text-muted">By plan</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(d.users.by_plan as Record<string, number>).map(([p, n]) => (
                    <Label key={p} color={p === 'none' ? 'yellow' : p === 'pro' ? 'purple' : 'green'}>{p} · {n}</Label>
                  ))}
                </div>
                {Number((d.users.by_plan as Record<string, number>).none ?? 0) > 0 && (
                  <Link to="/admin/users" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">Activate waiting accounts →</Link>
                )}
              </Card>
            </List>
            <List title="Assistants" count={d.by_topic.length}>
              {d.by_topic.length === 0 && <EmptyCard>No questions this month.</EmptyCard>}
              {d.by_topic.map(t => (
                <Card key={t.topic}>
                  <div className="flex justify-between gap-2"><span className="font-semibold">{t.display_name}</span><span className="text-sm font-semibold tabular-nums">{usd(t.totals.cost_usd)}</span></div>
                  <div className="mt-1 text-xs text-muted">{num(t.totals.runs)} questions · avg {usd(t.avg_cost_per_run)}</div>
                </Card>
              ))}
            </List>
            <List title="Models" count={d.by_model.length}>
              {d.by_model.map(m => (
                <Card key={m.model}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold" title={m.model}>{m.model}</span><Label color="blue">{m.tier}</Label></div>
                  <div className="mt-1 text-xs text-muted">{num(m.calls)} calls · {usd(m.cost_usd)} · {pct(m.error_rate, 1)} errors</div>
                </Card>
              ))}
            </List>
            <List title="Top users" count={d.top_users.length}>
              {d.top_users.slice(0, 8).map(u => (
                <Card key={u.user_id}>
                  <div className="truncate font-semibold" title={u.email}>{u.email}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted"><Label color="green">{u.plan}</Label>{usd(u.cost_usd)}</div>
                </Card>
              ))}
            </List>
          </Board>
        </>
      )}
    </>
  );
}
