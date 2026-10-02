/** Finer-grained semantics, run against both implementations. */
import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import {
  RecoilEnv,
  RecoilRoot,
  atom,
  selector,
  useRecoilCallback,
  useRecoilRefresher_UNSTABLE,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
  useResetRecoilState,
  useSetRecoilState,
} from 'recoil-under-test';

RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED = false;
let n = 0;
const k = (name: string) => `edge/${name}/${n++}`;
const wrapper = ({ children }: { children: ReactNode }) => (
  <RecoilRoot>
    <Suspense fallback={null}>{children}</Suspense>
  </RecoilRoot>
);

describe('edge semantics', () => {
  it('atom effect setSelf takes precedence over initializeState', () => {
    const a = atom({ key: k('a'), default: 'default', effects: [({ setSelf }) => setSelf('effect')] });
    const { result } = renderHook(() => useRecoilValue(a), {
      wrapper: ({ children }) => <RecoilRoot initializeState={({ set }) => set(a, 'init')}>{children}</RecoilRoot>,
    });
    expect(result.current).toBe('effect');
  });

  it('initializeState value is visible to effects that do not set', () => {
    const seen: string[] = [];
    const a = atom({
      key: k('a'),
      default: 'default',
      effects: [({ onSet }) => onSet((v) => seen.push(v))],
    });
    const { result } = renderHook(() => useRecoilState(a), {
      wrapper: ({ children }) => <RecoilRoot initializeState={({ set }) => set(a, 'init')}>{children}</RecoilRoot>,
    });
    expect(result.current[0]).toBe('init');
    act(() => result.current[1]('x'));
    expect(seen).toEqual(['x']);
  });

  it('onSet: called for explicit sets (even of the default), skipped for no-op changes', () => {
    const log: string[] = [];
    const a = atom({
      key: k('a'),
      default: 1,
      effects: [(p) => p.onSet((nv, ov, isReset) => log.push(`${String(ov)}->${nv}${isReset ? ' reset' : ''}`))],
    });
    const { result } = renderHook(() => ({ a: useRecoilState(a), reset: useResetRecoilState(a) }), { wrapper });
    act(() => result.current.a[1](1));
    act(() => result.current.a[1](2));
    act(() => result.current.a[1](2));
    act(() => result.current.reset());
    act(() => result.current.reset());
    expect(log).toEqual(['1->1', '1->2', '2->1 reset']);
  });

  it('effect cleanup runs when the RecoilRoot unmounts', async () => {
    const cleanup = vi.fn();
    const a = atom({ key: k('a'), default: 0, effects: [() => cleanup] });
    function Show() {
      return <div>{useRecoilValue(a)}</div>;
    }
    const { unmount } = render(
      <RecoilRoot>
        <Show />
      </RecoilRoot>,
    );
    unmount();
    await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
  });

  it('refresher retries a failed async selector', async () => {
    let attempt = 0;
    const flaky = selector({
      key: k('flaky'),
      get: async () => {
        attempt++;
        if (attempt === 1) throw new Error('first');
        return 'ok';
      },
    });
    const { result } = renderHook(
      () => ({ l: useRecoilValueLoadable(flaky), refresh: useRecoilRefresher_UNSTABLE(flaky) }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.l.state).toBe('hasError'));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.l.state).toBe('hasValue'));
    expect(result.current.l.contents).toBe('ok');
  });

  it('atom without default is pending until set', async () => {
    const a = atom<string>({ key: k('nodefault') });
    const { result } = renderHook(() => ({ l: useRecoilValueLoadable(a), set: useSetRecoilState(a) }), {
      wrapper,
    });
    expect(result.current.l.state).toBe('loading');
    act(() => result.current.set('now'));
    await waitFor(() => expect(result.current.l.state).toBe('hasValue'));
    expect(result.current.l.contents).toBe('now');
  });

  it('selectors depending on an async atom default resolve', async () => {
    const a = atom({ key: k('asyncDefault'), default: Promise.resolve(2) });
    const s = selector({ key: k('s'), get: ({ get }) => get(a) * 3 });
    function Show() {
      return <div>{`v=${useRecoilValue(s)}`}</div>;
    }
    await act(async () => {
      render(
        <RecoilRoot>
          <Suspense fallback={<div>loading</div>}>
            <Show />
          </Suspense>
        </RecoilRoot>,
      );
    });
    expect(await screen.findByText('v=6')).toBeTruthy();
  });

  it('selector setter get/updaters read the state from before the setter ran', () => {
    const a = atom({ key: k('a'), default: 0 });
    const b = atom({ key: k('b'), default: 0 });
    const c = atom({ key: k('c'), default: 0 });
    const s = selector<number>({
      key: k('s'),
      get: ({ get }) => get(a),
      set: ({ get, set }, v) => {
        set(a, v as number);
        set(b, get(a) + 1);
        set(c, 1);
        set(c, (prev) => prev + 10);
      },
    });
    const { result } = renderHook(
      () => ({ s: useRecoilState(s), b: useRecoilValue(b), c: useRecoilValue(c) }),
      { wrapper },
    );
    act(() => result.current.s[1](5));
    expect(result.current.s[0]).toBe(5);
    expect(result.current.b).toBe(1);
    expect(result.current.c).toBe(10);
  });

  it('snapshot.getLoadable of a selector reflects state at callback time', () => {
    const a = atom({ key: k('a'), default: 1 });
    const double = selector({ key: k('d'), get: ({ get }) => get(a) * 2 });
    const { result } = renderHook(
      () =>
        useRecoilCallback(({ snapshot, set }) => () => {
          set(a, 10);
          return snapshot.getLoadable(double).getValue();
        }),
      { wrapper },
    );
    let v = 0;
    act(() => {
      v = result.current();
    });
    expect(v).toBe(2);
  });
});
