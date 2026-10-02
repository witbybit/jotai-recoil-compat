import { describe, it, expect, vi } from 'vitest';
import { createStore } from 'jotai/vanilla';
import { atom, atomFamily, selector, DefaultValue, RecoilLoadable, RecoilEnv, isRecoilValue } from '../index';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('atom', () => {
  it('exposes key and is a Recoil value / Jotai atom', () => {
    const a = atom({ key: 'atom/key', default: 1 });
    expect(a.key).toBe('atom/key');
    expect(isRecoilValue(a)).toBe(true);
    expect(isRecoilValue({ key: 'x' })).toBe(false);
    expect(typeof a.read).toBe('function');
    expect(JSON.stringify({ a })).toBe('{"a":{"key":"atom/key"}}');
  });

  it('reads default, sets, uses updater and resets', () => {
    const a = atom({ key: 'atom/basic', default: 1 });
    const store = createStore();
    expect(store.get(a)).toBe(1);
    store.set(a, 2);
    expect(store.get(a)).toBe(2);
    store.set(a, (v) => v + 10);
    expect(store.get(a)).toBe(12);
    store.set(a, new DefaultValue());
    expect(store.get(a)).toBe(1);
  });

  it('keeps state per store', () => {
    const a = atom({ key: 'atom/perStore', default: 'x' });
    const s1 = createStore();
    const s2 = createStore();
    s1.set(a, 'y');
    expect(s1.get(a)).toBe('y');
    expect(s2.get(a)).toBe('x');
  });

  it('supports a selector as default and follows it until set', () => {
    const base = atom({ key: 'atom/selDefault/base', default: 1 });
    const def = selector({ key: 'atom/selDefault/sel', get: ({ get }) => get(base) * 100 });
    const a = atom({ key: 'atom/selDefault', default: def });
    const store = createStore();
    expect(store.get(a)).toBe(100);
    store.set(base, 2);
    expect(store.get(a)).toBe(200);
    store.set(a, 5);
    store.set(base, 3);
    expect(store.get(a)).toBe(5);
    store.set(a, new DefaultValue());
    expect(store.get(a)).toBe(300);
  });

  it('supports promise and Loadable defaults', async () => {
    const a = atom({ key: 'atom/promiseDefault', default: Promise.resolve(42) });
    const store = createStore();
    await expect(store.get(a)).resolves.toBe(42);
    const b = atom({ key: 'atom/loadableDefault', default: RecoilLoadable.of(7) });
    expect(store.get(b)).toBe(7);
  });

  it('can store functions with atom.value()', () => {
    const fn = () => 'hi';
    const a = atom<() => string>({ key: 'atom/fnValue', default: atom.value(fn) });
    const store = createStore();
    expect(store.get(a)).toBe(fn);
  });

  it('throws when using an updater on a pending atom', () => {
    const a = atom<number>({ key: 'atom/pendingUpdater', default: new Promise(() => {}) });
    const store = createStore();
    expect(() => store.set(a, (v) => v + 1)).toThrow(/pending/);
  });

  it('warns on duplicate keys only when enabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    atom({ key: 'atom/dup', default: 1 });
    atom({ key: 'atom/dup', default: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED = false;
    atom({ key: 'atom/dup', default: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED = true;
    warn.mockRestore();
  });
});

describe('atomFamily', () => {
  it('returns the same atom for equal params and uses Recoil key format', () => {
    const fam = atomFamily<number, { id: number; tag: string }>({ key: 'fam', default: 0 });
    const a1 = fam({ id: 1, tag: 'a' });
    const a2 = fam({ tag: 'a', id: 1 });
    expect(a1).toBe(a2);
    expect(a1.key).toBe('fam__{"id":1,"tag":"a"}');
    expect(fam({ id: 2, tag: 'a' })).not.toBe(a1);
  });

  it('supports a per-param default function and per-param effects', () => {
    const effect = vi.fn();
    const fam = atomFamily<string, number>({
      key: 'fam/defaultFn',
      default: (id) => `item-${id}`,
      effects: (id) => [() => effect(id)],
    });
    const store = createStore();
    expect(store.get(fam(3))).toBe('item-3');
    expect(effect).toHaveBeenCalledWith(3);
  });

  it('supports selectorFamily-style RecoilValue defaults', () => {
    const base = atom({ key: 'fam/base', default: 10 });
    const fam = atomFamily<number, number>({
      key: 'fam/selDefault',
      default: (n) => selector({ key: `fam/selDefault/sel/${n}`, get: ({ get }) => get(base) + n }),
    });
    const store = createStore();
    expect(store.get(fam(1))).toBe(11);
  });

  it('settles async defaults', async () => {
    const fam = atomFamily<number, number>({ key: 'fam/async', default: async (n) => n * 2 });
    const store = createStore();
    expect(await store.get(fam(4))).toBe(8);
    await flush();
  });
});
