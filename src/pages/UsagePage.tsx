import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { api, unwrap, type Schemas } from '@/api/client';
import { messageOf } from '@/api/errors';
import { MonthPicker } from '@/components/MonthPicker';
import { Alert, Board, BoardHeader, Card, Label, List, Metric, Spinner } from '@/components/ui';
import { dateTime, num, pct, short, signedPct, usd } from '@/lib/format';

const DailyChart = lazy(() => import('@/components/DailyChart'));

export default function UsagePage() {
  const [month, setMonth] = useState<string>();
  const months = useQuery({ queryKey: ['months'], queryFn: () => unwrap(api.GET('/api/v1/dashboard/months')) });
  const dash = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => unwrap(api.GET('/api/v1/dashboard', { params: { query: month ? { month } : {} } })),
  });
  const d = dash.data;

  return (
    <>
      <BoardHeader title="Usage" sub={d?.period.label} action={<MonthPicker months={months.data} value={month} onChange={setMonth} />} />
      {dash.isPending && <Spinner light />}
      {dash.error && <Alert>{messageOf(dash.error)}</Alert>}
      {d && (
        <>
          <Card className="mb-3">
            <div className="mb-1 text-sm font-semibold">Cost per day</div>
            <Suspense fallback={<div className="h-48" />}><DailyChart data={d.daily} /></Suspense>
          </Card>
          <Board>
            <List title="This month">
              <Metric label="Cost" value={usd(d.totals.cost_usd)} sub={change(d.change.cost_usd_pct)} />
              <Metric label="Questions" value={num(d.runs.runs)} sub={change(d.change.runs_pct)} />
              <Metric label="Tokens" value={short(d.totals.total_tokens)} sub={change(d.change.total_tokens_pct)} />
              <Metric label="Answered" value={pct(d.runs.success_rate)} sub={`${num(d.runs.failed)} failed`} />
            </List>
            {d.today && (
              <List title="Today">
                <Card labels={['yellow']}>
                  <Gauge label="Tokens" used={d.today.tokens} limit={d.today.token_limit} fmt={short} />
                  <div className="h-3" />
                  <Gauge label="Cost" used={d.today.cost_usd} limit={d.today.cost_limit_usd} fmt={usd} />
                  <p className="mt-3 text-xs text-muted">Daily limits of your plan — reset at 00:00 UTC.</p>
                </Card>
              </List>
            )}
            <List title="By assistant" count={d.by_topic.length}>
              {d.by_topic.length === 0 && <EmptyCard>No questions this month.</EmptyCard>}
              {d.by_topic.map(t => <TopicCard key={t.topic} t={t} />)}
            </List>
            <List title="Recent questions" count={d.recent_runs.length}>
              {d.recent_runs.length === 0 && <EmptyCard>Nothing yet.</EmptyCard>}
              {d.recent_runs.slice(0, 8).map(r => (
                <Card key={r.request_id}>
                  <div className="flex items-center justify-between gap-2">
                    <Label color={r.status === 'success' ? 'green' : 'red'}>{d.by_topic.find(t => t.topic === r.topic)?.display_name ?? r.topic}</Label>
                    <span className="text-xs text-muted">{dateTime(r.created_at)}</span>
                  </div>
                  <div className="mt-2 text-sm tabular-nums">{short(r.total_tokens)} tokens · {usd(r.cost_usd)}{r.cache_hit && ' · cached'}</div>
                </Card>
              ))}
            </List>
          </Board>
        </>
      )}
    </>
  );
}

const change = (p: number | null) => {
  const s = signedPct(p);
  return s ? `${s} vs last month` : 'first month';
};

function Gauge({ label, used, limit, fmt }: { label: string; used: number; limit: number; fmt: (n: number) => string }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="tabular-nums text-muted">{fmt(used)} / {fmt(limit)}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${ratio > 0.9 ? 'bg-label-red' : ratio > 0.7 ? 'bg-label-orange' : 'bg-label-green'}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function TopicCard({ t }: { t: Schemas['TopicBreakdown'] }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{t.display_name}</span>
        <span className="text-sm font-semibold tabular-nums">{usd(t.totals.cost_usd)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(t.share_of_cost * 100)}%` }} />
      </div>
      <div className="mt-1.5 text-xs text-muted">{num(t.totals.runs)} questions · {pct(t.share_of_cost)} of cost</div>
    </Card>
  );
}

export function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border-2 border-dashed border-line px-3 py-4 text-center text-sm text-muted">{children}</div>;
}
