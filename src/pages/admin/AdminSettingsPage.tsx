import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, unwrap, type Schemas } from '@/api/client';
import { ApiError, messageOf } from '@/api/errors';
import { AdminTabs } from '@/components/AdminTabs';
import { Alert, Board, BoardHeader, Button, Card, Label, List, Spinner } from '@/components/ui';
import { changedPaths, getAt, labelOf, resolve, setAt, type Json, type Path, type Schema } from '@/lib/schemaForm';
import { EmptyCard } from '../UsagePage';

type Section = Schemas['SettingsSection'];
const KEY = ['admin-settings'];

/** Admin → Settings: the config/*.yaml values, editable live — validated, versioned, with rollback. */
export default function AdminSettingsPage() {
  const sections = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET('/api/v1/admin/settings')) });
  const [name, setName] = useState<string>();
  const current = sections.data?.find(s => s.name === name) ?? sections.data?.[0];

  return (
    <>
      <BoardHeader title="Settings" sub="Change limits and behaviour without a code change. Live in every service within ~10 s." />
      <AdminTabs />
      {sections.isPending && <Spinner light />}
      {sections.error && <Alert>{messageOf(sections.error)}</Alert>}
      {sections.data && (
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Settings sections">
          {sections.data.map(s => {
            const n = changedPaths(s.file_values as Json, s.values as Json).length;
            return (
              <button key={s.name} role="tab" aria-selected={current?.name === s.name} onClick={() => setName(s.name)}
                className={clsx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold',
                  current?.name === s.name ? 'bg-white text-ink' : 'bg-white/20 text-white hover:bg-white/30')}>
                {s.title}{n > 0 && <span className="rounded-full bg-orange-400 px-1.5 text-[11px] text-white">{n}</span>}
              </button>
            );
          })}
        </div>
      )}
      {current && <SectionEditor key={current.name + (current.version?.id ?? 0)} section={current} />}
    </>
  );
}

