import { Provider, useAtomValue, useStore } from 'jotai/react';
import type { Atom } from 'jotai/vanilla';
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { getStoreData, type AnyAtom, type Store } from './core';
import { getInfoFromStore } from './info';
import type { Loadable } from './Loadable';
import { RecoilStoreContext } from './RecoilRoot';
import { Snapshot, createCallbackInterface, gotoSnapshotInStore, runTransaction } from './Snapshot';
import { loadableFromStore, refreshInStore, resetVia, setVia } from './storeOps';
import type {
  CallbackInterface,
  RecoilBridge,
  RecoilState,
  RecoilStateInfo,
  RecoilValue,
  Resetter,
  SetterOrUpdater,
  StoreID,
  TransactionInterface_UNSTABLE,
} from './types';

const useRecoilStore = (): Store => useStore() as unknown as Store;

// ---------------------------------------------------------------------------
// Basic hooks
// ---------------------------------------------------------------------------

/** Returns the value of an atom or selector, suspending while it is pending. */
export function useRecoilValue<T>(recoilValue: RecoilValue<T>): T {
  return useAtomValue(recoilValue as unknown as Atom<T | Promise<T>>) as T;
}

/** Returns a setter for an atom or writable selector without subscribing to it. */
export function useSetRecoilState<T>(recoilState: RecoilState<T>): SetterOrUpdater<T> {
  const store = useRecoilStore();
  return useCallback(
    (valOrUpdater: T | ((currVal: T) => T)) =>
      setVia((a: any, v: unknown) => store.set(a, v), recoilState as unknown as AnyAtom, valOrUpdater),
    [store, recoilState],
  );
}

/** Returns `[value, setter]`, like `useState`. */
export function useRecoilState<T>(recoilState: RecoilState<T>): [T, SetterOrUpdater<T>] {
  return [useRecoilValue(recoilState), useSetRecoilState(recoilState)];
}

/** Returns a function that resets an atom (or writable selector) to its default. */
export function useResetRecoilState(recoilState: RecoilState<any>): Resetter {
  const store = useRecoilStore();
  return useCallback(
    () => resetVia((a: any, v: unknown) => store.set(a, v), recoilState as unknown as AnyAtom),
    [store, recoilState],
  );
}

// ---------------------------------------------------------------------------
// Loadable hooks
// ---------------------------------------------------------------------------

function computeLoadable<T>(store: Store, rv: AnyAtom, prev: Loadable<T> | undefined): Loadable<T> {
  const next = loadableFromStore<T>(store, rv);
  if (prev && prev.state === next.state) {
    if (next.state === 'loading' ? prev._raw === getRaw(store, rv) : Object.is(prev.contents, next.contents)) {
      return prev;
    }
  }
  if (next.state === 'loading') next._raw = getRaw(store, rv);
  return next;
}

function getRaw(store: Store, rv: AnyAtom): unknown {
  try {
    return store.get(rv);
  } catch (e) {
    return e;
  }
}

/** Returns a Loadable for an atom or selector; never suspends. */
export function useRecoilValueLoadable<T>(recoilValue: RecoilValue<T>): Loadable<T> {
  const store = useRecoilStore();
  const rv = recoilValue as unknown as AnyAtom;
  const [[loadable, loadableStore, loadableAtom], rerender] = useReducer(
    (prev: readonly [Loadable<T>, Store, AnyAtom]) => {
      const next = computeLoadable<T>(store, rv, prev[1] === store && prev[2] === rv ? prev[0] : undefined);
      return next === prev[0] && prev[1] === store && prev[2] === rv ? prev : ([next, store, rv] as const);
    },
    undefined,
    () => [computeLoadable<T>(store, rv, undefined), store, rv] as const,
  );

  let current = loadable;
  if (loadableStore !== store || loadableAtom !== rv) {
    rerender();
    current = computeLoadable<T>(store, rv, undefined);
  }

  useEffect(() => {
    const unsub = store.sub(rv, rerender);
    rerender();
    return unsub;
  }, [store, rv]);

  useEffect(() => {
    if (current.state !== 'loading') return;
    let active = true;
    const done = () => {
      if (active) rerender();
    };
    current.contents.then(done, done);
    return () => {
      active = false;
    };
  }, [current]);

  return current;
}

/** Returns `[loadable, setter]`; never suspends. */
export function useRecoilStateLoadable<T>(recoilState: RecoilState<T>): [Loadable<T>, SetterOrUpdater<T>] {
  return [useRecoilValueLoadable(recoilState), useSetRecoilState(recoilState)];
}

