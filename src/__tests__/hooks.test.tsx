import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Component, StrictMode, Suspense, type ReactNode } from 'react';
import {
  RecoilRoot,
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useResetRecoilState,
  useRecoilValueLoadable,
  useRecoilStateLoadable,
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useRecoilRefresher_UNSTABLE,
  useRecoilSnapshot,
  useGotoRecoilSnapshot,
  useRecoilTransactionObserver_UNSTABLE,
  useRecoilStoreID,
  type Snapshot,
} from '../index';

const wrapper = ({ children }: { children: ReactNode }) => <RecoilRoot>{children}</RecoilRoot>;

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <div>error: {this.state.error.message}</div> : this.props.children;
  }
}

describe('basic hooks', () => {
  it('useRecoilState / useRecoilValue / useSetRecoilState / useResetRecoilState', () => {
    const count = atom({ key: 'h/count', default: 0 });
    const double = selector({ key: 'h/double', get: ({ get }) => get(count) * 2 });
    const { result } = renderHook(
      () => ({
        state: useRecoilState(count),
        double: useRecoilValue(double),
        set: useSetRecoilState(count),
        reset: useResetRecoilState(count),
      }),
      { wrapper },
    );
    expect(result.current.state[0]).toBe(0);
    act(() => result.current.state[1](2));
    expect(result.current.double).toBe(4);
    act(() => result.current.set((c) => c + 1));
    expect(result.current.state[0]).toBe(3);
    act(() => result.current.reset());
    expect(result.current.state[0]).toBe(0);
  });

  it('setter identity is stable across renders', () => {
    const a = atom({ key: 'h/stable', default: 0 });
    const { result, rerender } = renderHook(() => useRecoilState(a), { wrapper });
    const first = result.current[1];
    act(() => first(1));
    rerender();
    expect(result.current[1]).toBe(first);
  });

  it('isolates state between RecoilRoots', () => {
    const a = atom({ key: 'h/isolated', default: 'x' });
    function Show({ id }: { id: string }) {
      const [v, set] = useRecoilState(a);
      return (
        <button data-testid={id} onClick={() => set('y')}>
          {v}
        </button>
      );
    }
    render(
      <>
        <RecoilRoot>
          <Show id="one" />
        </RecoilRoot>
        <RecoilRoot>
          <Show id="two" />
        </RecoilRoot>
      </>,
    );
    act(() => screen.getByTestId('one').click());
    expect(screen.getByTestId('one').textContent).toBe('y');
    expect(screen.getByTestId('two').textContent).toBe('x');
  });

  it('suspends on async selectors and renders the value', async () => {
    const q = selector({ key: 'h/async', get: async () => 'loaded' });
    function Show() {
      return <div>{useRecoilValue(q)}</div>;
    }
    render(
      <RecoilRoot>
        <Suspense fallback={<div>loading</div>}>
          <Show />
        </Suspense>
      </RecoilRoot>,
    );
    expect(await screen.findByText('loaded')).toBeTruthy();
  });

  it('throws selector errors to error boundaries', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = selector({
      key: 'h/bad',
      get: () => {
        throw new Error('kaput');
      },
    });
    function Show() {
      return <div>{useRecoilValue(bad)}</div>;
    }
    render(
      <RecoilRoot>
        <ErrorBoundary>
          <Show />
        </ErrorBoundary>
      </RecoilRoot>,
    );
    expect(await screen.findByText('error: kaput')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('loadable hooks', () => {
  it('useRecoilValueLoadable goes loading -> hasValue', async () => {
    let resolve!: (v: number) => void;
    const q = selector({ key: 'h/loadable', get: () => new Promise<number>((r) => (resolve = r)) });
    const { result } = renderHook(() => useRecoilValueLoadable(q), { wrapper });
    expect(result.current.state).toBe('loading');
    await act(async () => resolve(9));
    await waitFor(() => expect(result.current.state).toBe('hasValue'));
    expect(result.current.contents).toBe(9);
    expect(result.current.valueMaybe()).toBe(9);
  });

  it('useRecoilValueLoadable reports errors and is referentially stable', async () => {
    const bad = selector({ key: 'h/loadableErr', get: async () => Promise.reject(new Error('no')) });
    const { result, rerender } = renderHook(() => useRecoilValueLoadable(bad), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('hasError'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.errorMaybe().message).toBe('no');
  });

  it('useRecoilStateLoadable returns a working setter', () => {
    const a = atom({ key: 'h/stateLoadable', default: 1 });
    const { result } = renderHook(() => useRecoilStateLoadable(a), { wrapper });
    expect(result.current[0].contents).toBe(1);
    act(() => result.current[1](5));
    expect(result.current[0].contents).toBe(5);
  });
});

describe('useRecoilCallback', () => {
  it('reads a snapshot taken before its own writes and can set/reset', async () => {
    const a = atom({ key: 'h/cb/a', default: 1 });
    const { result } = renderHook(
      () => ({
        value: useRecoilValue(a),
        cb: useRecoilCallback(
          ({ snapshot, set }) =>
            async (by: number) => {
              set(a, (v) => v + by);
              return snapshot.getPromise(a);
            },
          [],
        ),
        resetCb: useRecoilCallback(({ reset }) => () => reset(a), []),
      }),
      { wrapper },
    );
    let before: number | undefined;
    await act(async () => {
      before = await result.current.cb(10);
    });
    expect(before).toBe(1);
    expect(result.current.value).toBe(11);
    act(() => result.current.resetCb());
    expect(result.current.value).toBe(1);
  });

  it('snapshot is pinned even when accessed after the write', () => {
    const a = atom({ key: 'h/cb/pin', default: 'old' });
    const { result } = renderHook(
      () =>
        useRecoilCallback((cbi) => () => {
          cbi.set(a, 'new');
          return cbi.snapshot.getLoadable(a).getValue();
        }),
      { wrapper },
    );
    let seen = '';
    act(() => {
      seen = result.current();
    });
    expect(seen).toBe('old');
  });

  it('transactions, refreshers and gotoSnapshot', async () => {
    const a = atom({ key: 'h/tx/a', default: 1 });
    const b = atom({ key: 'h/tx/b', default: 1 });
    let n = 0;
    const counter = selector({ key: 'h/tx/counter', get: () => ++n });
    const { result } = renderHook(
      () => ({
        a: useRecoilValue(a),
        b: useRecoilValue(b),
        counter: useRecoilValue(counter),
        swap: useRecoilTransaction_UNSTABLE(({ get, set }) => () => {
          set(a, get(a) + 1);
          set(b, get(a) * 10);
        }),
        refresh: useRecoilRefresher_UNSTABLE(counter),
        snapshot: useRecoilSnapshot(),
        goto: useGotoRecoilSnapshot(),
      }),
      { wrapper },
    );
    const initial = result.current.snapshot;
    await act(async () => result.current.swap());
    expect(result.current.a).toBe(2);
    expect(result.current.b).toBe(20);
    expect(result.current.counter).toBe(1);
    await act(async () => result.current.refresh());
    expect(result.current.counter).toBe(2);
    await act(async () => result.current.goto(initial));
    expect(result.current.a).toBe(1);
    expect(result.current.b).toBe(1);
  });

  it('useRecoilSnapshot updates and useRecoilTransactionObserver_UNSTABLE reports changes', async () => {
    const a = atom({ key: 'h/obs/a', default: 0 });
    const seen: Array<[number, number]> = [];
    const { result } = renderHook(
      () => {
        useRecoilTransactionObserver_UNSTABLE(({ snapshot, previousSnapshot }) => {
          seen.push([previousSnapshot.getLoadable(a).getValue(), snapshot.getLoadable(a).getValue()]);
        });
        return { snap: useRecoilSnapshot(), set: useSetRecoilState(a), id: useRecoilStoreID() };
      },
      { wrapper },
    );
    expect(typeof result.current.id).toBe('number');
    const first: Snapshot = result.current.snap;
    await act(async () => result.current.set(5));
    await waitFor(() => expect(seen).toEqual([[0, 5]]));
    expect(result.current.snap).not.toBe(first);
    expect(result.current.snap.getLoadable(a).getValue()).toBe(5);
    expect(first.getLoadable(a).getValue()).toBe(0);
  });
});

describe('RecoilRoot', () => {
  it('initializeState sets initial values', () => {
    const a = atom({ key: 'root/init/a', default: 1 });
    const b = atom({ key: 'root/init/b', default: 'x' });
    const { result } = renderHook(() => [useRecoilValue(a), useRecoilValue(b)], {
      wrapper: ({ children }) => (
        <RecoilRoot
          initializeState={({ set, setUnvalidatedAtomValues }) => {
            set(a, 42);
            setUnvalidatedAtomValues(new Map([['root/init/b', 'from-map']]));
          }}
        >
          {children}
        </RecoilRoot>
      ),
    });
    expect(result.current).toEqual([42, 'from-map']);
  });

  it('override={false} shares the ancestor state', () => {
    const a = atom({ key: 'root/override', default: 0 });
    function Inc({ id }: { id: string }) {
      const [v, set] = useRecoilState(a);
      return (
        <button data-testid={id} onClick={() => set(v + 1)}>
          {v}
        </button>
      );
    }
    render(
      <RecoilRoot>
        <Inc id="outer" />
        <RecoilRoot override={false}>
          <Inc id="inner" />
        </RecoilRoot>
        <RecoilRoot>
          <Inc id="separate" />
        </RecoilRoot>
      </RecoilRoot>,
    );
    act(() => screen.getByTestId('inner').click());
    expect(screen.getByTestId('outer').textContent).toBe('1');
    expect(screen.getByTestId('separate').textContent).toBe('0');
  });

  it('works under StrictMode', () => {
    const a = atom({ key: 'root/strict', default: 0 });
    function Inc() {
      const [v, set] = useRecoilState(a);
      return <button onClick={() => set(v + 1)}>{`n=${v}`}</button>;
    }
    render(
      <StrictMode>
        <RecoilRoot>
          <Inc />
        </RecoilRoot>
      </StrictMode>,
    );
    act(() => screen.getByText('n=0').click());
    expect(screen.getByText('n=1')).toBeTruthy();
  });
});
