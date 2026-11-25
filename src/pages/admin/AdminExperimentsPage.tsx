import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, FileUp, Play, Square } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { api, authFetch, unwrap, type Schemas } from '@/api/client';
import { ApiError, messageOf } from '@/api/errors';
import { apiUrl } from '@/config';
import { AdminTabs } from '@/components/AdminTabs';
import { Alert, Board, BoardHeader, Button, Card, Label, List, Spinner } from '@/components/ui';
import { pct, usd } from '@/lib/format';
import { EmptyCard } from '../UsagePage';
import { DRAFTS_KEY } from './SettingsDrafts';

type Dataset = Schemas['Dataset'];
type Test = Schemas['ConfigTest'];
type Variant = { cases?: number; pass_rate?: number; mean_judge_score?: number | null; mean_cost_usd?: number; total_cost_usd?: number; p95_latency_ms?: number; models?: Record<string, number> };
const RUNNING = ['queued', 'running', 'cancelling'];

/** Datasets (upload / versions / preview) and config tests (a dataset × live vs a draft, side by side). */
export default function AdminExperimentsPage() {
  const [params, setParams] = useSearchParams();
  const [openTest, setOpenTest] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  return (
    <>
      <BoardHeader title="Experiments" sub="Test a config draft on a dataset before it goes live — live vs draft, same questions, same judge." />
      <AdminTabs />
      <Board>
        <DatasetsList onPreview={setPreview} />
        <List title="New test" className="md:w-[22rem]">
          <NewTest draftFromUrl={Number(params.get('draft')) || undefined} onStarted={t => { setOpenTest(t.id); setParams({}); }} />
        </List>
        <TestsList open={openTest} onOpen={setOpenTest} />
      </Board>
      {preview != null && <PreviewDialog id={preview} onClose={() => setPreview(null)} />}
      {openTest != null && <TestDialog id={openTest} onClose={() => setOpenTest(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ datasets
function DatasetsList({ onPreview }: { onPreview: (id: number) => void }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['datasets'], queryFn: () => unwrap(api.GET('/api/v1/admin/experiments/datasets')) });
  const groups = useMemo(() => {
    const by = new Map<string, Dataset[]>();
    for (const d of list.data ?? []) by.set(d.name, [...(by.get(d.name) ?? []), d]);
    return [...by.entries()];
  }, [list.data]);
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [lineErrors, setLineErrors] = useState<{ line: number; message: string }[]>([]);
  const upload = useMutation({
    mutationFn: async (f: File) => {
      const q = new URLSearchParams({ name, comment });
      const res = await authFetch(new Request(`${apiUrl}/api/v1/admin/experiments/datasets?${q}`, {
        method: 'POST', headers: { 'content-type': 'application/x-ndjson' }, body: f,
      }));
      if (!res.ok) throw await ApiError.from(res);
      return res.json();
    },
    onSuccess: () => { setLineErrors([]); setComment(''); qc.invalidateQueries({ queryKey: ['datasets'] }); },
    onError: e => setLineErrors(e instanceof ApiError ? ((e.details?.errors as typeof lineErrors) ?? []) : []),
  });
  const valid = /^[a-z0-9][a-z0-9-]{1,62}$/.test(name);
  return (
    <List title="Datasets" count={groups.length}>
      <Card>
        <div className="text-sm font-semibold">Upload a dataset (JSONL)</div>
        <p className="mt-0.5 text-xs text-muted">One case per line: <code>{'{"id","topic","prompt","checks":{"must_contain":[…]},"rubric"}'}</code> — same name = new version.</p>
        <input value={name} onChange={e => setName(e.target.value.toLowerCase())} placeholder="name, e.g. ev-basics" aria-label="Dataset name"
          className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm" />
        <input value={comment} onChange={e => setComment(e.target.value)} placeholder="what's in it (optional)" aria-label="Comment" maxLength={300}
          className="mt-1.5 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm" />
        <input ref={file} type="file" accept=".jsonl,.ndjson,.json,application/x-ndjson" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
        <Button className="mt-2 w-full" disabled={!valid} busy={upload.isPending} onClick={() => file.current?.click()}><FileUp className="size-4" /> Choose file…</Button>
        {upload.error && <div className="mt-2"><Alert>{messageOf(upload.error)}{lineErrors.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-xs">{lineErrors.map(e => <li key={`${e.line}-${e.message}`}>{e.line ? `line ${e.line}: ` : ''}{e.message}</li>)}</ul>
        )}</Alert></div>}
      </Card>
      {list.isPending && <Spinner />}
      {groups.length === 0 && !list.isPending && <EmptyCard>No datasets yet.</EmptyCard>}
      {groups.map(([n, versions]) => (
        <Card key={n} labels={['purple']}>
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">{n}</span><Label color="purple">v{versions[0].version}</Label></div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">{Object.entries(versions[0].topics).map(([t, c]) => <Label key={t} color="blue">{t} · {c}</Label>)}</div>
          {versions[0].comment && <p className="mt-1 text-xs">{versions[0].comment}</p>}
          <ul className="mt-2 space-y-1 text-xs">
            {versions.map(v => (
              <li key={v.id} className="flex items-center justify-between gap-2">
                <span className="text-muted">v{v.version} · {v.cases} cases · {(v.size_bytes / 1024).toFixed(1)} KB · {v.author.split('@')[0]} · {new Date(v.created_at).toLocaleDateString()}</span>
                <button onClick={() => onPreview(v.id)} className="inline-flex items-center gap-1 font-semibold text-brand"><Eye className="size-3.5" /> Preview</button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </List>
  );
}

function PreviewDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const p = useQuery({ queryKey: ['dataset-preview', id], queryFn: () => unwrap(api.GET('/api/v1/admin/experiments/datasets/{dataset_id}/preview', { params: { path: { dataset_id: id }, query: { limit: 100 } } })) });
  return (
    <Dialog title={p.data ? `${p.data.dataset.name} v${p.data.dataset.version} — ${p.data.total} cases` : 'Dataset'} onClose={onClose}>
      {p.isPending && <Spinner />}
      {p.error && <Alert>{messageOf(p.error)}</Alert>}
      {p.data && (
        <table className="w-full text-left text-xs">
          <thead className="text-muted"><tr><th className="py-1 pr-2">id</th><th className="pr-2">assistant</th><th className="pr-2">question</th><th>checks</th></tr></thead>
          <tbody>
            {p.data.rows.map(r => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="py-1.5 pr-2 font-mono">{r.id}</td><td className="pr-2">{r.topic}</td>
                <td className="pr-2">{r.prompt}{r.rubric && <div className="mt-0.5 text-muted">rubric: {r.rubric}</div>}</td>
                <td className="font-mono text-[11px]">{Object.entries(r.checks ?? {}).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.data && p.data.total > p.data.rows.length && <p className="mt-2 text-xs text-muted">First {p.data.rows.length} of {p.data.total}.</p>}
    </Dialog>
  );
}

// ------------------------------------------------------------------ tests
function NewTest({ draftFromUrl, onStarted }: { draftFromUrl?: number; onStarted: (t: Test) => void }) {
  const qc = useQueryClient();
  const datasets = useQuery({ queryKey: ['datasets'], queryFn: () => unwrap(api.GET('/api/v1/admin/experiments/datasets')) });
  const drafts = useQuery({ queryKey: DRAFTS_KEY, queryFn: () => unwrap(api.GET('/api/v1/admin/settings/drafts')) });
  const open = (drafts.data ?? []).filter(d => d.status === 'draft');
  const [datasetId, setDatasetId] = useState<number>();
  const [draftId, setDraftId] = useState<number | 'live'>(draftFromUrl ?? 'live');
  const [maxCases, setMaxCases] = useState(20);
  const ds = (datasets.data ?? []).find(d => d.id === (datasetId ?? datasets.data?.[0]?.id));
  const start = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/admin/experiments/tests', {
      body: { dataset_id: ds!.id, draft_id: draftId === 'live' ? null : draftId, max_cases: maxCases },
    })),
    onSuccess: t => { qc.invalidateQueries({ queryKey: ['config-tests'] }); onStarted(t); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (ds) start.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-2">
      <Card>
        <label className="block text-sm font-semibold" htmlFor="t-ds">Dataset</label>
        <select id="t-ds" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm" value={ds?.id ?? ''}
          onChange={e => setDatasetId(Number(e.target.value))}>
          {(datasets.data ?? []).map(d => <option key={d.id} value={d.id}>{d.name} v{d.version} ({d.cases} cases)</option>)}
        </select>
        <label className="mt-2 block text-sm font-semibold" htmlFor="t-draft">Compare live with</label>
        <select id="t-draft" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm" value={String(draftId)}
          onChange={e => setDraftId(e.target.value === 'live' ? 'live' : Number(e.target.value))}>
          <option value="live">nothing — benchmark the live config</option>
          {open.map(d => <option key={d.id} value={d.id}>draft #{d.id} — {d.comment || d.sections.map(s => s.title).join(', ')}</option>)}
        </select>
        <label className="mt-2 block text-sm font-semibold" htmlFor="t-max">Questions (max 50)</label>
        <input id="t-max" type="number" min={1} max={50} value={maxCases} onChange={e => setMaxCases(Number(e.target.value))}
          className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm" />
        <p className="mt-2 text-xs text-muted">
          {ds ? `${Math.min(maxCases, ds.cases)} questions × ${draftId === 'live' ? 1 : 2} runs, each judged. ` : ''}
          Real model calls — the cost estimate shows once queued. Starts within ~2 min.</p>
        {start.error && <div className="mt-2"><Alert>{messageOf(start.error)}</Alert></div>}
        <Button type="submit" className="mt-2 w-full" disabled={!ds} busy={start.isPending}><Play className="size-4" /> Start test</Button>
      </Card>
    </form>
  );
}

function TestsList({ open, onOpen }: { open: number | null; onOpen: (id: number) => void }) {
  const tests = useQuery({
    queryKey: ['config-tests'], queryFn: () => unwrap(api.GET('/api/v1/admin/experiments/tests')),
    refetchInterval: q => ((q.state.data ?? []).some(t => RUNNING.includes(t.status)) ? 5000 : false),
  });
  return (
    <List title="Tests" count={tests.data?.length}>
      {tests.data?.length === 0 && <EmptyCard>No tests yet.</EmptyCard>}
      {(tests.data ?? []).map(t => (
        <button key={t.id} onClick={() => onOpen(t.id)} className="text-left">
          <Card labels={[statusColor(t.status)]} className={clsx(open === t.id && 'ring-2 ring-brand')}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">#{t.id} · {t.dataset_name} v{t.dataset_version}</span>
              <Label color={statusColor(t.status)}>{t.status}</Label>
            </div>
            <div className="mt-1 text-xs text-muted">{t.draft_id ? `live vs draft #${t.draft_id}` : 'live benchmark'} · {t.done_cases}/{t.total_cases}</div>
            {RUNNING.includes(t.status) && <Progress done={t.done_cases} total={t.total_cases} />}
            {t.summary && <Headline summary={t.summary as Record<string, Variant>} />}
          </Card>
        </button>
      ))}
    </List>
  );
}

function TestDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const t = useQuery({
    queryKey: ['config-test', id], queryFn: () => unwrap(api.GET('/api/v1/admin/experiments/tests/{test_id}', { params: { path: { test_id: id } } })),
    refetchInterval: q => (q.state.data && RUNNING.includes(q.state.data.status) ? 4000 : false),
  });
  const cancel = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/admin/experiments/tests/{test_id}/cancel', { params: { path: { test_id: id } } })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config-test', id] }); qc.invalidateQueries({ queryKey: ['config-tests'] }); },
  });
  const d = t.data;
  const sum = (d?.summary ?? {}) as Record<string, Variant>;
  const results = (d?.results ?? []) as { case_id: string; topic: string; prompt: string; variants: Record<string, VariantResult> }[];
  return (
    <Dialog title={d ? `Test #${d.id} · ${d.dataset_name} v${d.dataset_version}${d.draft_id ? ` · live vs draft #${d.draft_id}` : ''}` : 'Test'} onClose={onClose} wide>
      {t.isPending && <Spinner />}
      {d && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Label color={statusColor(d.status)}>{d.status}</Label>
            <span className="text-muted">{d.done_cases}/{d.total_cases} questions · started by {d.created_by}</span>
            {d.estimated_cost_usd != null && <span className="text-muted">· est. {usd(d.estimated_cost_usd)}</span>}
            {RUNNING.includes(d.status) && d.status !== 'cancelling' && (
              <Button variant="subtle" busy={cancel.isPending} onClick={() => cancel.mutate()} className="min-h-8 px-2 text-xs"><Square className="size-3.5" /> Stop</Button>
            )}
          </div>
          {RUNNING.includes(d.status) && <Progress done={d.done_cases} total={d.total_cases} />}
          {d.error && <Alert>{d.error}</Alert>}
          {(sum.live || results.length > 0) && <Comparison live={sum.live ?? summarize(results, 'live')} draft={d.draft_id ? (sum.draft ?? summarize(results, 'draft')) : undefined} />}
          <div className="mt-3 space-y-2">
            {results.map(r => <CaseRow key={r.case_id} r={r} hasDraft={!!d.draft_id} />)}
          </div>
        </>
      )}
    </Dialog>
  );
}

type VariantResult = { passed: boolean; judge_score: number | null; failures: string[]; rationale: string; cost_usd: number; latency_ms: number; models: string[]; status: string; answer: string };

/** Pure: summary from per-case results while a test is still running (the server's is final). */
export function summarize(results: { variants: Record<string, VariantResult> }[], v: string): Variant {
  const rows = results.map(r => r.variants[v]).filter(Boolean);
  if (!rows.length) return {};
  const judged = rows.map(r => r.judge_score).filter((x): x is number => x != null);
  const lat = rows.map(r => r.latency_ms).sort((a, b) => a - b);
  const models: Record<string, number> = {};
  rows.forEach(r => r.models.forEach(m => { models[m] = (models[m] ?? 0) + 1; }));
  return {
    cases: rows.length, pass_rate: rows.filter(r => r.passed).length / rows.length,
    mean_judge_score: judged.length ? judged.reduce((a, b) => a + b, 0) / judged.length : null,
    mean_cost_usd: rows.reduce((a, r) => a + r.cost_usd, 0) / rows.length, total_cost_usd: rows.reduce((a, r) => a + r.cost_usd, 0),
    p95_latency_ms: lat[Math.min(lat.length - 1, Math.round(0.95 * (lat.length - 1)))], models,
  };
}

function Comparison({ live, draft }: { live: Variant; draft?: Variant }) {
  const rows: [string, (v: Variant) => number | null | undefined, (n: number) => string, boolean][] = [
    ['Pass rate', v => v.pass_rate, n => pct(n), true],
    ['Judge score (1–5)', v => v.mean_judge_score, n => n.toFixed(2), true],
    ['Cost per question', v => v.mean_cost_usd, n => usd(n), false],
    ['Answer time p95', v => v.p95_latency_ms, n => `${(n / 1000).toFixed(1)} s`, false],
  ];
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted"><tr><th className="py-1 text-left">over {live.cases ?? 0} questions</th><th className="text-right">Live</th>{draft && <><th className="text-right">Draft</th><th className="text-right">Change</th></>}</tr></thead>
      <tbody>
        {rows.map(([label, get, fmt, higherBetter]) => {
          const a = get(live); const b = draft ? get(draft) : undefined;
          const better = a != null && b != null && b !== a ? (b > a) === higherBetter : null;
          return (
            <tr key={label} className="border-t border-line">
              <td className="py-1.5">{label}</td>
              <td className="text-right tabular-nums">{a == null ? '—' : fmt(a)}</td>
              {draft && <><td className="text-right font-semibold tabular-nums">{b == null ? '—' : fmt(b)}</td>
                <td className={clsx('text-right tabular-nums', better === true && 'text-green-600', better === false && 'text-red-500')}>
                  {a != null && b != null && b !== a ? (b > a ? <ArrowUp className="inline size-3.5" /> : <ArrowDown className="inline size-3.5" />) : '='}</td></>}
            </tr>
          );
        })}
        <tr className="border-t border-line align-top">
          <td className="py-1.5">Models</td>
          <td className="text-right font-mono text-[11px]">{Object.keys(live.models ?? {}).join(', ') || '—'}</td>
          {draft && <><td className="text-right font-mono text-[11px]">{Object.keys(draft.models ?? {}).join(', ') || '—'}</td><td /></>}
        </tr>
      </tbody>
    </table>
  );
}

function CaseRow({ r, hasDraft }: { r: { case_id: string; topic: string; prompt: string; variants: Record<string, VariantResult> }; hasDraft: boolean }) {
  const cell = (v?: VariantResult) => v && (
    <div className="min-w-0 flex-1 rounded-lg bg-surface p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Label color={v.passed ? 'green' : 'red'}>{v.passed ? 'pass' : 'fail'}</Label>
        {v.judge_score != null && <span>judge {v.judge_score.toFixed(1)}</span>}
        <span className="text-muted">{usd(v.cost_usd)} · {(v.latency_ms / 1000).toFixed(1)} s · {v.models.join(', ')}</span>
      </div>
      {v.failures.length > 0 && <ul className="mt-1 list-disc pl-4 text-[11px] text-red-600 dark:text-red-400">{v.failures.map(f => <li key={f}>{f}</li>)}</ul>}
      <details className="mt-1 text-xs"><summary className="cursor-pointer text-muted">answer</summary><p className="mt-1 whitespace-pre-wrap">{v.answer}</p>
        {v.rationale && <p className="mt-1 italic text-muted">judge: {v.rationale}</p>}</details>
    </div>
  );
  return (
    <Card>
      <div className="text-xs text-muted">{r.case_id} · {r.topic}</div>
      <p className="text-sm font-semibold">{r.prompt}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1"><div className="mb-1 text-[11px] font-semibold text-muted">LIVE</div>{cell(r.variants.live)}</div>
        {hasDraft && <div className="min-w-0 flex-1"><div className="mb-1 text-[11px] font-semibold text-muted">DRAFT</div>{cell(r.variants.draft)}</div>}
      </div>
    </Card>
  );
}

function Headline({ summary }: { summary: Record<string, Variant> }) {
  const l = summary.live; const d = summary.draft;
  if (!l?.cases) return null;
  return (
    <div className="mt-1.5 text-xs">
      pass {pct(l.pass_rate)}{d?.cases ? <> → <b>{pct(d.pass_rate)}</b></> : null} · judge {l.mean_judge_score?.toFixed(2) ?? '—'}{d?.cases ? <> → <b>{d.mean_judge_score?.toFixed(2) ?? '—'}</b></> : null}
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
      <div className="h-full bg-brand transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </div>
  );
}

const statusColor = (s: string) => (s === 'done' ? 'green' : s === 'failed' ? 'red' : s === 'cancelled' ? 'yellow' : 'blue') as 'green' | 'red' | 'yellow' | 'blue';

function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-10" role="dialog" aria-modal="true" aria-label={title}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={clsx('w-full rounded-xl bg-panel p-4 shadow-[var(--shadow-lift)]', wide ? 'max-w-5xl' : 'max-w-3xl')}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 text-xl leading-none text-muted hover:bg-brand-soft" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