// React 18 transition-support variants: same behaviour.
export const useRecoilValue_TRANSITION_SUPPORT_UNSTABLE = useRecoilValue;
export const useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE = useRecoilValueLoadable;
export const useRecoilState_TRANSITION_SUPPORT_UNSTABLE = useRecoilState;

// ---------------------------------------------------------------------------
// Callbacks, transactions, refreshers
// ---------------------------------------------------------------------------

/**
 * Builds a callback with access to the current state (`snapshot`) and to
 * `set` / `reset` / `refresh` / `gotoSnapshot` / `transact_UNSTABLE`, without
 * subscribing the component to anything.
 */
export function useRecoilCallback<Args extends ReadonlyArray<unknown>, Return>(
  fn: (callbackInterface: CallbackInterface) => (...args: Args) => Return,
  deps?: ReadonlyArray<unknown>,
): (...args: Args) => Return {
  const store = useRecoilStore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    (...args: Args) => fn(createCallbackInterface(store))(...args),
    deps ? [store, ...deps] : [store, fn],
  );
}

/** Builds a callback that reads and writes atoms synchronously. */
export function useRecoilTransaction_UNSTABLE<Args extends ReadonlyArray<unknown>>(
  fn: (callbackInterface: TransactionInterface_UNSTABLE) => (...args: Args) => void,
  deps?: ReadonlyArray<unknown>,
): (...args: Args) => void {
  const store = useRecoilStore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    (...args: Args) => runTransaction(store, (i) => fn(i)(...args)),
    deps ? [store, ...deps] : [store, fn],
  );
}

/** Returns a function that clears a selector's cache and re-evaluates it. */
export function useRecoilRefresher_UNSTABLE(recoilValue: RecoilValue<any>): () => void {
  const store = useRecoilStore();
  return useCallback(() => refreshInStore(store, recoilValue as unknown as AnyAtom), [store, recoilValue]);
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

function useStoreVersion(store: Store): number {
  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    const data = getStoreData(store);
    let seen = data.version;
    const listener = () => {
      if (data.version !== seen) {
        seen = data.version;
        forceUpdate();
      }
    };
    data.listeners.add(listener);
    listener();
    return () => {
      data.listeners.delete(listener);
    };
  }, [store]);
  return getStoreData(store).version;
}

/** Returns a Snapshot of the current state; re-renders when any atom changes. */
export function useRecoilSnapshot(): Snapshot {
  const store = useRecoilStore();
  const version = useStoreVersion(store);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Snapshot(store), [store, version]);
}

/** Returns a function that moves the state to a given Snapshot. */
export function useGotoRecoilSnapshot(): (snapshot: Snapshot) => void {
  const store = useRecoilStore();
  return useCallback((snapshot: Snapshot) => gotoSnapshotInStore(store, snapshot), [store]);
}

/** Calls `callback` after state changes, with the new and previous Snapshots. */
export function useRecoilTransactionObserver_UNSTABLE(
  callback: (opts: { snapshot: Snapshot; previousSnapshot: Snapshot }) => void,
): void {
  const store = useRecoilStore();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    const data = getStoreData(store);
    let previous = new Snapshot(store);
    const listener = () => {
      const snapshot = new Snapshot(store);
      const previousSnapshot = previous;
      previous = snapshot;
      callbackRef.current({ snapshot, previousSnapshot });
    };
    data.listeners.add(listener);
    return () => {
      data.listeners.delete(listener);
    };
  }, [store]);
}

/** Returns a function that reports debug information about a Recoil value. */
export function useGetRecoilValueInfo_UNSTABLE(): <T>(recoilValue: RecoilValue<T>) => RecoilStateInfo<T> {
  const store = useRecoilStore();
  return useCallback(
    <T>(recoilValue: RecoilValue<T>) => getInfoFromStore<T>(store, recoilValue as unknown as AnyAtom),
    [store],
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Returns a stable numeric ID for the current RecoilRoot's store. */
export function useRecoilStoreID(): StoreID {
  return getStoreData(useRecoilStore()).id;
}

/**
 * Returns a component that makes the current state available in another React
 * root (e.g. a portal rendered with a different renderer).
 */
export function useRecoilBridgeAcrossReactRoots_UNSTABLE(): RecoilBridge {
  const store = useRecoilStore();
  return useMemo(
    () =>
      function RecoilBridge({ children }: { children?: ReactNode }) {
        return createElement(
          RecoilStoreContext.Provider,
          { value: store },
          createElement(Provider, { store: store as any }, children),
        );
      },
    [store],
  );
}

/** Retention is handled by garbage collection; accepted for compatibility. */
export function useRetain(_toRetain: unknown): void {}

/** Accepted for compatibility; retention zones are a no-op. */
export function retentionZone(): { readonly __retentionZone: true } {
  return { __retentionZone: true };
}