function SectionEditor({ section }: { section: Section }) {
  const qc = useQueryClient();
  const root = section.json_schema as Schema;
  const [values, setValues] = useState<Json>(section.values as Json);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setValues(section.values as Json), [section]);

  const fromFile = useMemo(() => new Set(changedPaths(section.file_values as Json, values)), [section, values]);
  const unsaved = changedPaths(section.values as Json, values);

  const onSaved = (s: Section) => { qc.setQueryData<Section[]>(KEY, all => all?.map(x => (x.name === s.name ? s : x))); qc.invalidateQueries({ queryKey: ['settings-history', s.name] }); setComment(''); setErrors({}); };
  const onError = (e: unknown) => {
    const list = e instanceof ApiError ? (e.details?.errors as { field: string; message: string }[] | undefined) : undefined;
    setErrors(Object.fromEntries((list ?? []).map(x => [x.field, x.message])));
  };
  const save = useMutation({
    mutationFn: (body: { values: Json; comment: string }) => unwrap(api.PUT('/api/v1/admin/settings/{name}', {
      params: { path: { name: section.name } }, body: body as never,
    })),
    onSuccess: onSaved, onError,
  });

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate({ values, comment }); };

  return (
    <Board>
      <List title={section.title} className="md:min-w-[28rem] md:max-w-xl md:flex-1">
        <Card>
          <p className="text-sm">{section.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {fromFile.size ? <Label color="orange">{fromFile.size} changed from the file</Label> : <Label color="green">same as config/{section.name}.yaml</Label>}
            {section.version && <span className="text-muted">last saved by {section.version.author}, {new Date(section.version.created_at).toLocaleString()}</span>}
          </div>
          {section.override_rejected && <div className="mt-2"><Alert>Saved values don't validate with the current file — the services use the file alone. {section.override_rejected}</Alert></div>}
        </Card>
        <form onSubmit={submit} className="space-y-2">
          <Card><Field root={root} schema={root} path={[]} values={values} setValues={setValues} changed={fromFile} errors={errors} /></Card>
          <Card>
            <label className="block text-sm font-semibold" htmlFor="settings-comment">Why (shown in the history)</label>
            <input id="settings-comment" value={comment} onChange={e => setComment(e.target.value)} maxLength={300}
              placeholder="e.g. raise free plan to 80k tokens for the demo" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
            {save.error != null && <div className="mt-2"><Alert>{messageOf(save.error)}</Alert></div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="submit" busy={save.isPending} disabled={!unsaved.length}><Save className="size-4" /> Save{unsaved.length ? ` (${unsaved.length})` : ''}</Button>
              {unsaved.length > 0 && <Button type="button" variant="subtle" onClick={() => { setValues(section.values as Json); setErrors({}); }}><Undo2 className="size-4" /> Discard</Button>}
              {fromFile.size > 0 && (
                <Button type="button" variant="subtle" onClick={() => save.mutate({ values: section.file_values as Json, comment: comment || 'reset to the file' })}>
                  <RotateCcw className="size-4" /> Reset to the file
                </Button>
              )}
            </div>
          </Card>
        </form>
      </List>
      <HistoryList section={section} onRolledBack={onSaved} />
    </Board>
  );
}

function HistoryList({ section, onRolledBack }: { section: Section; onRolledBack: (s: Section) => void }) {
  const history = useQuery({
    queryKey: ['settings-history', section.name],
    queryFn: () => unwrap(api.GET('/api/v1/admin/settings/{name}/history', { params: { path: { name: section.name } } })),
  });
  const rollback = useMutation({
    mutationFn: (id: number) => unwrap(api.POST('/api/v1/admin/settings/{name}/rollback/{version_id}', {
      params: { path: { name: section.name, version_id: id } },
    })),
    onSuccess: onRolledBack,
  });
  return (
    <List title="History" count={history.data?.length} action={<History className="size-4 text-muted" />}>
      {history.data?.length === 0 && <EmptyCard>Never changed here — the file values are live.</EmptyCard>}
      {rollback.error && <Alert>{messageOf(rollback.error)}</Alert>}
      {(history.data ?? []).map((v, i) => {
        const changes = changedPaths({}, v.content as Json);
        return (
          <Card key={v.id} labels={[i === 0 ? 'green' : 'blue']}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">#{v.id}{i === 0 && <span className="ml-1.5"><Label color="green">live</Label></span>}</span>
              {i > 0 && <Button variant="subtle" busy={rollback.isPending && rollback.variables === v.id} onClick={() => rollback.mutate(v.id)}
                className="min-h-8 px-2 text-xs"><RotateCcw className="size-3.5" /> Use this again</Button>}
            </div>
            {v.comment && <p className="mt-1 text-sm">{v.comment}</p>}
            <div className="mt-1 font-mono text-[11px] text-muted">{changes.length ? changes.map(p => `${p} = ${JSON.stringify(getAt(v.content as Json, p.split('.')))}`).join(' · ') : 'file values'}</div>
            <div className="mt-1 text-xs text-muted">{v.author} · {new Date(v.created_at).toLocaleString()}</div>
          </Card>
        );
      })}
    </List>
  );
}

/** One schema node → inputs (objects become fieldsets; maps like plans{} show one fieldset per key). */
function Field({ root, schema, path, values, setValues, changed, errors }: {
  root: Schema; schema: Schema; path: Path; values: Json; setValues: (v: Json) => void; changed: Set<string>; errors: Record<string, string>;
}) {
  const s = resolve(schema, root);
  const key = path.join('.');
  const value = getAt(values, path);
  const set = (v: Json) => setValues(setAt(values, path, v));
  const id = `f-${key || 'root'}`;
  const isChanged = [...changed].some(c => c === key || c.startsWith(key + '.'));
  const error = errors[key];

  if (s.type === 'object' || s.properties) {
    const children: [string, Schema][] = s.properties
      ? Object.entries(s.properties)
      : typeof s.additionalProperties === 'object' && value && typeof value === 'object'
        ? Object.keys(value as object).map(k => [k, s.additionalProperties as Schema]) : [];
    const body = children.map(([k, cs]) => (
      <Field key={k} root={root} schema={cs} path={[...path, k]} values={values} setValues={setValues} changed={changed} errors={errors} />
    ));
    if (!path.length) return <div className="space-y-3">{body}</div>;
    return (
      <fieldset className={clsx('rounded-lg border p-3', isChanged ? 'border-orange-300' : 'border-line')}>
        <legend className="px-1 text-sm font-bold">{labelOf(path.at(-1)!, s)}</legend>
        {s.description && <p className="mb-2 text-xs text-muted">{s.description}</p>}
        <div className="space-y-2.5">{body}{!children.length && <p className="text-xs text-muted">(none)</p>}</div>
      </fieldset>
    );
  }

  const label = (
    <span className="flex items-center gap-1.5 text-sm font-semibold">
      {labelOf(path.at(-1) ?? '', s)}{isChanged && <span className="size-2 rounded-full bg-orange-400" title="Changed from the file" />}
    </span>
  );
  const hint = s.description && <span className="block text-xs text-muted">{s.description}</span>;
  const err = error && <span className="block text-xs font-semibold text-red-600 dark:text-red-400" role="alert">{error}</span>;
  const input = 'mt-1 h-10 w-full rounded-lg border bg-surface px-3 text-sm ' + (error ? 'border-red-500' : 'border-line');

  if (s.type === 'boolean') {
    return (
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={!!value} onChange={e => set(e.target.checked)} className="mt-1 size-4" />
        <span>{label}{hint}{err}</span>
      </label>
    );
  }
  if (s.type === 'array') {
    const item = resolve(s.items ?? {}, root);
    const list = (Array.isArray(value) ? value : []) as Json[];
    if (item.enum) {
      return (
        <div>{label}{hint}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {item.enum.map(opt => (
              <label key={opt} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={list.includes(opt)}
                  onChange={e => set(e.target.checked ? [...list, opt] : list.filter(x => x !== opt))} />{opt}
              </label>
            ))}
          </div>{err}
        </div>
      );
    }
    return (
      <label className="block" htmlFor={id}>{label}{hint}
        <input id={id} className={input} value={list.join(', ')}
          onChange={e => set(e.target.value.split(',').map(x => x.trim()).filter(Boolean))} />{err}
      </label>
    );
  }
  if (s.enum) {
    return (
      <label className="block" htmlFor={id}>{label}{hint}
        <select id={id} className={input} value={String(value ?? '')} onChange={e => set(e.target.value)}>
          {s.enum.map(o => <option key={o} value={o}>{o}</option>)}
        </select>{err}
      </label>
    );
  }
  if (s.type === 'integer' || s.type === 'number') {
    const min = s.minimum ?? s.exclusiveMinimum;
    const max = s.maximum ?? s.exclusiveMaximum;
    return (
      <label className="block" htmlFor={id}>{label}{hint}
        <input id={id} type="number" className={input} min={min} max={max} step={s.type === 'integer' ? 1 : 'any'}
          value={value == null ? '' : String(value)} onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} />
        {(min != null || max != null) && <span className="block text-[11px] text-muted">{min != null ? `min ${min}` : ''}{min != null && max != null ? ' · ' : ''}{max != null ? `max ${max}` : ''}</span>}
        {err}
      </label>
    );
  }
  return (
    <label className="block" htmlFor={id}>{label}{hint}
      <input id={id} className={input} value={String(value ?? '')} onChange={e => set(e.target.value)} />{err}
    </label>
  );
}
