import { isPromiseLike } from './core';

/**
 * Port of Recoil's `stableStringify`. Family keys are built exactly the same
 * way as in Recoil (`${key}__${stableStringify(param)}`), so anything keyed by
 * `node.key` (persisted state, URL sync, analytics...) keeps working.
 */
export function stableStringify(x: unknown, opt: { allowFunctions?: boolean } = {}, key?: string): string {
  if (typeof x === 'string' && !x.includes('"') && !x.includes('\\')) {
    return `"${x}"`;
  }
  switch (typeof x) {
    case 'undefined':
      return '';
    case 'boolean':
      return x ? 'true' : 'false';
    case 'number':
    case 'symbol':
      return String(x);
    case 'string':
      return JSON.stringify(x);
    case 'function':
      if (opt.allowFunctions !== true) {
        throw new Error('Attempt to serialize function in a Recoil cache key');
      }
      return `__FUNCTION(${(x as { name: string }).name})__`;
  }
  if (x === null) return 'null';
  if (typeof x !== 'object') return JSON.stringify(x) ?? '';
  if (isPromiseLike(x)) return '__PROMISE__';
  if (Array.isArray(x)) {
    return `[${x.map((v, i) => stableStringify(v, opt, i.toString()))}]`;
  }
  const obj = x as Record<string, unknown> & { toJSON?: (k?: string) => unknown };
  if (typeof obj.toJSON === 'function') {
    return stableStringify(obj.toJSON(key), opt, key);
  }
  if (x instanceof Map) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of x) {
      o[typeof k === 'string' ? k : stableStringify(k, opt)] = v;
    }
    return stableStringify(o, opt, key);
  }
  if (x instanceof Set) {
    return stableStringify(
      Array.from(x).sort((a, b) => stableStringify(a, opt).localeCompare(stableStringify(b, opt))),
      opt,
      key,
    );
  }
  if (typeof (obj as any)[Symbol.iterator] === 'function') {
    return stableStringify(Array.from(obj as unknown as Iterable<unknown>), opt, key);
  }
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${stableStringify(k, opt)}:${stableStringify(obj[k], opt, k)}`)
    .join(',')}}`;
}
