import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap, type Schemas } from '@/api/client';
import { messageOf } from '@/api/errors';
import { AdminTabs } from '@/components/AdminTabs';
import { Alert, Board, BoardHeader, Card, Label, List, Spinner, type LabelColor } from '@/components/ui';
import { num } from '@/lib/format';
import { EmptyCard } from '../UsagePage';

type Event = Schemas['GuardrailEvent'];

/** What each guardrail kind means, in plain words — and its colour on the board. */
export const KINDS: Record<string, { label: string; color: LabelColor; what: string }> = {
  injection: { label: 'Injection attempt', color: 'red', what: 'Text trying to override the assistant (question or picture)' },
  quota: { label: 'Quota reached', color: 'orange', what: 'Daily tokens / cost / assistant limit of the plan' },
  rate_limit: { label: 'Too fast', color: 'orange', what: 'Too many requests per minute' },
  plan: { label: 'Not in plan', color: 'yellow', what: 'Assistant not in the plan, or account not activated' },
  input_rejected: { label: 'Input refused', color: 'yellow', what: 'Empty or too long question' },
  pii_masked: { label: 'PII masked', color: 'purple', what: 'Personal data masked before it reached an LLM' },
  grounding: { label: 'Number dropped', color: 'blue', what: 'A number the model read was not on the source page' },
  unsafe_url: { label: 'Unsafe address', color: 'red', what: 'Internal / non-public address refused' },
  upload_refused: { label: 'Upload refused', color: 'yellow', what: 'Picture type, size, count or daily cap' },
};
const kindOf = (k: string) => KINDS[k] ?? { label: k, color: 'blue' as LabelColor, what: '' };
const BAR: Record<LabelColor, string> = {
  red: 'bg-red-500', orange: 'bg-orange-400', yellow: 'bg-yellow-400', purple: 'bg-purple-500', blue: 'bg-sky-500', green: 'bg-green-500',
};

/** Guardrails as a board: what fired (totals), when (per day), and the latest events. */
export default function AdminGuardrailsPage() {
  const [days, setDays] = useState(7);
  const [kind, setKind] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ['admin-guardrails', days, kind],
    queryFn: () => unwrap(api.GET('/api/v1/admin/guardrails', { params: { query: { days, limit: 100, ...(kind ? { kind } : {}) } } })),
    refetchInterval: 30_000,
  });
  const r = report.data;
  const max = Math.max(1, ...(r?.daily ?? []).map(d => d.total));

  return (
    <>
      <BoardHeader
        title="Guardrails"
        sub="Every time a protection fired. Never the user's text — only what fired, where and why."
        action={
          <div className="flex gap-1" role="group" aria-label="Period">
            {[1, 7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)} className={clsx('h-9 rounded-lg px-3 text-sm font-semibold',
                days === d ? 'bg-white text-ink' : 'bg-white/20 text-white hover:bg-white/30')}>{d === 1 ? '24 h' : `${d} d`}</button>
            ))}
          </div>
        }
      />
      <AdminTabs />
      {report.isPending && <Spinner light />}
      {report.error && <Alert>{messageOf(report.error)}</Alert>}
      {r && (
        <>
          <Card className="mb-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-semibold">Per day</span>
              <span className="text-xs text-muted">{num(r.daily.reduce((n, d) => n + d.total, 0))} events</span>
            </div>
            <div className="flex h-32 items-end gap-1" role="img" aria-label="Guardrail events per day">
              {r.daily.map(d => (
                <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.day}: ${d.total}`}>
                  {Object.entries(d.counts).map(([k, n]) => (
                    <div key={k} className={clsx(BAR[kindOf(k).color], 'w-full first:rounded-t')} style={{ height: `${(n / max) * 100}%` }} />
                  ))}
                  {d.total === 0 && <div className="h-px w-full bg-line" />}
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{r.daily[0]?.day}</span><span>{r.daily.at(-1)?.day}</span>
            </div>
          </Card>

          <Board>
            <List title="What fired" count={r.totals.length}>
              {r.totals.length === 0 && <EmptyCard>Nothing fired in this period.</EmptyCard>}
              {r.totals.map(t => (
                <button key={`${t.kind}-${t.action}`} onClick={() => setKind(kind === t.kind ? null : t.kind)} className="text-left">
                  <Card labels={[kindOf(t.kind).color]} className={clsx(kind === t.kind && 'ring-2 ring-brand')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{kindOf(t.kind).label}</span>
                      <span className="text-lg font-bold tabular-nums">{num(t.count)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{kindOf(t.kind).what}</div>
                    <div className="mt-1.5 text-xs"><Label color={t.action === 'blocked' ? 'red' : t.action === 'flagged' ? 'orange' : 'blue'}>{t.action}</Label>
                      <span className="ml-2 text-muted">last {new Date(t.last_at).toLocaleString()}</span></div>
                  </Card>
                </button>
              ))}
            </List>
            <List title={kind ? `Latest: ${kindOf(kind).label}` : 'Latest events'} count={r.recent.length}
              action={kind ? <button onClick={() => setKind(null)} className="text-xs font-semibold text-brand">Show all</button> : undefined}>
              {r.recent.length === 0 && <EmptyCard>No events.</EmptyCard>}
              {r.recent.map(e => <EventCard key={e.id} e={e} />)}
            </List>
          </Board>
        </>
      )}
    </>
  );
}

function EventCard({ e }: { e: Event }) {
  const k = kindOf(e.kind);
  return (
    <Card labels={[k.color]}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{k.label}</span>
        <Label color={e.action === 'blocked' ? 'red' : e.action === 'flagged' ? 'orange' : 'blue'}>{e.action}</Label>
        {e.topic && <span className="text-xs text-muted">· {e.topic}</span>}
      </div>
      {e.detail && <div className="mt-1 break-words font-mono text-xs">{e.detail}</div>}
      <div className="mt-1.5 text-xs text-muted">
        {new Date(e.created_at).toLocaleString()} · {e.service}{e.user_email ? ` · ${e.user_email}` : ''}
      </div>
    </Card>
  );
}
