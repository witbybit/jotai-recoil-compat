import { atom as jotaiAtom } from 'jotai/vanilla';
import type { Atom } from 'jotai/vanilla';
import {
  NODE,
  PendingSignal,
  REFRESH,
  WrappedValue,
  getMeta,
  isJotaiAtom,
  isPromiseLike,
  registerNode,
  settled,
  storeAtom,
  unwrapRaw,
  type AnyAtom,
  type RecoilNodeBase,
  type SelectorMeta,
  type Store,
} from './core';
import { isLoadable, loadableFromRaw, loadableWithError, loadableWithPromise, type Loadable } from './Loadable';
import { SelectorCache } from './selectorCache';
import { Snapshot, createCallbackInterface } from './Snapshot';
import { resetVia, setVia, syncValueFromGetter } from './storeOps';
import type {
  GetCallback,
  ReadOnlySelectorOptions,
  ReadWriteSelectorOptions,
  RecoilState,
  RecoilValueReadOnly,
} from './types';

type Getter = <V>(a: Atom<V>) => V;

/** The snapshot that reads inside the currently running selector setter use. */
let setterContext: { store: Store; snapshot: Snapshot } | null = null;

/** @internal Extra option passed to selector `get` by the waitFor* helpers. */
export const GET_LOADABLE: unique symbol = Symbol('jotai-recoil-compat/getLoadable');
export type InternalGetOptions = { [GET_LOADABLE]: <T>(dep: AnyAtom) => Loadable<T> };

