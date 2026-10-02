import { Provider } from 'jotai/react';
import { createStore } from 'jotai/vanilla';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { UNSET, WrappedValue, getStoreData, releaseStore, type Store } from './core';
import { MutableSnapshot } from './Snapshot';

/** @internal The store of the nearest RecoilRoot (null when there is none). */
export const RecoilStoreContext = createContext<Store | null>(null);

type JotaiStore = ReturnType<typeof createStore>;

export interface RecoilRootProps {
  children?: ReactNode;
  /** Initialise atom values before the first render. */
  initializeState?: (mutableSnapshot: MutableSnapshot) => void;
  /**
   * When `false` and nested inside another RecoilRoot, this root does nothing
   * and the ancestor's state is shared (Recoil semantics). Defaults to `true`.
   */
  override?: boolean;
  /**
   * Jotai interop: use an existing Jotai store, e.g. one shared with a Jotai
   * `<Provider>`. Atom effect cleanups are left to the owner of the store.
   */
  store?: JotaiStore;
  /** Accepted for Recoil compatibility; ignored. */
  store_UNSTABLE?: unknown;
}

const retainCounts = new WeakMap<Store, number>();

function applyInitializeState(
  store: Store,
  initializeState: (mutableSnapshot: MutableSnapshot) => void,
  isFreshStore: boolean,
): void {
  const mutable = new MutableSnapshot();
  initializeState(mutable);
  const data = getStoreData(store);
  for (const [node, raw] of mutable._capture()) {
    if (raw === UNSET) continue;
    // In a fresh store, values become the atoms' initial values when they
    // are first used (atom effects may still override them, as in Recoil).
    if (isFreshStore) data.initValues.set(node, raw);
    else store.set(node, new WrappedValue(raw));
  }
  for (const [key, value] of getStoreData(mutable._getStore()).unvalidated) {
    data.unvalidated.set(key, value);
  }
}

function RecoilRootWithStore({ children, initializeState, store: providedStore }: RecoilRootProps) {
  const [store] = useState(() => {
    const s = (providedStore ?? createStore()) as unknown as Store;
    if (initializeState) applyInitializeState(s, initializeState, !providedStore);
    return s;
  });

  useEffect(() => {
    if (providedStore) return;
    retainCounts.set(store, (retainCounts.get(store) ?? 0) + 1);
    return () => {
      retainCounts.set(store, (retainCounts.get(store) ?? 1) - 1);
      // Deferred so that StrictMode's unmount/remount doesn't tear down effects.
      queueMicrotask(() => {
        if (!retainCounts.get(store)) releaseStore(store);
      });
    };
  }, [store, providedStore]);

  return (
    <RecoilStoreContext.Provider value={store}>
      <Provider store={store as unknown as JotaiStore}>{children}</Provider>
    </RecoilStoreContext.Provider>
  );
}

/**
 * Drop-in replacement for Recoil's `<RecoilRoot>`. Each root owns a Jotai
 * store (rendered through Jotai's `<Provider>`).
 */
export function RecoilRoot(props: RecoilRootProps) {
  const parent = useContext(RecoilStoreContext);
  if (props.override === false && parent) {
    return <>{props.children}</>;
  }
  return <RecoilRootWithStore {...props} />;
}
