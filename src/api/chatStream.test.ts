import { parseSse } from './chatStream';

describe('parseSse', () => {
  it('parses the backend events and keeps the unfinished tail', () => {
    const buf =
      'event: routed\ndata: {"topic": "finance", "confidence": 0.9, "method": "keywords"}\n\n' +
      'event: status\ndata: {"type":"status","content":"Parsing","data":{}}\n\n' +
      'event: token\ndata: {"type":"token","content":"**Hi**","data":{}}\n\n' +
      'event: usage\ndata: {"type":"usage","content":"","data":{"total_tokens":12';
    const { events, rest } = parseSse(buf);
    expect(events.map(e => e.type)).toEqual(['routed', 'status', 'token']);
    expect(events[0]).toMatchObject({ type: 'routed', topic: 'finance' });
    expect(events[2]).toMatchObject({ content: '**Hi**' });
    expect(rest.startsWith('event: usage')).toBe(true);
  });

  it('handles CRLF and skips malformed or empty events', () => {
    const { events } = parseSse('event: token\r\ndata: {"type":"token","content":"a","data":{}}\r\n\r\nevent: x\ndata: {nope\n\n: comment\n\n');
    expect(events).toHaveLength(1);
  });
});
