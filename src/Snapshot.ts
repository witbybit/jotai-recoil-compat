import { createStore } from 'jotai/vanilla';
import {
  DefaultValue,
  UNSET,
  WrappedValue,
  getMeta,
  getStoreData,
  getNodeByKey,
  type AnyAtom,
  type AtomMeta,
  type RecoilNodeBase,
  type SnapshotSource,
  type Store,
} from './core';
import { getInfoFromStore } from './info';
import type { Loadable } from './Loadable';
import { loadableFromStore, promiseFromStore, refreshInStore, resetVia, setVia, syncValueFromGetter } from './storeOps';
import type {
  CallbackInterface,
  RecoilState,
  RecoilStateInfo,
  RecoilValue,
  SnapshotID,
  StoreID,
  TransactionInterface_UNSTABLE,
} from './types';

let nextSnapshotId = 0;
const hasWeakRef = typeof WeakRef !== 'undefined';

const valueAtomOf = (node: RecoilNodeBase) => (getMeta(node) as AtomMeta).valueAtom;

/** All Recoil atoms known to a store (including, for snapshot stores, those of its snapshot). */
function knownAtoms(store: Store, out = new Set<RecoilNodeBase>()): Set<RecoilNodeBase> {
  const data = getStoreData(store);
  for (const a of data.atoms) out.add(a);
  if (data.snapshotOf) (data.snapshotOf as Snapshot)._collectAtoms(out);
  return out;
}

/** Current raw value of an atom in a store, without initialising it in a real store. */
function rawInStore(store: Store, node: RecoilNodeBase): unknown {
  const data = getStoreData(store);
  if (data.atoms.has(node)) return store.get(valueAtomOf(node));
  if (data.snapshotOf) return data.snapshotOf._readInitial(node);
  return UNSET;
}

/**
 * An immutable view of Recoil state, like Recoil's `Snapshot`.
 *
 * Snapshots are copy-on-write: creating one is O(1). The source store records
 * an atom's previous value into every live snapshot right before changing it,
 * and the snapshot reads everything else lazily from the source.
 */
export class Snapshot implements SnapshotSource {
  /** @internal */ _overlay = new Map<RecoilNodeBase, unknown>();
  /** @internal */ _source: Store | undefined;
  private _ref: WeakRef<Snapshot> | undefined;
  private _store: Store | undefined;
  private readonly _id: SnapshotID = nextSnapshotId++;
  private readonly _parentStoreId: StoreID | undefined;

  /** @internal Use `snapshot_UNSTABLE()` or the hooks to obtain snapshots. */
  constructor(source?: Store) {
    if (source) {
      this._parentStoreId = getStoreData(source).id;
      if (hasWeakRef) {
        this._source = source;
        this._ref = new WeakRef(this);
        getStoreData(source).liveSnapshots.add(this._ref);
      } else {
        for (const node of knownAtoms(source)) this._overlay.set(node, rawInStore(source, node));
      }
    }
  }

  /** @internal Stop tracking the source store; only for snapshots that are being discarded. */
  _release(): void {
    if (this._source && this._ref) getStoreData(this._source).liveSnapshots.delete(this._ref);
    this._source = undefined;
    this._ref = undefined;
  }

  /** @internal */
  _readInitial(node: RecoilNodeBase): unknown {
    if (this._overlay.has(node)) return this._overlay.get(node);
    return this._source ? rawInStore(this._source, node) : UNSET;
  }

  /** @internal */
  _readRaw(node: RecoilNodeBase): unknown {
    if (this._store && getStoreData(this._store).atoms.has(node)) {
      return this._store.get(valueAtomOf(node));
    }
    return this._readInitial(node);
  }

  /** @internal */
  _collectAtoms(out: Set<RecoilNodeBase>): Set<RecoilNodeBase> {
    if (this._source) knownAtoms(this._source, out);
    for (const node of this._overlay.keys()) out.add(node);
    if (this._store) for (const node of getStoreData(this._store).atoms) out.add(node);
    return out;
  }

  /** @internal Raw values of every known atom. */
  _capture(): Map<RecoilNodeBase, unknown> {
    const values = new Map<RecoilNodeBase, unknown>();
    for (const node of this._collectAtoms(new Set())) values.set(node, this._readRaw(node));
    return values;
  }

  /** @internal The private Jotai store that evaluates selectors for this snapshot. */
  _getStore(): Store {
    if (!this._store) {
      const store = createStore() as unknown as Store;
      const data = getStoreData(store);
      data.snapshotOf = this;
      data.parentId = this._parentStoreId;
      this._store = store;
    }
    return this._store;
  }

  getID(): SnapshotID {
    return this._id;
  }

  getLoadable<T>(recoilValue: RecoilValue<T>): Loadable<T> {
    return loadableFromStore<T>(this._getStore(), recoilValue as unknown as AnyAtom);
  }

