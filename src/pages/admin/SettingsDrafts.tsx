import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Download, FlaskConical, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, authFetch, unwrap, type Schemas } from '@/api/client';
import { ApiError, messageOf } from '@/api/errors';
import { apiUrl } from '@/config';
import { Alert, Button, Card, Label, List } from '@/components/ui';
import { EmptyCard } from '../UsagePage';

type Draft = Schemas['DraftView'];
export const DRAFTS_KEY = ['admin-drafts'];

/** Export (download all live values as one JSON file) and Import (upload one → a draft). */
export function ExportImport({ onDraft }: { onDraft: (d: Draft) => void }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const imp = useMutation({
    mutationFn: async (f: File) => {
      let body: unknown;
      try { body = JSON.parse(await f.text()); } catch { throw new Error('This file is not JSON'); }
      return unwrap(api.POST('/api/v1/admin/settings/import', { body: body as never, params: { query: { comment: `imported ${f.name}` } } }));
    },
    onSuccess: d => { setErrors([]); qc.invalidateQueries({ queryKey: DRAFTS_KEY }); onDraft(d); },
    onError: e => setErrors(e instanceof ApiError ? ((e.details?.errors as typeof errors) ?? []) : []),
  });
  const download = async () => {
    const res = await authFetch(new Request(`${apiUrl}/api/v1/admin/settings/export`));
    if (!res.ok) throw await ApiError.from(res);
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'agency-config.json';
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="light" onClick={() => download().catch(() => undefined)} title="All sections' live values as one JSON file">
        <Download className="size-4" /> Export
      </Button>
      <input ref={file} type="file" accept="application/json,.json" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) imp.mutate(f); e.target.value = ''; }} />
      <Button variant="light" busy={imp.isPending} onClick={() => file.current?.click()} title="Upload a config file → a draft (nothing goes live)">
        <Upload className="size-4" /> Import
      </Button>
      {imp.error && (
        <div className="w-full"><Alert>{messageOf(imp.error)}{errors.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-xs">{errors.slice(0, 8).map(e => <li key={e.field}><b>{e.field}</b>: {e.message}</li>)}</ul>
        )}</Alert></div>
      )}
    </div>
  );
}

/** Drafts: what each one would change vs live, then Test (Experiments) · Apply · Discard. */
export function DraftsList({ highlight }: { highlight?: number }) {
  const qc = useQueryClient();
  const drafts = useQuery({ queryKey: DRAFTS_KEY, queryFn: () => unwrap(api.GET('/api/v1/admin/settings/drafts')) });
  const open = (drafts.data ?? []).filter(d => d.status === 'draft');
  const decided = (drafts.data ?? []).filter(d => d.status !== 'draft').slice(0, 5);
  const done = () => { qc.invalidateQueries({ queryKey: DRAFTS_KEY }); qc.invalidateQueries({ queryKey: ['admin-settings'] }); };
  return (
    <List title="Drafts" count={open.length}>
      {drafts.error && <Alert>{messageOf(drafts.error)}</Alert>}
      {open.length === 0 && <EmptyCard>No open drafts. Import a config file or “Save as draft” to test changes before they go live.</EmptyCard>}
      {open.map(d => <DraftCard key={d.id} d={d} highlight={d.id === highlight} onDone={done} />)}
      {decided.length > 0 && <div className="px-1 pt-2 text-xs font-semibold text-muted">Recently decided</div>}
      {decided.map(d => <DraftCard key={d.id} d={d} onDone={done} />)}
    </List>
  );
}

function DraftCard({ d, highlight, onDone }: { d: Draft; highlight?: boolean; onDone: () => void }) {
  const apply = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/admin/settings/drafts/{draft_id}/apply', { params: { path: { draft_id: d.id } } })),
    onSuccess: onDone,
  });
  const discard = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/admin/settings/drafts/{draft_id}/discard', { params: { path: { draft_id: d.id } } })),
    onSuccess: onDone,
  });
  const changes = d.sections.reduce((n, s) => n + s.changes.length, 0);
  const invalid = d.sections.some(s => s.errors?.length);
  const open = d.status === 'draft';
  return (
    <Card labels={[open ? (invalid ? 'red' : 'orange') : d.status === 'applied' ? 'green' : 'blue']} className={highlight ? 'ring-2 ring-brand' : undefined}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">Draft #{d.id}</span>
        <Label color={open ? 'orange' : d.status === 'applied' ? 'green' : 'blue'}>{d.status}</Label>
        <span className="text-xs text-muted">{d.source} · {changes} change{changes === 1 ? '' : 's'}</span>
      </div>
      {d.comment && <p className="mt-1 text-sm">{d.comment}</p>}
      <div className="mt-2 space-y-1.5">
        {d.sections.map(s => (
          <details key={s.name} open={open && d.sections.length <= 2}>
            <summary className="cursor-pointer text-xs font-semibold">{s.title} · {s.changes.length}</summary>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              {s.changes.slice(0, 30).map(c => (
                <li key={c.path} className="break-words"><span className="text-muted">{c.path}:</span>{' '}
                  <span className="text-red-600 line-through dark:text-red-400">{short(c.live)}</span> → <span className="text-green-700 dark:text-green-400">{short(c.draft)}</span></li>
              ))}
              {(s.errors ?? []).map(e => <li key={e.field} className="text-red-600">⚠ {e.field}: {e.message}</li>)}
            </ul>
          </details>
        ))}
      </div>
      {open && (d.stale?.length ?? 0) > 0 && (
        <p className="mt-2 flex items-start gap-1 text-xs text-orange-600"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Changed live since this draft: {d.stale?.join(', ')} — applying overwrites those changes.</p>
      )}
      {(apply.error || discard.error) && <div className="mt-2"><Alert>{messageOf(apply.error ?? discard.error)}</Alert></div>}
      <div className="mt-1 text-xs text-muted">{d.author} · {new Date(d.created_at).toLocaleString()}{d.decided_by ? ` · ${d.status} by ${d.decided_by}` : ''}</div>
      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Link to={`/admin/experiments?draft=${d.id}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-brand-soft px-3 text-xs font-semibold text-ink">
            <FlaskConical className="size-3.5" /> Test it</Link>
          <Button busy={apply.isPending} disabled={invalid} onClick={() => apply.mutate()} className="min-h-8 px-3 text-xs"><Check className="size-3.5" /> Apply</Button>
          <Button variant="subtle" busy={discard.isPending} onClick={() => discard.mutate()} className="min-h-8 px-3 text-xs"><Trash2 className="size-3.5" /> Discard</Button>
        </div>
      )}
    </Card>
  );
}

const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s == null ? '—' : s.length > 80 ? `${s.slice(0, 80)}…` : s;
};
