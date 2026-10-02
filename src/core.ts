/**
 * Shared internals: sentinels, node metadata, per-store bookkeeping and
 * promise tracking. Nothing in here is part of the public API.
 */
import { atom as jotaiAtom } from 'jotai/vanilla';
import type { Atom, WritableAtom } from 'jotai/vanilla';
import { RESET } from 'jotai/vanilla/utils';

export type Store = {
  get: <V>(atom: Atom<V>) => V;
  set: <V, Args extends unknown[], R>(atom: WritableAtom<V, Args, R>, ...args: Args) => R;
  sub: (atom: Atom<unknown>, listener: () => void) => () => void;
};

export type AnyAtom = Atom<unknown>;
export type AnyWritableAtom = WritableAtom<unknown, any[], any>;

export const __DEV__ = (() => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
})();

// ---------------------------------------------------------------------------
// Public sentinel classes (re-exported from index)
// ---------------------------------------------------------------------------

/**
 * Passed to selector `set` when the selector is being reset, and can be used
 * as a value to reset an atom (`set(myAtom, new DefaultValue())`).
 */
export class DefaultValue {
  /** Brand so that structurally-similar objects are not confused with it. */
  readonly __recoilDefaultValue = true as const;
}

/** Wraps a value so that it is stored verbatim (no Promise / Loadable / RecoilValue interpretation). */
export class WrappedValue<T> {
  readonly value: T;
  constructor(value: T) {
    this.value = value;
  }
}

export const isDefaultValue = (v: unknown): v is DefaultValue => v instanceof DefaultValue;

// ---------------------------------------------------------------------------
// Internal sentinels
// ---------------------------------------------------------------------------

/** Raw value of an atom that is at its default. */
export const UNSET: unique symbol = Symbol('jotai-recoil-compat/unset');
export type Unset = typeof UNSET;

/** Write argument that forces a selector to re-evaluate in a store. */
export const REFRESH: unique symbol = Symbol('jotai-recoil-compat/refresh');

/** Write argument used by atom effects so their own `onSet` handlers are skipped. */
export class EffectSet {
  constructor(
    readonly effectId: object,
    readonly value: unknown,
  ) {}
}

export const JOTAI_RESET = RESET;

// ---------------------------------------------------------------------------
// Node metadata
// ---------------------------------------------------------------------------

export const NODE: unique symbol = Symbol.for('jotai-recoil-compat/node');

export interface AtomMeta {
  type: 'atom';
  key: string;
  valueAtom: WritableAtom<unknown, [unknown], void>;
  getDefault: () => unknown;
  effects: ReadonlyArray<(...args: any[]) => any> | undefined;
}

export interface SelectorMeta {
  type: 'selector';
  key: string;
  writable: boolean;
  /** Clears the evaluation cache (used by refreshers). */
  clearCache: () => void;
  /** Nodes read during the latest evaluation. */
  deps: Set<AnyAtom>;
}

export type NodeMeta = AtomMeta | SelectorMeta;

export interface RecoilNodeBase extends AnyWritableAtom {
  key: string;
  [NODE]: NodeMeta;
}

export const getMeta = (node: unknown): NodeMeta | undefined =>
  node != null && typeof node === 'object' ? (node as any)[NODE] : undefined;

export const isRecoilNode = (node: unknown): node is RecoilNodeBase => getMeta(node) !== undefined;

export const isJotaiAtom = (v: unknown): v is AnyAtom =>
  v != null && typeof v === 'object' && typeof (v as any).read === 'function';

// ---------------------------------------------------------------------------
// Node registry (by key)
// ---------------------------------------------------------------------------

export interface RecoilEnv {
  /** Warn when two atoms/selectors are created with the same key (mirrors Recoil). */
  RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED: boolean;
  /** Accepted for compatibility with Recoil; has no effect. */
  RECOIL_GKS_ENABLED: Set<string>;
}

export const RecoilEnv: RecoilEnv = {
  RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED: true,
  RECOIL_GKS_ENABLED: new Set<string>(),
};

const nodesByKey = new Map<string, RecoilNodeBase>();

export function registerNode(node: RecoilNodeBase, { isFamilyMember = false } = {}): void {
  if (
    __DEV__ &&
    !isFamilyMember &&
    RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED &&
    nodesByKey.has(node.key)
  ) {
    console.warn(
      `Duplicate atom key "${node.key}". This is a FATAL ERROR in Recoil, but it is safe ` +
        'to ignore this warning if it occurred because of hot module replacement.',
    );
  }
  nodesByKey.set(node.key, node);
}

export const getNodeByKey = (key: string): RecoilNodeBase | undefined => nodesByKey.get(key);

/** @internal test helper */
export const clearNodeRegistry = (): void => nodesByKey.clear();

// Stable numeric identity for any atom (used to build cache keys for helpers).
let nextAtomId = 0;
const atomIds = new WeakMap<object, number>();
export const atomId = (a: object): number => {
  let id = atomIds.get(a);
  if (id === undefined) {
    id = nextAtomId++;
    atomIds.set(a, id);
  }
  return id;
};

// ---------------------------------------------------------------------------
// Per-store bookkeeping
// ---------------------------------------------------------------------------

export interface OnSetHandler {
  effectId: object;
  handler: (newValue: unknown, oldValue: unknown, isReset: boolean) => void;
}

