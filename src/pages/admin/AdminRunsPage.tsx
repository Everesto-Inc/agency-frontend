import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap, type Schemas } from '@/api/client';
import { messageOf } from '@/api/errors';
import { AdminTabs } from '@/components/AdminTabs';
import { Alert, BoardHeader, Card, Label, Spinner } from '@/components/ui';
import { usd } from '@/lib/format';

type Run = Schemas['AdminRun'];
type Call = Schemas['LlmCall'];

/** Who called, in plain words (client id → label + colour). */
const CLIENT: Record<string, { label: string; bar: string }> = {
  edge: { label: 'routing / pictures', bar: 'bg-sky-500' },
  quality: { label: 'judge', bar: 'bg-purple-500' },
};
const clientOf = (c: string) => CLIENT[c] ?? { label: c, bar: 'bg-green-500' };
const secs = (ms?: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);

/** Pure: each call's start and length in ms from the run's start (calls before the run = routing at the edge). */
export function timeline(run: { created_at: string; latency_ms?: number | null }, calls: { started_at?: string | null; created_at: string; latency_ms: number }[]) {
  const starts = calls.map(c => Date.parse(c.started_at ?? c.created_at) - (c.started_at ? 0 : c.latency_ms));
  const t0 = Math.min(Date.parse(run.created_at), ...starts);
  const bars = calls.map((c, i) => ({ start: starts[i] - t0, ms: c.latency_ms }));
  const end = Math.max(Date.parse(run.created_at) - t0 + (run.latency_ms ?? 0), ...bars.map(b => b.start + b.ms), 1);
  const llmMs = unionMs(bars);
  return { bars, total: end, llmMs, otherMs: Math.max(0, end - llmMs) };
}

/** Pure: time covered by at least one bar (parallel calls are not counted twice). */
function unionMs(bars: { start: number; ms: number }[]) {
  const sorted = [...bars].sort((a, b) => a.start - b.start);
  let total = 0; let curS = -1; let curE = -1;
  for (const b of sorted) {
    if (b.start > curE) { total += curE - curS; curS = b.start; curE = b.start + b.ms; } else curE = Math.max(curE, b.start + b.ms);
  }
  return total + (curE - curS);
}

