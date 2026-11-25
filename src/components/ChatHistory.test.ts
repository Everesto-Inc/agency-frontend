import { groupConversations } from './ChatHistory';

const conv = (id: string, updated_at: string, pinned = false) =>
  ({ id, title: id, pinned, turns: 1, last_topic: null, created_at: updated_at, updated_at });

describe('groupConversations', () => {
  it('puts pinned first, then Today / Yesterday / Last 7 days / Older, newest first', () => {
    const now = new Date('2026-11-25T15:00:00');
    const groups = groupConversations([
      conv('old', new Date('2026-10-01T10:00:00').toISOString()),
      conv('today-early', new Date('2026-11-25T08:00:00').toISOString()),
      conv('pinned-old', new Date('2026-09-01T10:00:00').toISOString(), true),
      conv('yesterday', new Date('2026-11-24T22:00:00').toISOString()),
      conv('today-late', new Date('2026-11-25T14:00:00').toISOString()),
      conv('week', new Date('2026-11-20T10:00:00').toISOString()),
    ], now);
    expect(groups.map(g => [g.label, g.items.map(i => i.id)])).toEqual([
      ['Pinned', ['pinned-old']],
      ['Today', ['today-late', 'today-early']],
      ['Yesterday', ['yesterday']],
      ['Last 7 days', ['week']],
      ['Older', ['old']],
    ]);
  });

  it('drops empty groups', () => {
    expect(groupConversations([], new Date())).toEqual([]);
  });
});
