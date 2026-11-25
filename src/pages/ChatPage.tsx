import clsx from 'clsx';
import { ArrowUp, Bot, History, Lock, Paperclip, Plus, Sparkles, Square, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { apiUrl } from '@/config';
import remarkGfm from 'remark-gfm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { api, unwrap } from '@/api/client';
import { streamChat, type ChatEvent } from '@/api/chatStream';
import { messageOf } from '@/api/errors';
import { ChatHistory, CONVERSATIONS_KEY } from '@/components/ChatHistory';
import { ThinkingBubble } from '@/components/Thinking';
import { Alert, BoardHeader, Label, Spinner, type LabelColor } from '@/components/ui';
import { num, usd } from '@/lib/format';
import { acceptPictures, loadPrivatePicture, MAX_PICTURES, pick, uploadPicture, type Picked } from '@/lib/pictures';

type Turn = {
  id: string;
  prompt: string | null;
  topic?: string;
  status?: string;
  answer: string | null;
  tokens?: number;
  cost?: number;
  models?: ModelUse[];
  pictures?: SentPic[];
  requestId?: string;   // from the stream's `done` event (or the history) → 👍/👎
  feedback?: number | null;
  error?: string;
  done: boolean;
};

/** A picture in the user's bubble: a local preview (just sent) or a stored one (history, loaded with the token). */
type SentPic = { key: string; url?: string; path?: string; description?: string | null };

type ModelUse = { model: string; calls?: number };

/** Pure: a markdown image src → URL we may load, or null. Only pictures stored by our API are shown — an answer can
 *  never make the browser load a third-party address (no tracking / data leaks through image links). */
export function safeImageSrc(src: unknown, base: string = apiUrl): string | null {
  return typeof src === 'string' && /^\/api\/v1\/images\/[0-9a-f]{64}$/.test(src) ? base + src : null;
}

const MD_COMPONENTS: Components = {
  img: ({ src, alt }) => {
    const url = safeImageSrc(src);
    if (!url) return null;
    return (
      <a href={url} target="_blank" rel="noreferrer" className="my-2 block w-fit" title="Open full size">
        <img src={url} alt={alt ?? ''} loading="lazy"
             className="max-h-72 max-w-full rounded-lg border border-line bg-surface object-contain shadow-sm" />
      </a>
    );
  },
};
const COLORS: LabelColor[] = ['green', 'yellow', 'purple', 'orange', 'blue', 'red'];

/** Pure: the `models` of a usage event → [{ model, calls }] (ignores anything malformed). */
export function modelsOf(v: unknown): ModelUse[] {
  return Array.isArray(v) ? v.filter(m => m && typeof m.model === 'string').map(m => ({ model: m.model, calls: Number(m.calls) || 1 })) : [];
}
const newSession = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24);

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const topics = useQuery({ queryKey: ['topics'], queryFn: () => unwrap(api.GET('/api/v1/topics')) });
  const [topic, setTopic] = useState<string | null>(null); // null = auto-route
  const [turns, setTurns] = useState<Turn[]>([]);
  const [prompt, setPrompt] = useState('');
  // chats started on this page or already loaded: never fetched again (a refetch would clobber a streaming answer)
  const known = useRef(new Set<string>());
  const [session, setSession] = useState(() => {
    if (conversationId) return conversationId;  // opened by address (reload, link) → still fetched below
    const s = newSession(); known.current.add(s); return s;
  });
  const [title, setTitle] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [picked, setPicked] = useState<Picked[]>([]);   // chosen, NOT uploaded yet (that happens on Send)
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const busy = turns.some(t => !t.done);

  // open a conversation from the history (not the one this page just started)
  const opened = useQuery({
    queryKey: ['conversation', conversationId],
    enabled: !!conversationId && !known.current.has(conversationId),
    queryFn: () => unwrap(api.GET('/api/v1/conversations/{conversation_id}', { params: { path: { conversation_id: conversationId! } } })),
  });
  useEffect(() => {
    if (!conversationId) { if (!busy && turns.length) reset(false); return; }
    if (conversationId === session) return;
    abort.current?.abort();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = opened.data;
    if (!c || c.id !== conversationId) return;
    known.current.add(c.id);
    setSession(c.id);
    setTitle(c.title);
    setTurns(c.messages.map(m => ({
      id: m.request_id, prompt: m.prompt, answer: m.answer, topic: m.topic, done: true,
      pictures: (m.images ?? []).map(i => ({ key: i.id, path: i.path, description: i.description })),
      requestId: m.request_id, feedback: m.feedback_score,
      tokens: m.total_tokens, cost: m.cost_usd, models: (m.models ?? []).map(model => ({ model })), error: m.status === 'success' || m.status === 'running' ? undefined : `This answer ended with: ${m.status}`,
    })));
  }, [opened.data, conversationId]);

  const colorOf = (t?: string) => COLORS[Math.max(0, (topics.data ?? []).findIndex(x => x.topic === t)) % COLORS.length];
  const nameOf = (t?: string | null) => topics.data?.find(x => x.topic === t)?.display_name ?? t ?? '';

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);

  const update = (id: string, f: (t: Turn) => Turn) => setTurns(ts => ts.map(t => (t.id === id ? f(t) : t)));

  async function addFiles(files: File[]) {
    const { take, note } = acceptPictures(picked.length, files);
    setPickNote(note);
    if (!take.length) return;
    try {
      const fresh = await pick(take.map(i => files[i]));
      setPicked(p => [...p, ...fresh].slice(0, MAX_PICTURES));
    } catch {
      setPickNote('Could not read this picture — try a JPEG or PNG');
    }
  }
  const unpick = (key: string) => setPicked(p => {
    p.filter(x => x.key === key).forEach(x => URL.revokeObjectURL(x.url));
    return p.filter(x => x.key !== key);
  });
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const pics = picked;
    const text = prompt.trim() || (pics.length ? (pics.length > 1 ? 'What is in these pictures?' : 'What is in this picture?') : '');
    if (!text || busy) return;
    const id = crypto.randomUUID();
    const first = turns.length === 0;
    // shown at once from the browser's own copy; the upload runs while the assistant is "thinking"
    setTurns(ts => [...ts, { id, prompt: text, answer: '', done: false, status: pics.length ? 'Looking at your picture' : 'Thinking',
      pictures: pics.map(p => ({ key: p.key, url: p.url })) }]);
    setPrompt(''); setPicked([]); setPickNote(null);
    if (first) { setTitle(text.length > 80 ? `${text.slice(0, 80)}…` : text); navigate(`/c/${session}`, { replace: !conversationId }); }
    abort.current = new AbortController();
    const on = (ev: ChatEvent) => {
      if (ev.type === 'routed') update(id, t => ({ ...t, topic: ev.topic }));
      else if (ev.type === 'status') update(id, t => ({ ...t, status: ev.content }));
      else if (ev.type === 'token') update(id, t => ({ ...t, answer: (t.answer ?? '') + ev.content, status: undefined }));
      else if (ev.type === 'usage') update(id, t => ({ ...t, tokens: Number(ev.data.total_tokens ?? 0), cost: Number(ev.data.cost_usd ?? 0), models: modelsOf(ev.data.models) }));
      else if (ev.type === 'error') update(id, t => ({ ...t, error: ev.content || 'The assistant failed' }));
      else if (ev.type === 'done') update(id, t => ({ ...t, done: true, status: undefined, requestId: typeof ev.data.request_id === 'string' ? ev.data.request_id : undefined }));
    };
    try {
      const signal = abort.current.signal;
      const imageIds = await Promise.all(pics.map(p => uploadPicture(p.blob, session, signal)));
      await streamChat({ prompt: text, session_id: session, topic, image_ids: imageIds }, on, signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') update(id, t => ({ ...t, error: messageOf(err) }));
    } finally {
      update(id, t => ({ ...t, done: true, status: undefined }));
      qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY }); // the history shows it / moves it to the top
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  function reset(go = true) {
    abort.current?.abort();
    const s = newSession(); known.current.add(s);
    setTurns([]); setTitle(null); setSession(s); setDrawer(false);
    if (go) navigate('/');
  }

  const loading = !!conversationId && !known.current.has(conversationId) && opened.isPending;

  return (
    <>
      <BoardHeader
        title={title ?? 'Ask the agency'}
        sub={title ? undefined : 'Auto picks the right assistant — or choose one.'}
        action={
          <div className="flex gap-2">
            <button onClick={() => setDrawer(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/20 px-3 text-sm font-semibold text-white hover:bg-white/30 md:hidden">
              <History className="size-4" /> Chats
            </button>
            {(turns.length > 0 || conversationId) && (
              <button onClick={() => reset()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/20 px-3 text-sm font-semibold text-white hover:bg-white/30">
                <Plus className="size-4" /> New chat
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        {/* history: a list on tablet/desktop */}
        <aside className="list-col hidden p-2 md:sticky md:top-18 md:block md:max-h-[calc(100dvh-6rem)] md:w-72 md:shrink-0" aria-label="Chat history">
          <ChatHistory activeId={conversationId} onNew={() => reset()} />
        </aside>

        {/* history: a drawer on phones */}
        {drawer && (
          <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true" aria-label="Chat history">
            <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setDrawer(false)} />
            <div className="list-col absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col rounded-l-none p-2 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[var(--shadow-lift)]">
              <ChatHistory activeId={conversationId} onNew={() => reset()} onNavigate={() => setDrawer(false)} onClose={() => setDrawer(false)} />
            </div>
          </div>
        )}

        {/* the conversation */}
        <section className="list-col flex min-h-[60dvh] min-w-0 flex-1 flex-col p-2" aria-label="Conversation">
          {/* assistants as chips */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2" role="group" aria-label="Assistant">
            <Chip active={topic === null} onClick={() => setTopic(null)} color="blue"><Sparkles className="size-3.5" /> Auto</Chip>
            {(topics.data ?? []).map((t, i) => (
              <Chip key={t.topic} active={topic === t.topic} disabled={!t.entitled} onClick={() => setTopic(t.topic)} color={COLORS[i % COLORS.length]}
                title={t.entitled ? t.description : 'Not in your plan'}>
                {t.display_name}{!t.entitled && <Lock className="size-3" />}
              </Chip>
            ))}
          </div>

          <div className="flex-1 space-y-2 p-1" aria-live="polite">
            {loading && <Spinner label="Opening the conversation" />}
            {opened.error && <Alert>{messageOf(opened.error)}</Alert>}
            {!loading && turns.length === 0 && <Empty onPick={setPrompt} />}
            {turns.map(t => (
              <div key={t.id} className="space-y-2">
                <div className={clsx('ml-auto w-fit max-w-[85%] animate-[fadein_.25s_ease] rounded-2xl rounded-br-md px-3.5 py-2 shadow-[var(--shadow-card)]',
                  t.prompt === null ? 'bg-panel italic text-muted' : 'bg-brand text-white dark:text-slate-950')}>
                  {t.pictures && t.pictures.length > 0 && <PictureStrip pictures={t.pictures} />}
                  <p className="whitespace-pre-wrap">{t.prompt ?? 'Question text removed after the retention period'}</p>
                </div>
                {!t.answer && !t.error && !t.done ? (
                  <ThinkingBubble step={t.status !== 'Thinking' ? t.status : undefined} />
                ) : (
                  <article className="w-fit max-w-[95%] animate-[fadein_.25s_ease] rounded-2xl rounded-bl-md bg-panel p-3 shadow-[var(--shadow-card)] sm:max-w-[85%] sm:p-4">
                    {t.topic && <div className="mb-1.5"><Label color={colorOf(t.topic)}>{nameOf(t.topic)}</Label></div>}
                    {t.answer ? (
                      <div className={clsx('prose-answer text-[15px]', !t.done && 'streaming')}>
                        <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{t.answer}</Markdown>
                      </div>
                    ) : t.done && !t.error && <p className="text-sm italic text-muted">Answer text removed after the retention period</p>}
                    {t.error && <Alert>{t.error}</Alert>}
                    {t.done && t.tokens != null && (
                      <AnswerFooter models={t.models} tokens={t.tokens} cost={t.cost}
                        rate={t.requestId && !t.error ? <Rating session={session} turn={t} onRated={f => update(t.id, x => ({ ...x, feedback: f }))} /> : null} />
                    )}
                  </article>
                )}
              </div>
            ))}
            <div ref={bottom} />
          </div>

          <form onSubmit={send} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
            className={clsx('card sticky bottom-20 mt-2 p-2 md:bottom-3', dragging && 'ring-2 ring-brand')}>
            {dragging && <p className="px-2 pb-1 text-sm font-semibold text-brand">Drop the picture to add it</p>}
            {picked.length > 0 && (
              <ul className="flex gap-2 px-1 pb-2" aria-label="Pictures to send">
                {picked.map(p => (
                  <li key={p.key} className="relative">
                    <img src={p.url} alt={p.name} className="size-16 rounded-lg border border-line object-cover" />
                    <button type="button" onClick={() => unpick(p.key)} aria-label={`Remove ${p.name}`}
                      className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-ink text-white shadow">
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pickNote && <p className="px-2 pb-1 text-xs text-red-600 dark:text-red-400" role="status">{pickNote}</p>}
            <div className="flex items-end gap-2">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
              onChange={e => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={picked.length >= MAX_PICTURES}
              aria-label="Add a picture" title={`Add a picture (or paste / drop one) — up to ${MAX_PICTURES}`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-brand-soft hover:text-ink disabled:opacity-40">
              <Paperclip className="size-5" />
            </button>
            <label htmlFor="prompt" className="sr-only">Your question</label>
            <textarea
              id="prompt" rows={1} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={onKey} onPaste={onPaste}
              placeholder={topic ? `Ask ${nameOf(topic)}…` : 'Ask anything…'}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted field-sizing-content"
            />
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop"
                className="inline-flex size-11 items-center justify-center rounded-lg bg-ink text-white"><Square className="size-4" /></button>
            ) : (
              <button type="submit" disabled={!prompt.trim() && picked.length === 0} aria-label="Send"
                className="inline-flex size-11 items-center justify-center rounded-lg bg-brand text-white disabled:opacity-40 dark:text-slate-950"><ArrowUp className="size-5" /></button>
            )}
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

/** Pictures in the user's bubble. Just sent: the browser's own copy. From the history: loaded with the token
 *  (only the owner may see them). The description is what the assistants got. */
function PictureStrip({ pictures }: { pictures: SentPic[] }) {
  return (
    <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
      {pictures.map(p => <SentPicture key={p.key} pic={p} />)}
    </div>
  );
}

function SentPicture({ pic }: { pic: SentPic }) {
  const [src, setSrc] = useState(pic.url ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (pic.url || !pic.path) return;
    const ctl = new AbortController();
    let made: string | null = null;
    loadPrivatePicture(pic.path, ctl.signal)
      .then(u => { if (ctl.signal.aborted) URL.revokeObjectURL(u); else { made = u; setSrc(u); setFailed(false); } })
      .catch(() => { if (!ctl.signal.aborted) setFailed(true); });   // a cancelled load is not a missing picture
    return () => { ctl.abort(); if (made) URL.revokeObjectURL(made); };
  }, [pic.url, pic.path]);
  const label = pic.description ? `Your picture — the assistant saw: ${pic.description}` : 'Your picture';
  if (failed) return <span className="inline-flex size-24 items-center justify-center rounded-lg bg-white/20 p-1 text-center text-[11px]">Picture deleted</span>;
  if (!src) return <span className="size-24 animate-pulse rounded-lg bg-white/20" aria-label="Loading picture" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" title={label}>
      <img src={src} alt={label} className="size-24 rounded-lg border border-white/40 object-cover sm:size-28" />
    </a>
  );
}

/** 👍 / 👎 under an answer. A rating becomes a test-case candidate (Admin → Quality); 👎 can say what was wrong. */
function Rating({ session, turn, onRated }: { session: string; turn: Turn; onRated: (score: number) => void }) {
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const rate = useMutation({
    mutationFn: (body: { score: -1 | 0 | 1; comment?: string }) => unwrap(api.POST('/api/v1/conversations/{conversation_id}/messages/{request_id}/feedback', {
      params: { path: { conversation_id: session, request_id: turn.requestId! } }, body,
    })),
    onSuccess: (_, body) => { onRated(body.score); if (body.comment) { setSent(true); setAsking(false); } },
  });
  const score = turn.feedback ?? 0;
  const click = (s: -1 | 1) => {
    const next = score === s ? 0 : s;        // click again = take it back
    rate.mutate({ score: next });
    setAsking(next === -1); setSent(false);
  };
  const btn = (s: -1 | 1, Icon: typeof ThumbsUp, label: string) => (
    <button type="button" onClick={() => click(s)} aria-pressed={score === s} aria-label={label} title={label} disabled={rate.isPending}
      className={clsx('inline-flex size-7 items-center justify-center rounded-md transition hover:bg-brand-soft',
        score === s ? (s === 1 ? 'text-green-600' : 'text-red-500') : 'text-muted')}>
      <Icon className={clsx('size-4', score === s && 'fill-current')} />
    </button>
  );
  return (
    <span className="flex flex-wrap items-center gap-0.5">
      {btn(1, ThumbsUp, 'Good answer')}{btn(-1, ThumbsDown, 'Bad answer')}
      {asking && (
        <form className="ml-1 flex items-center gap-1" onSubmit={e => { e.preventDefault(); if (comment.trim()) rate.mutate({ score: -1, comment: comment.trim() }); }}>
          <label htmlFor={`why-${turn.id}`} className="sr-only">What was wrong?</label>
          <input id={`why-${turn.id}`} autoFocus value={comment} onChange={e => setComment(e.target.value)} maxLength={500}
            placeholder="What was wrong? (optional)" className="h-7 w-52 rounded-md border border-line bg-surface px-2 text-xs text-ink" />
          <button type="submit" className="h-7 rounded-md bg-brand px-2 text-xs font-semibold text-white dark:text-slate-950">Send</button>
        </form>
      )}
      {sent && <span className="ml-1 text-green-600">Thanks — noted</span>}
      {rate.error && <span className="ml-1 text-red-500">{messageOf(rate.error)}</span>}
      <span aria-hidden className="mx-1">·</span>
    </span>
  );
}

/** Under every answer: which model(s) answered, tokens, cost. */
function AnswerFooter({ models = [], tokens, cost, rate }: { models?: ModelUse[]; tokens: number; cost?: number; rate?: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2 text-xs text-muted">
      {rate}
      {models.length > 0 && (
        <span className="flex flex-wrap items-center gap-1" title="Models that wrote this answer (via the model gateway)">
          <Bot className="size-3.5" aria-label="Answered by" />
          {models.map(m => (
            <span key={m.model} className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] text-ink">
              {m.model}{m.calls && m.calls > 1 ? ` ×${m.calls}` : ''}
            </span>
          ))}
          <span aria-hidden>·</span>
        </span>
      )}
      <span>{num(tokens)} tokens · {usd(cost)}</span>
    </div>
  );
}

function Chip({ active, disabled, onClick, color, title, children }:
  { active: boolean; disabled?: boolean; onClick: () => void; color: LabelColor; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} title={title}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition',
        active ? 'bg-ink text-white dark:bg-white dark:text-slate-900' : 'bg-panel shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)]',
        disabled && 'cursor-not-allowed opacity-50',
      )}>
      {!active && <span className={clsx('size-2 rounded-full', `bg-label-${color}`)} />}
      {children}
    </button>
  );
}

const EXAMPLES = [
  'Range and battery of the 2024 Hyundai Ioniq 5 in Germany?',
  'Cheapest Sony WH-1000XM5 in France right now?',
  'Is Apple stock expensive compared to its peers?',
];

function Empty({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="grid gap-2 p-1 sm:grid-cols-3">
      {EXAMPLES.map(x => (
        <button key={x} type="button" onClick={() => onPick(x)} className="card p-3 text-left text-sm hover:shadow-[var(--shadow-lift)]">
          <span className="mb-1.5 block h-2 w-8 rounded-full bg-label-blue" />{x}
        </button>
      ))}
      <p className="text-xs text-muted sm:col-span-3">
        EV data: electricity prices <a className="underline" href="https://ec.europa.eu/eurostat" target="_blank" rel="noreferrer">Eurostat</a> ·
        fuel prices <a className="underline" href="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en" target="_blank" rel="noreferrer">EU Weekly Oil Bulletin</a> ·
        car specs <a className="underline" href="https://github.com/KilowattApp/open-ev-data" target="_blank" rel="noreferrer">Open EV Data</a> (MIT) · anything else is checked on its source page.
      </p>
    </div>
  );
}