export interface StoreData {
  id: number;
  parentId: number | undefined;
  /** Recoil atoms that have been initialised in this store. */
  atoms: Set<RecoilNodeBase>;
  /** Atom effect cleanup functions. */
  cleanups: Array<() => void>;
  onSet: Map<RecoilNodeBase, Set<OnSetHandler>>;
  /** Listeners notified (batched) after any Recoil atom changes in this store. */
  listeners: Set<() => void>;
  notifyScheduled: boolean;
  version: number;
  /** For a Snapshot's private store: the snapshot it belongs to. */
  snapshotOf: SnapshotSource | undefined;
  /** Snapshots taken from this store that are still reachable (copy-on-write). */
  liveSnapshots: Set<WeakRef<SnapshotSource>>;
  /** Initial raw values for atoms (from `initializeState`), consumed on atom init. */
  initValues: Map<RecoilNodeBase, unknown>;
  /** Values passed to `setUnvalidatedAtomValues` for atoms not yet created/initialised. */
  unvalidated: Map<string, unknown>;
  released: boolean;
}

export interface SnapshotSource {
  /** Raw value an atom had when the snapshot was taken. */
  _readInitial(node: RecoilNodeBase): unknown;
  /** Copy-on-write overlay: values recorded right before the source store changed them. */
  _overlay: Map<RecoilNodeBase, unknown>;
}

/** Called before a Recoil atom's raw value changes in `store`. */
export function recordBeforeWrite(store: Store, node: RecoilNodeBase, prevRaw: unknown): void {
  const data = storeDataMap.get(store);
  if (!data || data.liveSnapshots.size === 0) return;
  for (const ref of data.liveSnapshots) {
    const snap = ref.deref();
    if (!snap) {
      data.liveSnapshots.delete(ref);
    } else if (!snap._overlay.has(node)) {
      snap._overlay.set(node, prevRaw);
    }
  }
}

let nextStoreId = 0;
const storeDataMap = new WeakMap<Store, StoreData>();

export function getStoreData(store: Store): StoreData {
  let data = storeDataMap.get(store);
  if (!data) {
    data = {
      id: nextStoreId++,
      parentId: undefined,
      atoms: new Set(),
      cleanups: [],
      onSet: new Map(),
      listeners: new Set(),
      notifyScheduled: false,
      version: 0,
      snapshotOf: undefined,
      liveSnapshots: new Set(),
      initValues: new Map(),
      unvalidated: new Map(),
      released: false,
    };
    storeDataMap.set(store, data);
  }
  return data;
}

export function notifyStoreChange(store: Store): void {
  const data = getStoreData(store);
  data.version++;
  if (data.notifyScheduled || data.listeners.size === 0) return;
  data.notifyScheduled = true;
  queueMicrotask(() => {
    data.notifyScheduled = false;
    for (const l of Array.from(data.listeners)) l();
  });
}

/** Runs atom effect cleanups for a store (called when a RecoilRoot unmounts). */
export function releaseStore(store: Store): void {
  const data = getStoreData(store);
  if (data.released) return;
  data.released = true;
  const cleanups = data.cleanups.splice(0);
  for (const c of cleanups) {
    try {
      c();
    } catch (e) {
      console.error(e);
    }
  }
}

/** Sets both the Jotai 2.12+ (`unstable_onInit`) and Jotai 3 (`INTERNAL_onInit`) init hooks. */
export function setOnInit(a: AnyAtom, fn: (store: Store) => void): void {
  (a as any).unstable_onInit = fn;
  (a as any).INTERNAL_onInit = fn;
}

/**
 * An atom whose value, in any store, is that store. Lets selectors and atom
 * writes find "their" store without mutating it during a read.
 */
let pendingInitStore: Store | null = null;
export const storeAtom: Atom<Store> = jotaiAtom(() => {
  const s = pendingInitStore;
  pendingInitStore = null;
  if (!s) {
    throw new Error('[jotai-recoil-compat] Jotai >= 2.12 is required (store init hook unavailable).');
  }
  return s;
});
storeAtom.debugPrivate = true;
setOnInit(storeAtom, (store) => {
  pendingInitStore = store;
});

// ---------------------------------------------------------------------------
// Promise tracking
// ---------------------------------------------------------------------------

export const isPromiseLike = (v: unknown): v is PromiseLike<unknown> =>
  v != null && (typeof v === 'object' || typeof v === 'function') && typeof (v as any).then === 'function';

type PromiseState =
  | { status: 'pending' }
  | { status: 'fulfilled'; value: unknown }
  | { status: 'rejected'; reason: unknown };

const promiseStates = new WeakMap<PromiseLike<unknown>, PromiseState>();

export function trackPromise(p: PromiseLike<unknown>): PromiseState {
  let state = promiseStates.get(p);
  if (!state) {
    state = { status: 'pending' };
    promiseStates.set(p, state);
    p.then(
      (value) => promiseStates.set(p, { status: 'fulfilled', value }),
      (reason) => promiseStates.set(p, { status: 'rejected', reason }),
    );
  }
  return state;
}

/** Thrown inside selector evaluation when a dependency is still pending. */
export class PendingSignal {
  constructor(readonly promise: PromiseLike<unknown>) {}
}

/**
 * Resolves a raw Jotai value the way Recoil's `get` would: resolved promises
 * become their value, rejected promises throw, pending ones throw a PendingSignal.
 */
export function unwrapRaw(raw: unknown): unknown {
  if (!isPromiseLike(raw)) return raw;
  const st = trackPromise(raw);
  if (st.status === 'fulfilled') return st.value;
  if (st.status === 'rejected') throw st.reason;
  throw new PendingSignal(raw);
}

export const settled = (p: PromiseLike<unknown>): Promise<void> =>
  Promise.resolve(p).then(
    () => undefined,
    () => undefined,
  );
