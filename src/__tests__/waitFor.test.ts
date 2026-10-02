import { describe, it, expect } from 'vitest';
import { createStore } from 'jotai/vanilla';
import { atom, selector, noWait, waitForAll, waitForAny, waitForNone, waitForAllSettled, RecoilLoadable } from '../index';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('concurrency helpers', () => {
  it('waitForAll resolves arrays and objects in parallel', async () => {
    const a = selector({ key: 'wf/all/a', get: async () => 1 });
    const b = selector({ key: 'wf/all/b', get: async () => 'two' });
    const c = atom({ key: 'wf/all/c', default: true });
    const store = createStore();
    expect(await store.get(waitForAll([a, b, c]))).toEqual([1, 'two', true]);
    await flush();
    expect(store.get(waitForAll({ a, b }))).toEqual({ a: 1, b: 'two' });
    expect(waitForAll([a, b])).toBe(waitForAll([a, b]));
  });

  it('waitForAll rejects when a dependency errors', async () => {
    const bad = selector({ key: 'wf/all/bad', get: async () => Promise.reject(new Error('x')) });
    const ok = selector({ key: 'wf/all/ok', get: () => 1 });
    await expect(createStore().get(waitForAll([ok, bad]))).rejects.toThrow('x');
  });

  it('noWait returns a loading Loadable, then the value', async () => {
    const d = deferred<number>();
    const slow = selector({ key: 'wf/noWait/slow', get: () => d.promise });
    const store = createStore();
    const nw = noWait(slow) as any;
    store.sub(nw, () => {});
    expect((store.get(nw) as any).state).toBe('loading');
    d.resolve(3);
    await flush();
    expect((store.get(nw) as any).state).toBe('hasValue');
    expect((store.get(nw) as any).contents).toBe(3);
  });

  it('waitForNone / waitForAny / waitForAllSettled', async () => {
    const d1 = deferred<number>();
    const d2 = deferred<number>();
    const s1 = selector({ key: 'wf/mix/1', get: () => d1.promise });
    const s2 = selector({ key: 'wf/mix/2', get: () => d2.promise });
    const store = createStore();
    const none = waitForNone([s1, s2]) as any;
    store.sub(none, () => {});
    expect((store.get(none) as any).map((l: any) => l.state)).toEqual(['loading', 'loading']);

    const anyP = store.get(waitForAny([s1, s2])) as unknown as Promise<any>;
    expect(anyP).toBeInstanceOf(Promise);
    d1.resolve(1);
    const anyResult = await anyP;
    expect(anyResult[0].contents).toBe(1);
    expect(anyResult[1].state).toBe('loading');

    const settledP = store.get(waitForAllSettled([s1, s2])) as unknown as Promise<any>;
    d2.reject(new Error('fail'));
    const settled = await settledP;
    expect(settled.map((l: any) => l.state)).toEqual(['hasValue', 'hasError']);
    await flush();
    expect((store.get(none) as any).map((l: any) => l.state)).toEqual(['hasValue', 'hasError']);
  });

  it('RecoilLoadable helpers', async () => {
    expect(RecoilLoadable.of(1).getValue()).toBe(1);
    expect(RecoilLoadable.error('e').errorMaybe()).toBe('e');
    expect(RecoilLoadable.loading().state).toBe('loading');
    expect(RecoilLoadable.all([RecoilLoadable.of(1), 2]).contents).toEqual([1, 2]);
    expect(await RecoilLoadable.all({ a: Promise.resolve(1) }).toPromise()).toEqual({ a: 1 });
    expect(RecoilLoadable.of(2).map((v) => v * 2).contents).toBe(4);
    expect(RecoilLoadable.isLoadable(RecoilLoadable.of(1))).toBe(true);
  });
});
