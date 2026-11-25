import clsx from 'clsx';
import { ArrowUp, Lock, Plus, Sparkles, Square } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { streamChat, type ChatEvent } from '@/api/chatStream';
import { messageOf } from '@/api/errors';
import { ThinkingBubble } from '@/components/Thinking';
import { Alert, BoardHeader, Label, type LabelColor } from '@/components/ui';
import { num, usd } from '@/lib/format';

type Turn = {
  id: string;
  prompt: string;
  topic?: string;
  status?: string;
  answer: string;
  tokens?: number;
  cost?: number;
  error?: string;
  done: boolean;
};

const COLORS: LabelColor[] = ['green', 'yellow', 'purple', 'orange', 'blue', 'red'];
const newSession = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24);

export default function ChatPage() {
  const topics = useQuery({ queryKey: ['topics'], queryFn: () => unwrap(api.GET('/api/v1/topics')) });
  const [topic, setTopic] = useState<string | null>(null); // null = auto-route
  const [turns, setTurns] = useState<Turn[]>([]);
  const [prompt, setPrompt] = useState('');
  const [session, setSession] = useState(newSession);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const busy = turns.some(t => !t.done);

  const colorOf = (t?: string) => COLORS[Math.max(0, (topics.data ?? []).findIndex(x => x.topic === t)) % COLORS.length];
  const nameOf = (t?: string) => topics.data?.find(x => x.topic === t)?.display_name ?? t;

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);

  const update = (id: string, f: (t: Turn) => Turn) => setTurns(ts => ts.map(t => (t.id === id ? f(t) : t)));

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    const id = crypto.randomUUID();
    setTurns(ts => [...ts, { id, prompt: text, answer: '', done: false, status: 'Thinking' }]);
    setPrompt('');
    abort.current = new AbortController();
    const on = (ev: ChatEvent) => {
      if (ev.type === 'routed') update(id, t => ({ ...t, topic: ev.topic }));
      else if (ev.type === 'status') update(id, t => ({ ...t, status: ev.content }));
      else if (ev.type === 'token') update(id, t => ({ ...t, answer: t.answer + ev.content, status: undefined }));
      else if (ev.type === 'usage') update(id, t => ({ ...t, tokens: Number(ev.data.total_tokens ?? 0), cost: Number(ev.data.cost_usd ?? 0) }));
      else if (ev.type === 'error') update(id, t => ({ ...t, error: ev.content || 'The assistant failed' }));
      else if (ev.type === 'done') update(id, t => ({ ...t, done: true, status: undefined }));
    };
    try {
      await streamChat({ prompt: text, session_id: session, topic }, on, abort.current.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') update(id, t => ({ ...t, error: messageOf(err) }));
    } finally {
      update(id, t => ({ ...t, done: true, status: undefined }));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  const reset = () => { abort.current?.abort(); setTurns([]); setSession(newSession()); };

  return (
    <>
      <BoardHeader
        title="Ask the agency"
        sub="Auto picks the right assistant — or choose one."
        action={turns.length > 0 && (
          <button onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/20 px-3 text-sm font-semibold text-white hover:bg-white/30">
            <Plus className="size-4" /> New chat
          </button>
        )}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        {/* assistants: a list on wide screens, a sideways strip on phones */}
        <section className="list-col p-2 md:sticky md:top-18 md:w-64 md:shrink-0" aria-label="Assistants">
          <h2 className="px-2 pb-2 pt-1 text-sm font-semibold">Assistants</h2>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
            <TopicCard active={topic === null} onClick={() => setTopic(null)} title="Auto" line="Routes each question" color="blue" icon />
            {(topics.data ?? []).map((t, i) => (
              <TopicCard key={t.topic} active={topic === t.topic} disabled={!t.entitled}
                onClick={() => setTopic(t.topic)} title={t.display_name} line={t.entitled ? t.description : 'Not in your plan'}
                color={COLORS[i % COLORS.length]} />
            ))}
          </div>
        </section>

        {/* the conversation: one wide list of cards */}
        <section className="list-col flex min-h-[60dvh] min-w-0 flex-1 flex-col p-2" aria-label="Conversation">
          <div className="flex-1 space-y-2 p-1" aria-live="polite">
            {turns.length === 0 && <Empty onPick={setPrompt} />}
            {turns.map(t => (
              <div key={t.id} className="space-y-2">
                {/* my question: bubble on the right */}
                <div className="ml-auto w-fit max-w-[85%] animate-[fadein_.25s_ease] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-white shadow-[var(--shadow-card)] dark:text-slate-950">
                  <p className="whitespace-pre-wrap">{t.prompt}</p>
                </div>
                {/* the answer: thinking bubble first, then the streamed answer in a bubble on the left */}
                {!t.answer && !t.error && !t.done ? (
                  <ThinkingBubble step={t.status !== 'Thinking' ? t.status : undefined} />
                ) : (
                  <article className="w-fit max-w-[95%] animate-[fadein_.25s_ease] rounded-2xl rounded-bl-md bg-panel p-3 shadow-[var(--shadow-card)] sm:max-w-[85%] sm:p-4">
                    {t.topic && <div className="mb-1.5"><Label color={colorOf(t.topic)}>{nameOf(t.topic)}</Label></div>}
                    {t.answer && (
                      <div className={clsx('prose-answer text-[15px]', !t.done && 'streaming')}>
                        <Markdown remarkPlugins={[remarkGfm]}>{t.answer}</Markdown>
                      </div>
                    )}
                    {t.error && <Alert>{t.error}</Alert>}
                    {t.done && t.tokens != null && (
                      <div className="mt-2 border-t border-line pt-2 text-xs text-muted">{num(t.tokens)} tokens · {usd(t.cost)}</div>
                    )}
                  </article>
                )}
              </div>
            ))}
            <div ref={bottom} />
          </div>

          <form onSubmit={send} className="card sticky bottom-20 mt-2 flex items-end gap-2 p-2 md:bottom-3">
            <label htmlFor="prompt" className="sr-only">Your question</label>
            <textarea
              id="prompt" rows={1} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={onKey}
              placeholder={topic ? `Ask ${nameOf(topic)}…` : 'Ask anything…'}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted field-sizing-content"
            />
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop"
                className="inline-flex size-11 items-center justify-center rounded-lg bg-ink text-white"><Square className="size-4" /></button>
            ) : (
              <button type="submit" disabled={!prompt.trim()} aria-label="Send"
                className="inline-flex size-11 items-center justify-center rounded-lg bg-brand text-white disabled:opacity-40 dark:text-slate-950"><ArrowUp className="size-5" /></button>
            )}
          </form>
        </section>
      </div>
    </>
  );
}

function TopicCard({ title, line, color, active, disabled, onClick, icon }:
  { title: string; line: string; color: LabelColor; active: boolean; disabled?: boolean; onClick: () => void; icon?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      className={clsx(
        'card w-44 shrink-0 p-3 text-left transition md:w-full',
        active ? 'ring-2 ring-brand' : 'hover:shadow-[var(--shadow-lift)]',
        disabled && 'cursor-not-allowed opacity-55',
      )}>
      <span className={clsx('mb-1.5 block h-2 w-10 rounded-full', `bg-label-${color}`)} />
      <span className="flex items-center gap-1.5 font-semibold">
        {icon && <Sparkles className="size-4 text-brand" />}{title}{disabled && <Lock className="size-3.5 text-muted" />}
      </span>
      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{line}</span>
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
    </div>
  );
}
