import { describe, it, expect, vi } from 'vitest';
import { createStore } from 'jotai/vanilla';
import { atom, selector, selectorFamily, constSelector, errorSelector, DefaultValue, RecoilLoadable } from '../index';
import { refreshInStore } from '../storeOps';

const flush = () => new Promise((r) => setTimeout(r, 0));
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('selector', () => {
  it('derives values and recomputes on change', () => {
    const a = atom({ key: 'sel/a', default: 2 });
    const double = selector({ key: 'sel/double', get: ({ get }) => get(a) * 2 });
    const store = createStore();
    expect(store.get(double)).toBe(4);
    store.set(a, 5);
    expect(store.get(double)).toBe(10);
  });

  it('supports writable selectors with updater and reset (DefaultValue)', () => {
    const celsius = atom({ key: 'sel/c', default: 0 });
    const fahrenheit = selector<number>({
      key: 'sel/f',
      get: ({ get }) => (get(celsius) * 9) / 5 + 32,
      set: ({ set }, v) => set(celsius, v instanceof DefaultValue ? v : ((v - 32) * 5) / 9),
    });
    const store = createStore();
    store.set(fahrenheit, 212);
    expect(store.get(celsius)).toBe(100);
    store.set(fahrenheit, (f) => f - 180);
    expect(store.get(celsius)).toBe(0);
    store.set(celsius, 50);
    store.set(fahrenheit, new DefaultValue());
    expect(store.get(celsius)).toBe(0);
  });

  it('setter get/set/reset work across nodes, including updaters', () => {
    const a = atom({ key: 'sel/set/a', default: 1 });
    const b = atom({ key: 'sel/set/b', default: 1 });
    const both = selector<number>({
      key: 'sel/set/both',
      get: ({ get }) => get(a) + get(b),
      set: ({ get, set, reset }, v) => {
        if (v instanceof DefaultValue) {
          reset(a);
          reset(b);
          return;
        }
        set(a, v);
        set(b, (prev) => prev + get(a));
      },
    });
    const store = createStore();
    store.set(both, 10);
    expect(store.get(a)).toBe(10);
    // Recoil semantics: get() in a setter reads the state from before the set.
    expect(store.get(b)).toBe(2);
    store.set(both, new DefaultValue());
    expect(store.get(both)).toBe(2);
  });

  it('throws when setting a read-only selector', () => {
    const ro = selector({ key: 'sel/ro', get: () => 1 });
    const store = createStore();
    expect(() => store.set(ro as any, 2)).toThrow(/read-only/);
  });

  it('caches by dependency values (does not re-run for previously seen inputs)', () => {
    const a = atom({ key: 'sel/cache/a', default: 1 });
    const spy = vi.fn((n: number) => n * 2);
    const s = selector({ key: 'sel/cache/s', get: ({ get }) => spy(get(a)) });
    const store = createStore();
    expect(store.get(s)).toBe(2);
    store.set(a, 2);
    expect(store.get(s)).toBe(4);
    store.set(a, 1);
    expect(store.get(s)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
    // The cache is shared between stores, like Recoil's.
    expect(createStore().get(s)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('honours cachePolicy_UNSTABLE most-recent and lru', () => {
    const a = atom({ key: 'sel/policy/a', default: 1 });
    const spyMR = vi.fn((n: number) => n);
    const mr = selector({
      key: 'sel/policy/mr',
      get: ({ get }) => spyMR(get(a)),
      cachePolicy_UNSTABLE: { eviction: 'most-recent' },
    });
    const spyLru = vi.fn((n: number) => n);
    const lru = selector({
      key: 'sel/policy/lru',
      get: ({ get }) => spyLru(get(a)),
      cachePolicy_UNSTABLE: { eviction: 'lru', maxSize: 2 },
    });
    const store = createStore();
    for (const v of [1, 2, 1, 3, 1]) {
      store.set(a, v);
      store.get(mr);
      store.get(lru);
    }
    expect(spyMR).toHaveBeenCalledTimes(5);
    // lru(2): 1, 2, (1 hit), 3 evicts 2, (1 hit)
    expect(spyLru).toHaveBeenCalledTimes(3);
  });

  it('resolves async dependencies for downstream selectors (Recoil semantics)', async () => {
    const d = deferred<number>();
    const user = selector({ key: 'sel/async/user', get: () => d.promise });
    const name = selector({ key: 'sel/async/name', get: ({ get }) => `user-${get(user)}` });
    const store = createStore();
    const p = store.get(name);
    expect(p).toBeInstanceOf(Promise);
    d.resolve(7);
    await expect(p).resolves.toBe('user-7');
    await flush();
    // Once resolved the value is cached and returned synchronously.
    expect(createStore().get(name)).toBe('user-7');
  });

  it('handles async get functions that read other atoms after await', async () => {
    const a = atom({ key: 'sel/asyncGet/a', default: 3 });
    const s = selector({
      key: 'sel/asyncGet/s',
      get: async ({ get }) => {
        await Promise.resolve();
        return get(a) * 2;
      },
    });
    const store = createStore();
    store.sub(s, () => {});
    expect(await store.get(s)).toBe(6);
    store.set(a, 4);
    expect(await store.get(s)).toBe(8);
  });

  it('propagates errors (sync and async)', async () => {
    const bad = selector({
      key: 'sel/err/sync',
      get: () => {
        throw new Error('boom');
      },
    });
    const store = createStore();
    expect(() => store.get(bad)).toThrow('boom');
    const badAsync = selector({ key: 'sel/err/async', get: async () => Promise.reject(new Error('later')) });
    await expect(store.get(badAsync)).rejects.toThrow('later');
    const downstream = selector({ key: 'sel/err/down', get: ({ get }) => get(badAsync) });
    await expect(store.get(downstream)).rejects.toThrow('later');
  });

  it('can return other Recoil values, Loadables and wrapped values', async () => {
    const a = atom({ key: 'sel/ret/a', default: 'A' });
    const b = atom({ key: 'sel/ret/b', default: 'B' });
    const which = atom({ key: 'sel/ret/which', default: true });
    const pick = selector({ key: 'sel/ret/pick', get: ({ get }) => (get(which) ? a : b) });
    const store = createStore();
    expect(store.get(pick)).toBe('A');
    store.set(which, false);
    expect(store.get(pick)).toBe('B');

    const fromLoadable = selector({ key: 'sel/ret/loadable', get: () => RecoilLoadable.of(Promise.resolve(5)) });
    expect(await store.get(fromLoadable)).toBe(5);

    const fn = () => 1;
    const wrapped = selector({ key: 'sel/ret/wrapped', get: () => selector.value(fn) });
    expect(store.get(wrapped)).toBe(fn);
  });

  it('refreshes: clears the cache and re-evaluates', async () => {
    let n = 0;
    const s = selector({ key: 'sel/refresh', get: () => ++n });
    const store = createStore() as any;
    expect(store.get(s)).toBe(1);
    expect(store.get(s)).toBe(1);
    refreshInStore(store, s as any);
    expect(store.get(s)).toBe(2);
  });

  it('getCallback creates callbacks bound to the store', () => {
    const a = atom({ key: 'sel/cb/a', default: 0 });
    const s = selector({
      key: 'sel/cb/s',
      get: ({ getCallback }) => ({
        inc: getCallback(({ set, snapshot }) => () => {
          set(a, (v) => v + 1);
          return snapshot.getLoadable(a).getValue();
        }),
      }),
    });
    const store = createStore();
    const { inc } = store.get(s) as { inc: () => number };
    expect(inc()).toBe(0);
    expect(store.get(a)).toBe(1);
  });
});

describe('selectorFamily / constSelector / errorSelector', () => {
  it('creates parameterised selectors', () => {
    const items = atom({ key: 'sf/items', default: { a: 1, b: 2 } as Record<string, number> });
    const item = selectorFamily<number, string>({
      key: 'sf/item',
      get:
        (id) =>
        ({ get }) =>
          get(items)[id],
      set:
        (id) =>
        ({ set }, v) =>
          set(items, (prev) => ({ ...prev, [id]: v as number })),
    });
    const store = createStore();
    expect(item('a')).toBe(item('a'));
    expect(store.get(item('b'))).toBe(2);
    store.set(item('b'), 20);
    expect(store.get(items)).toEqual({ a: 1, b: 20 });
  });

  it('constSelector and errorSelector', () => {
    const store = createStore();
    expect(store.get(constSelector(5))).toBe(5);
    expect(constSelector(5)).toBe(constSelector(5));
    expect(() => store.get(errorSelector('nope'))).toThrow('nope');
  });
});
