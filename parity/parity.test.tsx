/**
 * Behavioural parity suite. Every test here runs twice: once against
 * jotai-recoil-compat and once against the real `recoil` package.
 * Only the public Recoil API is used.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import {
  RecoilEnv,
  RecoilRoot,
  DefaultValue,
  atom,
  atomFamily,
  selector,
  selectorFamily,
  noWait,
  waitForAll,
  snapshot_UNSTABLE,
  useRecoilCallback,
  useRecoilRefresher_UNSTABLE,
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useRecoilValueLoadable,
  useResetRecoilState,
  useSetRecoilState,
} from 'recoil-under-test';

RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED = false;

let n = 0;
const k = (name: string) => `parity/${name}/${n++}`;
const wrapper = ({ children }: { children: ReactNode }) => (
  <RecoilRoot>
    <Suspense fallback={null}>{children}</Suspense>
  </RecoilRoot>
);
const tick = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe('parity', () => {
  it('atoms: default, set, updater, reset', () => {
    const a = atom({ key: k('a'), default: 1 });
    const { result } = renderHook(() => [useRecoilState(a), useResetRecoilState(a)] as const, { wrapper });
    act(() => result.current[0][1](5));
    expect(result.current[0][0]).toBe(5);
    act(() => result.current[0][1]((v) => v * 2));
    expect(result.current[0][0]).toBe(10);
    act(() => result.current[1]());
    expect(result.current[0][0]).toBe(1);
  });

  it('atom with a selector default follows it until set', () => {
    const base = atom({ key: k('base'), default: 1 });
    const a = atom({ key: k('a'), default: selector({ key: k('d'), get: ({ get }) => get(base) + 1 }) });
    const { result } = renderHook(
      () => ({ a: useRecoilState(a), setBase: useSetRecoilState(base), reset: useResetRecoilState(a) }),
      { wrapper },
    );
    expect(result.current.a[0]).toBe(2);
    act(() => result.current.setBase(10));
    expect(result.current.a[0]).toBe(11);
    act(() => result.current.a[1](0));
    act(() => result.current.setBase(20));
    expect(result.current.a[0]).toBe(0);
    act(() => result.current.reset());
    expect(result.current.a[0]).toBe(21);
  });

  it('writable selectors receive DefaultValue on reset', () => {
    const a = atom({ key: k('a'), default: 'init' });
    const seen: unknown[] = [];
    const s = selector<string>({
      key: k('s'),
      get: ({ get }) => get(a).toUpperCase(),
      set: ({ set }, v) => {
        seen.push(v instanceof DefaultValue ? 'DEFAULT' : v);
        set(a, v);
      },
    });
    const { result } = renderHook(() => ({ s: useRecoilState(s), reset: useResetRecoilState(s) }), { wrapper });
    expect(result.current.s[0]).toBe('INIT');
    act(() => result.current.s[1]('next'));
    expect(result.current.s[0]).toBe('NEXT');
    act(() => result.current.reset());
    expect(result.current.s[0]).toBe('INIT');
    expect(seen).toEqual(['next', 'DEFAULT']);
  });

  it('selectors cache by dependency values', () => {
    const a = atom({ key: k('a'), default: 1 });
    const spy = vi.fn((x: number) => x * 10);
    const s = selector({ key: k('s'), get: ({ get }) => spy(get(a)) });
    const { result } = renderHook(() => ({ v: useRecoilValue(s), set: useSetRecoilState(a) }), { wrapper });
    act(() => result.current.set(2));
    act(() => result.current.set(1));
    act(() => result.current.set(2));
    expect(result.current.v).toBe(20);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('async selectors suspend and downstream selectors see resolved values', async () => {
    const user = selector({ key: k('user'), get: async () => ({ name: 'Ada' }) });
    const greeting = selector({ key: k('greet'), get: ({ get }) => `Hello ${get(user).name}` });
    function Show() {
      return <div>{useRecoilValue(greeting)}</div>;
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
    expect(await screen.findByText('Hello Ada')).toBeTruthy();
  });

  it('useRecoilValueLoadable: loading -> hasValue / hasError', async () => {
    const ok = selector({ key: k('ok'), get: async () => 7 });
    const bad = selector({
      key: k('bad'),
      get: async () => {
        throw new Error('nope');
      },
    });
    const { result } = renderHook(() => [useRecoilValueLoadable(ok), useRecoilValueLoadable(bad)] as const, {
      wrapper,
    });
    expect(result.current[0].state).toBe('loading');
    await waitFor(() => expect(result.current[0].state).toBe('hasValue'));
    await waitFor(() => expect(result.current[1].state).toBe('hasError'));
    expect(result.current[0].contents).toBe(7);
    expect((result.current[1].contents as Error).message).toBe('nope');
  });

  it('families: identity by value and Recoil key format', () => {
    const base = k('fam');
    const fam = atomFamily<number, { id: number }>({ key: base, default: (p) => p.id * 2 });
    expect(fam({ id: 1 })).toBe(fam({ id: 1 }));
    expect(fam({ id: 1 }).key).toBe(`${base}__{"id":1}`);
    const sf = selectorFamily<number, number>({
      key: k('sf'),
      get:
        (m) =>
        ({ get }) =>
          get(fam({ id: 3 })) * m,
    });
    const { result } = renderHook(() => useRecoilValue(sf(10)), { wrapper });
    expect(result.current).toBe(60);
  });

  it('atom effects: setSelf init, onSet (not for own setSelf), trigger', () => {
    const log: string[] = [];
    let externalSet!: (v: string) => void;
    const a = atom({
      key: k('fx'),
      default: 'default',
      effects: [
        ({ setSelf, onSet, trigger }) => {
          log.push(`init:${trigger}`);
          setSelf('from-effect');
          externalSet = (v) => setSelf(v);
          onSet((nv, ov) => log.push(`own:${ov}->${nv}`));
        },
        ({ onSet }) => onSet((nv, ov, isReset) => log.push(`other:${ov}->${nv}${isReset ? ':reset' : ''}`)),
      ],
    });
    const { result } = renderHook(() => ({ a: useRecoilState(a), reset: useResetRecoilState(a) }), { wrapper });
    expect(result.current.a[0]).toBe('from-effect');
    act(() => result.current.a[1]('user'));
    act(() => externalSet('external'));
    act(() => result.current.reset());
    expect(result.current.a[0]).toBe('default');
    expect(log).toEqual([
      'init:get',
      'own:from-effect->user',
      'other:from-effect->user',
      'other:user->external',
      'own:external->default',
      'other:external->default:reset',
    ]);
  });

  it('useRecoilCallback snapshot reflects state at call time', async () => {
    const a = atom({ key: k('a'), default: 1 });
    const { result } = renderHook(
      () => ({
        v: useRecoilValue(a),
        cb: useRecoilCallback(
          ({ snapshot, set }) =>
            async () => {
              set(a, 2);
              return snapshot.getPromise(a);
            },
          [],
        ),
      }),
      { wrapper },
    );
    let seen: number | undefined;
    await act(async () => {
      seen = await result.current.cb();
    });
    expect(seen).toBe(1);
    expect(result.current.v).toBe(2);
  });

  it('initializeState and override={false}', () => {
    const a = atom({ key: k('a'), default: 0 });
    function Show({ id }: { id: string }) {
      const [v, set] = useRecoilState(a);
      return (
        <button data-testid={id} onClick={() => set(v + 1)}>
          {v}
        </button>
      );
    }
    render(
      <RecoilRoot initializeState={({ set }) => set(a, 10)}>
        <Show id="outer" />
        <RecoilRoot override={false}>
          <Show id="inner" />
        </RecoilRoot>
      </RecoilRoot>,
    );
    expect(screen.getByTestId('outer').textContent).toBe('10');
    act(() => screen.getByTestId('inner').click());
    expect(screen.getByTestId('outer').textContent).toBe('11');
  });

  it('waitForAll and noWait', async () => {
    const a = selector({ key: k('a'), get: async () => 1 });
    const b = selector({ key: k('b'), get: async () => 2 });
    const { result } = renderHook(
      () => ({ nw: useRecoilValue(noWait(a)), all: useRecoilValueLoadable(waitForAll({ a, b })) }),
      { wrapper },
    );
    expect(result.current.nw.state).toBe('loading');
    await waitFor(() => expect(result.current.all.state).toBe('hasValue'));
    expect(result.current.all.contents).toEqual({ a: 1, b: 2 });
    await waitFor(() => expect(result.current.nw.state).toBe('hasValue'));
  });

  it('refresher re-runs a selector; transactions read their own writes', async () => {
    let calls = 0;
    const s = selector({ key: k('s'), get: () => ++calls });
    const x = atom({ key: k('x'), default: 1 });
    const y = atom({ key: k('y'), default: 0 });
    const { result } = renderHook(
      () => ({
        s: useRecoilValue(s),
        refresh: useRecoilRefresher_UNSTABLE(s),
        y: useRecoilValue(y),
        tx: useRecoilTransaction_UNSTABLE(({ get, set }) => () => {
          set(x, get(x) + 1);
          set(y, get(x) * 100);
        }),
      }),
      { wrapper },
    );
    expect(result.current.s).toBe(1);
    act(() => result.current.refresh());
    expect(result.current.s).toBe(2);
    act(() => result.current.tx());
    await tick();
    expect(result.current.y).toBe(200);
  });

  it('selector returning another Recoil value', () => {
    const a = atom({ key: k('a'), default: 'A' });
    const b = atom({ key: k('b'), default: 'B' });
    const flag = atom({ key: k('flag'), default: true });
    const pick = selector({ key: k('pick'), get: ({ get }) => (get(flag) ? a : b) });
    const { result } = renderHook(() => ({ v: useRecoilValue(pick), set: useSetRecoilState(flag) }), { wrapper });
    expect(result.current.v).toBe('A');
    act(() => result.current.set(false));
    expect(result.current.v).toBe('B');
  });

  it('snapshot_UNSTABLE + map + getLoadable', () => {
    const a = atom({ key: k('a'), default: 1 });
    const double = selector({ key: k('d'), get: ({ get }) => get(a) * 2 });
    const s1 = snapshot_UNSTABLE(({ set }) => set(a, 2));
    const release1 = s1.retain();
    const s2 = s1.map(({ set }) => set(a, (v) => v + 1));
    const release2 = s2.retain();
    expect(s1.getLoadable(double).getValue()).toBe(4);
    expect(s2.getLoadable(double).getValue()).toBe(6);
    release1();
    release2();
  });
});
