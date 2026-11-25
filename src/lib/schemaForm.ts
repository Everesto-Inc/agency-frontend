/** Pure helpers for Admin → Settings: walk a pydantic JSON Schema and edit nested values immutably. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Schema = {
  $ref?: string; type?: string; title?: string; description?: string; enum?: string[]; default?: Json;
  minimum?: number; maximum?: number; exclusiveMinimum?: number; exclusiveMaximum?: number;
  properties?: Record<string, Schema>; additionalProperties?: Schema | boolean; items?: Schema;
  anyOf?: Schema[]; $defs?: Record<string, Schema>;
};
export type Path = (string | number)[];

/** Follow $ref (#/$defs/X) and unwrap Optional (anyOf [X, null]). */
export function resolve(s: Schema, root: Schema): Schema {
  let cur = s;
  for (let i = 0; i < 10; i++) {
    if (cur.$ref) {
      const name = cur.$ref.split('/').pop()!;
      // the field's own title only: a type name ("PlanConfig", "Tier") is no label — the key is
      cur = { ...root.$defs?.[name], ...cur, $ref: undefined, title: cur.title };
      continue;
    }
    if (cur.anyOf) {
      const real = cur.anyOf.find(x => x.type !== 'null');
      if (real) { cur = { ...real, title: cur.title ?? real.title, description: cur.description ?? real.description }; continue; }
    }
    return cur;
  }
  return cur;
}

export function getAt(v: Json | undefined, path: Path): Json | undefined {
  return path.reduce<Json | undefined>((o, k) => (o && typeof o === 'object' ? (o as Record<string, Json>)[k as string] : undefined), v);
}

export function setAt(v: Json, path: Path, value: Json): Json {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const obj = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, Json>;
  return { ...obj, [k]: setAt(obj[k as string] ?? {}, rest, value) };
}

/** Leaf paths whose value differs between a and b ("plans.free.daily_token_limit"). */
export function changedPaths(a: Json | undefined, b: Json | undefined, prefix = ''): string[] {
  const isObj = (x: unknown): x is Record<string, Json> => !!x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(a) && isObj(b)) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => changedPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
}

/** "daily_token_limit" → "Daily token limit" (pydantic titles are Title Case Words). */
export const labelOf = (key: string | number, s?: Schema) =>
  (s?.title && s.title !== String(key) ? s.title : String(key).replace(/_/g, ' ')).replace(/^\w/, c => c.toUpperCase())
    .replace(/\b(Usd|Llm|Pii|Ttl|Jsd)\b/g, m => m.toUpperCase());
