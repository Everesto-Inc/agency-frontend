import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useState } from 'react';
import { api, unwrap, type Schemas } from '@/api/client';
import { messageOf } from '@/api/errors';
import { AdminTabs } from '@/components/AdminTabs';
import { Alert, Board, BoardHeader, Button, Card, Label, List, Metric, Spinner } from '@/components/ui';
import { pct, usd } from '@/lib/format';
import { EmptyCard } from '../UsagePage';

type Case = Schemas['EvalCase'];
const score = (v?: number | null) => (v == null ? '—' : `${v.toFixed(2)} / 5`);

/** Quality per assistant (offline evals, online judge, drift) + the 👍/👎 answers waiting to become test cases. */
export default function AdminQualityPage() {
  const quality = useQuery({ queryKey: ['admin-quality'], queryFn: () => unwrap(api.GET('/api/v1/admin/quality')) });
  const [label, setLabel] = useState<'negative' | 'positive' | undefined>('negative');
  const cases = useQuery({
    queryKey: ['admin-eval-cases', label],
    queryFn: () => unwrap(api.GET('/api/v1/admin/eval-cases', { params: { query: { status: 'candidate', limit: 100, ...(label ? { label } : {}) } } })),
  });

  return (
    <>
      <BoardHeader title="Quality" sub="How good the answers are — and the rated answers that can become tests." />
      <AdminTabs />
      {(quality.isPending || cases.isPending) && <Spinner light />}
      {quality.error && <Alert>{messageOf(quality.error)}</Alert>}
      <Board>
        {(quality.data ?? []).map(t => (
          <List key={t.topic} title={t.topic}>
            <Card labels={[t.offline?.gate_passed === false ? 'red' : 'green']}>
              <div className="mb-1 text-xs font-semibold text-muted">Offline evals (test set)</div>
              {t.offline ? (
                <>
                  <div className="flex items-baseline justify-between"><span className="text-2xl font-bold">{pct(t.offline.pass_rate)}</span>
                    {t.offline.gate_passed != null && <Label color={t.offline.gate_passed ? 'green' : 'red'}>{t.offline.gate_passed ? 'gate passed' : 'gate failed'}</Label>}</div>
                  <div className="mt-1 text-xs text-muted">{t.offline.cases} cases · judge {score(t.offline.mean_judge_score)} · {usd(t.offline.mean_cost_usd)} / case
                    · {new Date(t.offline.created_at).toLocaleDateString()}{t.offline.git_sha ? ` · ${t.offline.git_sha.slice(0, 7)}` : ''}</div>
                </>
              ) : <div className="text-sm text-muted">No offline run yet.</div>}
            </Card>
            <Metric label="Online judge (sampled live answers)" value={score(t.online?.judge_score_24h)}
              sub={`7 days: ${score(t.online?.judge_score_7d)} · ${t.online?.judged_7d ?? 0} judged`} />
            <Card labels={[t.drift?.flagged?.length ? 'orange' : 'green']}>
              <div className="mb-1 text-xs font-semibold text-muted">Drift</div>
              {t.drift ? (t.drift.flagged.length
                ? <div className="flex flex-wrap gap-1">{t.drift.flagged.map(f => <Label key={f} color="orange">{f}</Label>)}</div>
                : <div className="text-sm">Stable</div>) : <div className="text-sm text-muted">Not checked yet.</div>}
              {t.drift && <div className="mt-1 text-xs text-muted">checked {new Date(t.drift.at).toLocaleString()}</div>}
            </Card>
          </List>
        ))}
        {quality.data?.length === 0 && <List title="Assistants"><EmptyCard>No quality data yet — evals and the judge run as scheduled jobs.</EmptyCard></List>}

        <List title="Rated answers → test cases" count={cases.data?.length}
          action={
            <div className="flex gap-1">
              {([['negative', ThumbsDown], ['positive', ThumbsUp], [undefined, null]] as const).map(([l, Icon]) => (
                <button key={l ?? 'all'} onClick={() => setLabel(l)} aria-pressed={label === l}
                  className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold ${label === l ? 'bg-brand text-white dark:text-slate-950' : 'bg-brand-soft'}`}>
                  {Icon ? <Icon className="size-3.5" /> : 'All'}
                </button>
              ))}
            </div>
          }>
          {cases.error && <Alert>{messageOf(cases.error)}</Alert>}
          {cases.data?.length === 0 && <EmptyCard>Nothing waiting. 👍 / 👎 in the chat lands here.</EmptyCard>}
          {(cases.data ?? []).map(c => <CaseCard key={c.id} c={c} />)}
        </List>
      </Board>
    </>
  );
}

function CaseCard({ c }: { c: Case }) {
  const qc = useQueryClient();
  const decide = useMutation({
    mutationFn: (status: 'approved' | 'rejected') => unwrap(api.PUT('/api/v1/admin/eval-cases/{case_id}', {
      params: { path: { case_id: c.id } }, body: { status },
    })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-eval-cases'] }),
  });
  return (
    <Card labels={[c.label === 'negative' ? 'red' : 'green']}>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {c.label === 'negative' ? <ThumbsDown className="size-3.5 text-red-500" /> : <ThumbsUp className="size-3.5 text-green-600" />}
        {c.topic} · {new Date(c.created_at).toLocaleDateString()}
      </div>
      <p className="mt-1 line-clamp-3 text-sm font-semibold">{c.prompt}</p>
      {c.answer && <p className="mt-1 line-clamp-3 text-xs text-muted">{c.answer}</p>}
      {c.comment && <p className="mt-1.5 rounded bg-brand-soft px-2 py-1 text-xs">“{c.comment}”</p>}
      {decide.error && <Alert>{messageOf(decide.error)}</Alert>}
      <div className="mt-2 flex gap-2">
        <Button busy={decide.isPending} onClick={() => decide.mutate('approved')} className="h-8 px-3 text-xs" title="Add to the eval dataset">
          <Check className="size-3.5" /> Make it a test</Button>
        <Button variant="subtle" onClick={() => decide.mutate('rejected')} className="h-8 px-3 text-xs"><X className="size-3.5" /> Dismiss</Button>
      </div>
    </Card>
  );
}