  getPromise<T>(recoilValue: RecoilValue<T>): Promise<T> {
    return promiseFromStore<T>(this._getStore(), recoilValue as unknown as AnyAtom);
  }

  getInfo_UNSTABLE<T>(recoilValue: RecoilValue<T>): RecoilStateInfo<T> {
    return getInfoFromStore<T>(this._getStore(), recoilValue as unknown as AnyAtom);
  }

  getNodes_UNSTABLE(opts?: { isModified?: boolean; isInitialized?: boolean }): Iterable<RecoilValue<unknown>> {
    const out: Array<RecoilValue<unknown>> = [];
    for (const [node, raw] of this._capture()) {
      if (opts?.isModified && raw === UNSET) continue;
      out.push(node as unknown as RecoilValue<unknown>);
    }
    return out;
  }

  map(mapper: (mutableSnapshot: MutableSnapshot) => void): Snapshot {
    const next = new MutableSnapshot(this._getStore());
    mapper(next);
    return next;
  }

  async asyncMap(mapper: (mutableSnapshot: MutableSnapshot) => Promise<void>): Promise<Snapshot> {
    const next = new MutableSnapshot(this._getStore());
    await mapper(next);
    return next;
  }

  /** Snapshots are garbage collected normally; retaining is a no-op. */
  retain(): () => void {
    return () => {};
  }

  isRetained(): boolean {
    return true;
  }
}

/** A Snapshot that can be modified (used by `initializeState`, `snapshot.map`, `snapshot_UNSTABLE`). */
export class MutableSnapshot extends Snapshot {
  set = <T>(recoilState: RecoilState<T>, newValue: T | DefaultValue | ((prev: T) => T | DefaultValue)): void => {
    const store = this._getStore();
    setVia((a: any, v: unknown) => store.set(a, v), recoilState as unknown as AnyAtom, newValue);
  };

  reset = (recoilState: RecoilState<any>): void => {
    const store = this._getStore();
    resetVia((a: any, v: unknown) => store.set(a, v), recoilState as unknown as AnyAtom);
  };

  setUnvalidatedAtomValues_DEPRECATED = (values: Map<string, unknown>): void => {
    const store = this._getStore();
    for (const [key, value] of values) {
      const node = getNodeByKey(key);
      if (node) store.set(node, new WrappedValue(value));
      else getStoreData(store).unvalidated.set(key, value);
    }
  };

  setUnvalidatedAtomValues = this.setUnvalidatedAtomValues_DEPRECATED;
}

/** Creates a standalone snapshot (Recoil's `snapshot_UNSTABLE`), handy in tests. */
export function snapshot_UNSTABLE(initializeState?: (mutableSnapshot: MutableSnapshot) => void): Snapshot {
  const snap = new MutableSnapshot();
  if (initializeState) initializeState(snap);
  return snap;
}

/** Moves a store to the state captured in a snapshot. */
export function gotoSnapshotInStore(store: Store, snapshot: Snapshot): void {
  const next = snapshot._capture();
  for (const [node, raw] of next) {
    if (!Object.is(rawInStore(store, node), raw)) {
      store.set(node, new WrappedValue(raw === UNSET ? new DefaultValue() : raw));
    }
  }
  for (const node of knownAtoms(store)) {
    if (!next.has(node) && rawInStore(store, node) !== UNSET) {
      store.set(node, new DefaultValue());
    }
  }
}

export function runTransaction(store: Store, fn: (i: TransactionInterface_UNSTABLE) => void): void {
  const set = (a: any, v: unknown) => store.set(a, v);
  fn({
    get: (rv) => syncValueFromGetter(store.get, rv as unknown as AnyAtom),
    set: (rv, v) => setVia(set, rv as unknown as AnyAtom, v),
    reset: (rv) => resetVia(set, rv as unknown as AnyAtom),
  });
}

/**
 * The object passed to `useRecoilCallback` / `getCallback` callbacks. The
 * snapshot is taken on first access, or before the first write made through
 * this interface, so it always reflects the state before the callback's writes.
 */
export function createCallbackInterface(store: Store): CallbackInterface {
  let snapshot: Snapshot | undefined;
  const pin = () => (snapshot ??= new Snapshot(store));
  const set = (a: any, v: unknown) => store.set(a, v);
  return {
    get snapshot() {
      return pin();
    },
    set: (rv, v) => {
      pin();
      setVia(set, rv as unknown as AnyAtom, v);
    },
    reset: (rv) => {
      pin();
      resetVia(set, rv as unknown as AnyAtom);
    },
    refresh: (rv) => refreshInStore(store, rv as unknown as AnyAtom),
    gotoSnapshot: (s) => {
      pin();
      gotoSnapshotInStore(store, s);
    },
    transact_UNSTABLE: (fn) => {
      pin();
      runTransaction(store, fn);
    },
  };
}