/** @internal */
export function createSelector<T>(
  options: ReadOnlySelectorOptions<T> | ReadWriteSelectorOptions<T>,
  isFamilyMember: boolean,
): RecoilState<T> | RecoilValueReadOnly<T> {
  const { key, get: userGet } = options;
  const userSet = 'set' in options ? options.set : undefined;
  if (typeof key !== 'string') {
    throw new Error('[jotai-recoil-compat] selector() requires a string `key`.');
  }
  const cache = new SelectorCache(options.cachePolicy_UNSTABLE);
  const refreshAtom = jotaiAtom(0);
  refreshAtom.debugPrivate = true;
  const meta: SelectorMeta = {
    type: 'selector',
    key,
    writable: !!userSet,
    clearCache: () => cache.clear(),
    deps: new Set(),
  };

  function evaluate(get: Getter): unknown {
    const hit = cache.lookup(get as (a: AnyAtom) => unknown);
    if (hit) {
      if (hit.ok) return hit.value;
      throw hit.error;
    }

    let store: Store | undefined;
    const getStore = () => (store ??= get(storeAtom));
    let deps: Array<[AnyAtom, unknown]> = [];
    let depSet = new Set<AnyAtom>();
    let cacheable = true;

    const record = (dep: AnyAtom, raw: unknown) => {
      if (!depSet.has(dep)) {
        depSet.add(dep);
        deps.push([dep, raw]);
      }
    };
    const readDep = (dep: unknown): unknown => {
      if (!isJotaiAtom(dep)) {
        throw new Error(`[jotai-recoil-compat] selector "${key}": get() was called with an invalid value: ${String(dep)}`);
      }
      try {
        const raw = get(dep);
        record(dep, raw);
        return raw;
      } catch (e) {
        cacheable = false;
        depSet.add(dep);
        throw e;
      }
    };
    const getValue = (dep: unknown) => unwrapRaw(readDep(dep));
    const getLoadable = <V>(dep: AnyAtom): Loadable<V> => {
      let raw: unknown;
      try {
        raw = readDep(dep);
      } catch (e) {
        return isPromiseLike(e) ? loadableWithPromise(e as Promise<V>) : loadableWithError(e);
      }
      const l = loadableFromRaw<V>(raw);
      if (l.state === 'loading') {
        // The result depends on a pending value without suspending on it:
        // don't cache it, and re-evaluate once the value settles.
        cacheable = false;
        const s = getStore();
        settled(l.contents).then(() => s.set(node as any, REFRESH));
      }
      return l;
    };
    const getCallback: GetCallback = (fn) => {
      const s = getStore();
      return (...args) => fn(createCallbackInterface(s))(...args);
    };
    const opts = { get: getValue, getCallback, [GET_LOADABLE]: getLoadable } as any;

    const commit = (value: unknown) => {
      if (cacheable) cache.insert(deps.slice(), { ok: true, value });
      meta.deps = depSet;
      return value;
    };
    const fail = (error: unknown): never => {
      if (cacheable) cache.insert(deps.slice(), { ok: false, error });
      meta.deps = depSet;
      throw error;
    };

    // Turns whatever `get` returned into a final value, or a promise of one.
    const settle = (result: unknown): unknown => {
      if (result instanceof WrappedValue) return commit(result.value);
      if (isLoadable(result)) {
        const l = result as Loadable<unknown>;
        if (l.state === 'hasValue') return commit(l.contents);
        if (l.state === 'hasError') throw l.contents;
        return l.contents.then(settleSafe, onError);
      }
      if (isJotaiAtom(result)) return settle(getValue(result));
      if (isPromiseLike(result)) return Promise.resolve(result).then(settleSafe, onError);
      return commit(result);
    };
    const settleSafe = (result: unknown): unknown => {
      try {
        return settle(result);
      } catch (e) {
        return onError(e);
      }
    };
    const onError = (e: unknown): unknown => {
      // A dependency is pending (or the selector threw a promise, Suspense
      // style): wait for it, then re-run the selector, like Recoil does.
      if (e instanceof PendingSignal) return settled(e.promise).then(attempt);
      if (isPromiseLike(e)) return settled(e).then(attempt);
      return fail(e);
    };
    const attempt = (): unknown => {
      deps = [];
      depSet = new Set();
      cacheable = true;
      try {
        return settle(userGet(opts));
      } catch (e) {
        return onError(e);
      }
    };
    return attempt();
  }

  const node = jotaiAtom(
    (get) => {
      get(refreshAtom);
      return evaluate(get);
    },
    (get, set, update: unknown) => {
      if (update === REFRESH) {
        set(refreshAtom, (c) => c + 1);
        return;
      }
      if (!userSet) {
        throw new Error(`[jotai-recoil-compat] Attempt to set read-only selector "${key}"`);
      }
      let newValue = update;
      if (typeof newValue === 'function') {
        newValue = (newValue as (prev: unknown) => unknown)(syncValueFromGetter(get, node));
      }
      // Like Recoil, `get` (and updaters) inside a setter read the state as it
      // was before this set started, even after the setter's own writes. A
      // copy-on-write snapshot gives us that cheaply; nested selector sets
      // share it.
      const store = get(storeAtom);
      const outer = setterContext;
      let snapshot: Snapshot | undefined = outer?.store === store ? outer.snapshot : undefined;
      const ownsSnapshot = !snapshot;
      const pin = () => (snapshot ??= new Snapshot(store));
      const readOld = (rv: AnyAtom) => {
        const snap = pin();
        return syncValueFromGetter(snap._getStore().get, rv);
      };
      setterContext = { store, get snapshot() { return pin(); } };
      try {
        userSet(
          {
            get: readOld as any,
            set: (rv, v) => {
              let value: unknown = v;
              if (typeof v === 'function') {
                value = (v as (prev: unknown) => unknown)(readOld(rv as unknown as AnyAtom));
                if (typeof value === 'function' && getMeta(rv)?.type === 'atom') value = new WrappedValue(value);
              } else {
                pin();
              }
              setVia(set, rv as unknown as AnyAtom, value);
            },
            reset: (rv) => {
              pin();
              resetVia(set, rv as unknown as AnyAtom);
            },
          },
          newValue as T,
        );
      } finally {
        setterContext = outer;
        if (ownsSnapshot) snapshot?._release();
      }
    },
  ) as unknown as RecoilNodeBase;
  Object.assign(node, { key, [NODE]: meta, toJSON: () => ({ key }) });
  node.debugLabel = key;
  registerNode(node, { isFamilyMember });
  return node as unknown as RecoilState<T>;
}

/**
 * Creates a Recoil-compatible selector. Supports sync and async `get`,
 * returning other Recoil values / Loadables, `getCallback`, writable selectors,
 * Recoil-style dependency-value caching and `cachePolicy_UNSTABLE`.
 */
export function selector<T>(options: ReadWriteSelectorOptions<T>): RecoilState<T>;
export function selector<T>(options: ReadOnlySelectorOptions<T>): RecoilValueReadOnly<T>;
export function selector<T>(
  options: ReadOnlySelectorOptions<T> | ReadWriteSelectorOptions<T>,
): RecoilState<T> | RecoilValueReadOnly<T> {
  return createSelector(options, false);
}

/** Wrap a value so it is returned as-is (Recoil's `selector.value()`). */
selector.value = <T>(value: T): WrappedValue<T> => new WrappedValue(value);
