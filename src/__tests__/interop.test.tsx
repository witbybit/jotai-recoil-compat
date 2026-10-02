import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAtom, useAtomValue, Provider } from 'jotai/react';
import { atom as jotaiAtom, createStore } from 'jotai/vanilla';
import { atomWithReset } from 'jotai/vanilla/utils';
import type { ReactNode } from 'react';
import { RecoilRoot, atom, selector, useRecoilValue, useRecoilState, useResetRecoilState } from '../index';

describe('Jotai interop (gradual migration)', () => {
  it('Recoil atoms work with Jotai hooks inside a RecoilRoot', () => {
    const count = atom({ key: 'io/count', default: 1 });
    const double = selector({ key: 'io/double', get: ({ get }) => get(count) * 2 });
    const { result } = renderHook(
      () => ({ jotai: useAtom(count), recoil: useRecoilValue(double), jotaiDerived: useAtomValue(double) }),
      { wrapper: ({ children }: { children: ReactNode }) => <RecoilRoot>{children}</RecoilRoot> },
    );
    act(() => result.current.jotai[1](5));
    expect(result.current.recoil).toBe(10);
    expect(result.current.jotaiDerived).toBe(10);
  });

  it('selectors can read plain Jotai atoms and Recoil hooks accept them', () => {
    const native = jotaiAtom(3);
    const resettable = atomWithReset('initial');
    const sel = selector({ key: 'io/sel', get: ({ get }) => get(native) + 1 });
    const store = createStore();
    const { result } = renderHook(
      () => ({
        sel: useRecoilValue(sel),
        native: useRecoilState(native as any),
        r: useRecoilState(resettable as any),
        reset: useResetRecoilState(resettable as any),
      }),
      { wrapper: ({ children }: { children: ReactNode }) => <RecoilRoot store={store}>{children}</RecoilRoot> },
    );
    expect(result.current.sel).toBe(4);
    act(() => (result.current.native[1] as any)(10));
    expect(result.current.sel).toBe(11);
    act(() => (result.current.r[1] as any)('changed'));
    act(() => result.current.reset());
    expect(result.current.r[0]).toBe('initial');
    // the store is shared with Jotai
    expect(store.get(native)).toBe(10);
  });

  it('a RecoilRoot can share a store with a Jotai Provider', () => {
    const a = atom({ key: 'io/shared', default: 'x' });
    const store = createStore();
    store.set(a, 'from-jotai');
    const { result } = renderHook(() => useRecoilValue(a), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>
          <RecoilRoot store={store}>{children}</RecoilRoot>
        </Provider>
      ),
    });
    expect(result.current).toBe('from-jotai');
  });
});
