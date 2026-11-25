import { summarize } from './AdminExperimentsPage';

const v = (passed: boolean, judge: number | null, cost: number, ms: number, model: string) =>
  ({ passed, judge_score: judge, failures: [], rationale: '', cost_usd: cost, latency_ms: ms, models: [model], status: 'success', answer: '' });

describe('summarize (live view of a running test)', () => {
  it('pass rate, judge, cost, p95 and models per variant', () => {
    const results = [
      { variants: { live: v(false, 3, 0.002, 6000, 'lite'), draft: v(true, 4.5, 0.003, 4000, 'flash') } },
      { variants: { live: v(true, null, 0.002, 7000, 'lite'), draft: v(true, 4.0, 0.004, 3000, 'flash') } },
    ];
    expect(summarize(results, 'live')).toMatchObject({ cases: 2, pass_rate: 0.5, mean_judge_score: 3, p95_latency_ms: 7000, models: { lite: 2 } });
    expect(summarize(results, 'draft')).toMatchObject({ pass_rate: 1, mean_judge_score: 4.25, total_cost_usd: 0.007 });
    expect(summarize(results, 'nope')).toEqual({});
  });
});