/** Every question with its time; click one for the waterfall of its LLM calls. */
export default function AdminRunsPage() {
  const [topic, setTopic] = useState<string>();
  const [open, setOpen] = useState<Run | null>(null);
  const runs = useQuery({
    queryKey: ['admin-runs', topic],
    queryFn: () => unwrap(api.GET('/api/v1/admin/runs', { params: { query: { limit: 100, ...(topic ? { topic } : {}) } } })),
    refetchInterval: 15_000,
  });
  const topics = [...new Set((runs.data ?? []).map(r => r.topic))];
  return (
    <>
      <BoardHeader title="Runs" sub="Every question: how long it took and where the time went. Click one for its timeline." />
      <AdminTabs />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[undefined, ...topics].map(t => (
          <button key={t ?? 'all'} onClick={() => setTopic(t)} className={clsx('h-8 rounded-full px-3 text-sm font-semibold',
            topic === t ? 'bg-white text-ink' : 'bg-white/20 text-white hover:bg-white/30')}>{t ?? 'All'}</button>
        ))}
      </div>
      {runs.isPending && <Spinner light />}
      {runs.error && <Alert>{messageOf(runs.error)}</Alert>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="text-xs text-muted"><tr className="border-b border-line">
            <th className="px-3 py-2">When</th><th>Question</th><th>Assistant</th><th className="text-right">Time</th>
            <th className="text-right">LLM calls</th><th className="text-right">Cost</th><th className="px-3">Status</th>
          </tr></thead>
          <tbody>
            {(runs.data ?? []).map(r => (
              <tr key={r.request_id} onClick={() => setOpen(r)} className="cursor-pointer border-b border-line last:border-0 hover:bg-brand-soft">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{new Date(r.created_at).toLocaleString()}<div>{r.user_email}</div></td>
                <td className="max-w-[22rem] truncate py-2 pr-2">{r.prompt ?? <i className="text-muted">text removed (retention)</i>}</td>
                <td>{r.topic}</td>
                <td className={clsx('text-right font-semibold tabular-nums', (r.latency_ms ?? 0) > 20000 ? 'text-red-500' : (r.latency_ms ?? 0) > 8000 ? 'text-orange-500' : '')}>{secs(r.latency_ms)}</td>
                <td className="text-right tabular-nums">{r.llm_calls}</td>
                <td className="text-right tabular-nums">{usd(r.cost_usd)}</td>
                <td className="px-3"><Label color={r.status === 'success' ? 'green' : 'red'}>{r.cache_hit ? 'cached' : r.status}</Label></td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.data?.length === 0 && <p className="p-4 text-sm text-muted">No questions yet.</p>}
      </Card>
      {open && <RunDialog run={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function RunDialog({ run, onClose }: { run: Run; onClose: () => void }) {
  const calls = useQuery({
    queryKey: ['run-calls', run.request_id],
    queryFn: () => unwrap(api.GET('/api/v1/admin/runs/{request_id}/calls', { params: { path: { request_id: run.request_id } } })),
  });
  const list = calls.data ?? [];
  const t = timeline(run, list);
  const byTask = Object.entries(list.reduce<Record<string, number>>((acc, c) => {
    const k = `${c.task ?? c.route_source}`; acc[k] = (acc[k] ?? 0) + c.latency_ms; return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-10" role="dialog" aria-modal="true"
      aria-label="Run timeline" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-5xl rounded-xl bg-panel p-4 shadow-[var(--shadow-lift)]">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">{run.prompt ?? run.request_id}</h2>
            <p className="text-xs text-muted">{run.topic} · {run.user_email} · {new Date(run.created_at).toLocaleString()} · {usd(run.cost_usd)}</p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 text-xl leading-none text-muted hover:bg-brand-soft" aria-label="Close">×</button>
        </div>
        {calls.isPending && <Spinner />}
        {calls.error && <Alert>{messageOf(calls.error)}</Alert>}
        {calls.data && (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <Label color="blue">total {secs(t.total)}</Label>
              <Label color="orange">waiting for models {secs(t.llmMs)} ({Math.round((t.llmMs / t.total) * 100)}%)</Label>
              <Label color="green">everything else {secs(t.otherMs)}</Label>
              <span className="text-xs text-muted">{list.length} LLM calls · slowest steps: {byTask.slice(0, 3).map(([k, ms]) => `${k} ${secs(ms)}`).join(' · ')}</span>
            </div>
            <div className="space-y-1">
              {list.map((c: Call, i) => (
                <div key={i} className="grid grid-cols-[13rem_1fr] items-center gap-2 text-xs">
                  <div className="truncate" title={`${c.client_id} · ${c.task ?? c.route_source} · ${c.model} (${c.tier}) · attempt ${c.attempt}`}>
                    <span className="font-semibold">{c.task ?? c.route_source}</span> <span className="text-muted">· {clientOf(c.client_id).label}</span>
                    <div className="truncate font-mono text-[10px] text-muted">{c.model} · {c.tier}{c.cached ? ' · cached' : ''}{c.status !== 'success' ? ` · ${c.status}` : ''}</div>
                  </div>
                  <div className="relative h-6 rounded bg-surface">
                    <div className={clsx('absolute top-0.5 h-5 rounded', c.status === 'success' ? clientOf(c.client_id).bar : 'bg-red-500', c.cached && 'opacity-50')}
                      style={{ left: `${(t.bars[i].start / t.total) * 100}%`, width: `max(3px, ${(t.bars[i].ms / t.total) * 100}%)` }} />
                    {(t.bars[i].start + t.bars[i].ms) / t.total > 0.85 ? (   /* near the end: label inside the bar */
                      <span className="absolute top-1 whitespace-nowrap text-[11px] font-semibold tabular-nums text-white"
                        style={{ right: `calc(${100 - ((t.bars[i].start + t.bars[i].ms) / t.total) * 100}% + 4px)` }}>{secs(c.latency_ms)}</span>
                    ) : (
                      <span className="absolute top-1 whitespace-nowrap text-[11px] font-semibold tabular-nums"
                        style={{ left: `calc(${((t.bars[i].start + t.bars[i].ms) / t.total) * 100}% + 4px)` }}>{secs(c.latency_ms)}</span>
                    )}
                  </div>
                </div>
              ))}
              {list.length === 0 && <p className="text-sm text-muted">No LLM calls recorded (cached answer, or older than the call log).</p>}
            </div>
            <p className="mt-3 text-xs text-muted">Bars start when the call started; blue = routing at the edge, green = the assistant, red = failed (retried). “Everything else” = web search, reading pages, database — the time between bars.</p>
          </>
        )}
      </div>
    </div>
  );
}
