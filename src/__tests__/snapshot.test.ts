import { describe, it, expect } from 'vitest';
import { createStore } from 'jotai/vanilla';
import { atom, selector, snapshot_UNSTABLE, Snapshot } from '../index';
import { gotoSnapshotInStore } from '../Snapshot';

describe('Snapshot', () => {
  it('snapshot_UNSTABLE initialises and evaluates selectors', async () => {
    const a = atom({ key: 'snap/a', default: 1 });
    const double = selector({ key: 'snap/double', get: ({ get }) => get(a) * 2 });
    const asyncSel = selector({ key: 'snap/async', get: async ({ get }) => get(a) + 100 });
    const snap = snapshot_UNSTABLE(({ set }) => set(a, 5));
    expect(snap.getLoadable(double).getValue()).toBe(10);
    expect(await snap.getPromise(asyncSel)).toBe(105);
    expect(snap.getLoadable(a).valueMaybe()).toBe(5);
    expect(typeof snap.getID()).toBe('number');
  });

  it('is immutable (copy-on-write) with respect to its source store', () => {
    const a = atom({ key: 'snap/cow/a', default: 'a0' });
    const b = atom({ key: 'snap/cow/b', default: 'b0' });
    const store = createStore() as any;
    store.set(a, 'a1');
    const snap = new Snapshot(store);
    store.set(a, 'a2');
    store.set(b, 'b1');
    expect(snap.getLoadable(a).getValue()).toBe('a1');
    expect(snap.getLoadable(b).getValue()).toBe('b0');
    expect(store.get(a)).toBe('a2');
  });

  it('map() derives a new snapshot without touching the original', () => {
    const a = atom({ key: 'snap/map/a', default: 0 });
    const s1 = snapshot_UNSTABLE();
    const s2 = s1.map(({ set }) => set(a, 9));
    expect(s1.getLoadable(a).getValue()).toBe(0);
    expect(s2.getLoadable(a).getValue()).toBe(9);
    expect(Array.from(s2.getNodes_UNSTABLE({ isModified: true }))).toEqual([a]);
  });

  it('gotoSnapshot restores values, including resets', () => {
    const a = atom({ key: 'snap/goto/a', default: 0 });
    const b = atom({ key: 'snap/goto/b', default: 0 });
    const store = createStore() as any;
    store.set(a, 1);
    const snap = new Snapshot(store);
    store.set(a, 2);
    store.set(b, 3);
    gotoSnapshotInStore(store, snap);
    expect(store.get(a)).toBe(1);
    expect(store.get(b)).toBe(0);
  });

  it('getInfo_UNSTABLE reports isSet and type', () => {
    const a = atom({ key: 'snap/info', default: 0 });
    const snap = snapshot_UNSTABLE(({ set }) => set(a, 1));
    const info = snap.getInfo_UNSTABLE(a);
    expect(info.isSet).toBe(true);
    expect(info.type).toBe('atom');
    expect(info.loadable?.contents).toBe(1);
  });
});
