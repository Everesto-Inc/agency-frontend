import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus, MoreHorizontal, Pencil, Pin, PinOff, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, unwrap, type Schemas } from '@/api/client';
import { messageOf } from '@/api/errors';
import { Alert, Spinner } from './ui';

type Conv = Schemas['ConversationSummary'];
export const CONVERSATIONS_KEY = ['conversations'] as const;

/** Pure: group by Pinned / Today / Yesterday / Last 7 days / Older (newest first inside each group). */
export function groupConversations(items: Conv[], now = new Date()): { label: string; items: Conv[] }[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86_400_000;
  const groups: Record<string, Conv[]> = { Pinned: [], Today: [], Yesterday: [], 'Last 7 days': [], Older: [] };
  for (const c of items) {
    const t = new Date(c.updated_at).getTime();
    const g = c.pinned ? 'Pinned' : t >= start ? 'Today' : t >= start - DAY ? 'Yesterday' : t >= start - 6 * DAY ? 'Last 7 days' : 'Older';
    groups[g].push(c);
  }
  return Object.entries(groups).filter(([, v]) => v.length).map(([label, v]) => ({
    label, items: v.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  }));
}

/** The "Chats" list: history of my conversations, as cards. */
export function ChatHistory({ activeId, onNew, onNavigate, onClose }:
  { activeId?: string; onNew: () => void; onNavigate?: () => void; onClose?: () => void }) {
  const [q, setQ] = useState('');
  const list = useQuery({
    queryKey: [...CONVERSATIONS_KEY, q],
    queryFn: () => unwrap(api.GET('/api/v1/conversations', { params: { query: { limit: 100, ...(q.trim() ? { q: q.trim() } : {}) } } })),
    placeholderData: prev => prev,
  });
  const groups = useMemo(() => groupConversations(list.data ?? []), [list.data]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
        <h2 className="text-sm font-semibold">Chats</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onNew} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-brand hover:bg-black/5 dark:hover:bg-white/10">
            <MessageSquarePlus className="size-4" /> New
          </button>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      <label className="mx-1 mb-2 flex h-9 items-center gap-2 rounded-lg bg-panel px-2.5 shadow-[var(--shadow-card)]">
        <Search className="size-4 text-muted" aria-hidden />
        <span className="sr-only">Search chats</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
      </label>

      <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1 pb-1">
        {list.isPending && <Spinner />}
        {list.error && <Alert>{messageOf(list.error)}</Alert>}
        {list.data?.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted">{q ? 'No chat matches.' : 'Your conversations will show up here.'}</p>
        )}
        {groups.map(g => (
          <section key={g.label}>
            <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h3>
            <ul className="space-y-1.5">
              {g.items.map(c => <ConvCard key={c.id} c={c} active={c.id === activeId} onNavigate={onNavigate} onDeleted={c.id === activeId ? onNew : undefined} />)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ConvCard({ c, active, onNavigate, onDeleted }: { c: Conv; active: boolean; onNavigate?: () => void; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(c.title);
  const refresh = () => qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });

  const patch = useMutation({
    mutationFn: (body: { title?: string; pinned?: boolean }) =>
      unwrap(api.PATCH('/api/v1/conversations/{conversation_id}', { params: { path: { conversation_id: c.id } }, body })),
    onSuccess: () => { setRenaming(false); setMenu(false); refresh(); },
  });
  const del = useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/conversations/{conversation_id}', { params: { path: { conversation_id: c.id } } })),
    onSuccess: () => { refresh(); onDeleted?.(); },
  });

  const rename = (e: FormEvent) => { e.preventDefault(); if (title.trim()) patch.mutate({ title: title.trim() }); };

  return (
    <li className={clsx('group card relative', active && 'ring-2 ring-brand')}>
      {renaming ? (
        <form onSubmit={rename} className="p-2">
          <label className="sr-only" htmlFor={`t-${c.id}`}>Chat title</label>
          <input id={`t-${c.id}`} autoFocus value={title} maxLength={200} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setRenaming(false)} onBlur={() => !patch.isPending && setRenaming(false)}
            className="w-full rounded-md border-2 border-brand bg-panel px-2 py-1 text-sm outline-none" />
        </form>
      ) : (
        <Link to={`/c/${c.id}`} onClick={onNavigate} className="block rounded-[10px] py-2 pl-3 pr-9">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {c.pinned && <Pin className="size-3 shrink-0 text-brand" aria-label="Pinned" />}
            <span className="line-clamp-2">{c.title}</span>
          </span>
          <span className="mt-0.5 block text-xs text-muted">{c.turns} {c.turns === 1 ? 'question' : 'questions'}</span>
        </Link>
      )}
      {!renaming && (
        <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label={`Actions for ${c.title}`}
          className={clsx('absolute right-1 top-1.5 inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-black/5 dark:hover:bg-white/10',
            !menu && 'md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100')}>
          <MoreHorizontal className="size-4" />
        </button>
      )}
      {menu && !renaming && (
        <div className="space-y-0.5 border-t border-line p-1">
          <Item onClick={() => patch.mutate({ pinned: !c.pinned })}>{c.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{c.pinned ? 'Unpin' : 'Pin'}</Item>
          <Item onClick={() => { setTitle(c.title); setRenaming(true); setMenu(false); }}><Pencil className="size-4" /> Rename</Item>
          <Item danger onClick={() => { if (confirm(`Delete "${c.title}"? Its questions and answers are erased.`)) del.mutate(); }}>
            <Trash2 className="size-4" /> Delete
          </Item>
        </div>
      )}
      {(patch.error || del.error) && <div className="p-2"><Alert>{messageOf(patch.error ?? del.error)}</Alert></div>}
    </li>
  );
}

function Item({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx('flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10', danger && 'text-danger')}>
      {children}
    </button>
  );
}
