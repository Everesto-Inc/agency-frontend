import { apiUrl } from '@/config';
import { authFetch } from './client';
import { ApiError } from './errors';

/** One server-sent event of POST /api/v1/chat (stream=true). */
export type ChatEvent =
  | { type: 'routed'; topic: string; confidence?: number; method?: string }
  | { type: 'status' | 'token' | 'answer' | 'error' | 'usage' | 'done'; content: string; data: Record<string, unknown> };

/** Pure: split an SSE buffer into complete events + the unfinished rest. */
export function parseSse(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    let name = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    try {
      const json = JSON.parse(data.join('\n'));
      events.push(name === 'routed' ? { type: 'routed', ...json } : { ...json, type: json.type ?? name });
    } catch { /* ignore a malformed event */ }
  }
  return { events, rest };
}

export async function streamChat(
  body: { prompt: string; session_id?: string; topic?: string | null; image_ids?: string[] },
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await authFetch(new Request(`${apiUrl}/api/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  }));
  if (!res.ok || !res.body) throw await ApiError.from(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseSse(buffer + value);
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
  parseSse(buffer + '\n\n').events.forEach(onEvent);
}
