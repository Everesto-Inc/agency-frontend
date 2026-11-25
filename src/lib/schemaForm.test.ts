import { changedPaths, getAt, labelOf, resolve, setAt, type Schema } from './schemaForm';

const root: Schema = {
  $defs: { Tier: { enum: ['low', 'mid', 'high'], type: 'string' }, Plan: { type: 'object', properties: { max_tier: { $ref: '#/$defs/Tier' } } } },
  properties: { plans: { type: 'object', additionalProperties: { $ref: '#/$defs/Plan' } } },
};

describe('schemaForm', () => {
  it('resolves refs and optionals', () => {
    expect(resolve({ $ref: '#/$defs/Tier' }, root).enum).toEqual(['low', 'mid', 'high']);
    expect(resolve({ $ref: '#/$defs/Plan' }, root).title).toBeUndefined();   // labels come from the key
    expect(resolve({ anyOf: [{ type: 'integer' }, { type: 'null' }], title: 'X' }, root)).toMatchObject({ type: 'integer', title: 'X' });
  });

  it('gets and sets nested values without mutating', () => {
    const v = { plans: { free: { daily_token_limit: 50000 } } };
    const next = setAt(v, ['plans', 'free', 'daily_token_limit'], 80000);
    expect(getAt(next, ['plans', 'free', 'daily_token_limit'])).toBe(80000);
    expect(v.plans.free.daily_token_limit).toBe(50000);
  });

  it('lists what changed from the file', () => {
    expect(changedPaths({ a: 1, b: { c: [1, 2], d: 'x' } }, { a: 1, b: { c: [1, 3], d: 'x' } })).toEqual(['b.c']);
    expect(changedPaths({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it('labels', () => {
    expect(labelOf('daily_cost_limit_usd', { title: 'Daily Cost Limit Usd' })).toBe('Daily Cost Limit USD');
    expect(labelOf('free')).toBe('Free');
  });
});
