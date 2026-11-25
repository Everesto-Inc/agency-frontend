import { useEffect, useState } from 'react';

/** Our own waiting words — playful, agency-flavoured. Shown while the assistant works. */
export const THINKING_WORDS = [
  'Brewing', 'Pondering', 'Rummaging', 'Cross-checking', 'Crunching', 'Noodling', 'Sleuthing', 'Tinkering',
  'Mulling', 'Scouting', 'Weighing', 'Untangling', 'Digging', 'Hatching', 'Simmering', 'Puzzling',
  'Sifting', 'Conjuring', 'Fact-hunting', 'Number-wrangling', 'Shop-hopping', 'Chart-squinting',
];

/** A word that changes every ~1.8 s (random start, never the same twice in a row). */
export function useThinkingWord(active: boolean) {
  const [i, setI] = useState(() => Math.floor(Math.random() * THINKING_WORDS.length));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setI(prev => (prev + 1 + Math.floor(Math.random() * (THINKING_WORDS.length - 1))) % THINKING_WORDS.length), 1800);
    return () => clearInterval(t);
  }, [active]);
  return THINKING_WORDS[i];
}

/** iMessage-like "typing" bubble: three bouncing dots + the playful word + the backend's real step. */
export function ThinkingBubble({ step }: { step?: string }) {
  const word = useThinkingWord(true);
  return (
    <div className="flex flex-col items-start gap-1" role="status" aria-label={step ?? 'Thinking'}>
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-panel px-3.5 py-2.5 shadow-[var(--shadow-card)]">
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map(d => (
            <span key={d} className="size-2 animate-bounce rounded-full bg-muted/70" style={{ animationDelay: `${d * 150}ms`, animationDuration: '1s' }} />
          ))}
        </span>
        <span key={word} className="animate-[fadein_.35s_ease] text-sm font-medium text-ink">{word}…</span>
      </div>
      {step && <span className="pl-2 text-xs text-muted">{step}</span>}
    </div>
  );
}
