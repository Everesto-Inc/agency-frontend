import { timeline } from './AdminRunsPage';

describe('timeline', () => {
  it('places calls from the earliest start (routing before the run) and splits model time vs the rest', () => {
    const run = { created_at: '2026-11-25T10:00:01.000Z', latency_ms: 9000 };
    const calls = [
      { started_at: '2026-11-25T10:00:00.000Z', created_at: 'x', latency_ms: 1000 },   // routing at the edge
      { started_at: '2026-11-25T10:00:02.000Z', created_at: 'x', latency_ms: 2000 },
      { started_at: '2026-11-25T10:00:03.000Z', created_at: 'x', latency_ms: 2000 },   // overlaps the previous one
    ];
    const t = timeline(run, calls);
    expect(t.bars.map(b => b.start)).toEqual([0, 2000, 3000]);
    expect(t.total).toBe(10000);
    expect(t.llmMs).toBe(4000);           // 1 s + (2 s..5 s) — overlap counted once
    expect(t.otherMs).toBe(6000);
  });
});
