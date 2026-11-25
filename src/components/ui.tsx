import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function Button({ variant = 'primary', busy, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'subtle' | 'danger' | 'light'; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={clsx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-brand text-white shadow-[var(--shadow-card)] hover:bg-brand-strong dark:text-slate-950',
        variant === 'subtle' && 'text-ink hover:bg-black/5 dark:hover:bg-white/10',
        variant === 'light' && 'bg-white/20 text-white hover:bg-white/30',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Input({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const hintId = useId();
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
        <input
          {...rest}
          aria-describedby={hint ? hintId : undefined}
          className={clsx(
            'block min-h-11 w-full rounded-lg border-2 border-line bg-panel px-3 text-base placeholder:text-muted focus:border-brand focus:outline-none sm:text-sm',
            className,
          )}
        />
      </label>
      {/* outside the label: read as a description, not as part of the field's name */}
      {hint && <span id={hintId} className="block text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** A white lifted card (the unit of the board). */
export function Card({ children, className, labels }: { children: ReactNode; className?: string; labels?: LabelColor[] }) {
  return (
    <article className={clsx('card p-3', className)}>
      {labels && labels.length > 0 && (
        <div className="mb-2 flex gap-1">{labels.map(c => <span key={c} className={clsx('h-2 w-10 rounded-full', LABEL_BG[c])} />)}</div>
      )}
      {children}
    </article>
  );
}

/** A board list (column): title + cards. Fixed width on wide screens, full width on phones. */
export function List({ title, count, action, children, className }:
  { title: ReactNode; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('list-col flex w-full shrink-0 flex-col p-2 md:w-72', className)}>
      <header className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
        <h2 className="text-sm font-semibold">
          {title}{count != null && <span className="ml-1.5 font-normal text-muted">{count}</span>}
        </h2>
        {action}
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** Lists side by side (scroll sideways on tablet/desktop), stacked on phones. */
export function Board({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 md:flex-row md:items-start md:overflow-x-auto md:pb-3">{children}</div>;
}

export type LabelColor = 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'blue';
const LABEL_BG: Record<LabelColor, string> = {
  green: 'bg-label-green', yellow: 'bg-label-yellow', orange: 'bg-label-orange',
  red: 'bg-label-red', purple: 'bg-label-purple', blue: 'bg-label-blue',
};

/** A coloured label with text (plan, role, status). */
export function Label({ color, children }: { color: LabelColor; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold text-slate-900', LABEL_BG[color])}>
      {children}
    </span>
  );
}

export function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'info' | 'ok'; children: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx(
      'rounded-lg px-3 py-2 text-sm font-medium',
      tone === 'danger' && 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200',
      tone === 'info' && 'bg-brand-soft text-ink',
      tone === 'ok' && 'bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200',
    )}>{children}</div>
  );
}

export function Spinner({ label = 'Loading', light }: { label?: string; light?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2 py-10 text-sm', light ? 'text-white/80' : 'text-muted')} role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

/** Title row on the gradient board. */
export function BoardHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-white">
      <div>
        <h1 className="text-xl font-bold drop-shadow-sm sm:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-white/80">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
