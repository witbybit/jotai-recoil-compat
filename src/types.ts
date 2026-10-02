/**
 * Public types. These mirror Recoil's own TypeScript definitions so that code
 * written against `recoil` type-checks unchanged. Recoil nodes are also real
 * Jotai atoms, so they can be passed to Jotai APIs during a gradual migration.
 */
import type { Atom, WritableAtom } from 'jotai/vanilla';
import type { ReactNode } from 'react';
import type { DefaultValue, WrappedValue, NODE } from './core';
import type { Loadable } from './Loadable';
import type { Snapshot } from './Snapshot';

export type NodeKey = string;
export type StoreID = number;
export type SnapshotID = number;

// ---------------------------------------------------------------------------
// Recoil values
// ---------------------------------------------------------------------------

interface RecoilValueBase<T> {
  readonly key: NodeKey;
  /** @internal type brand, never set at runtime */
  readonly __tag?: [T];
  /** @internal */
  readonly [NODE]: unknown;
  toJSON(): { key: string };
}

/** A read-only Recoil value (selector without `set`). Also a Jotai `Atom`. */
export interface RecoilValueReadOnly<T> extends RecoilValueBase<T>, Atom<T | Promise<T>> {}

/** A writable Recoil value (atom or selector with `set`). Also a Jotai `WritableAtom`. */
export interface RecoilState<T>
  extends RecoilValueBase<T>,
    WritableAtom<T | Promise<T>, [T | DefaultValue | ((prevValue: T) => T | DefaultValue)], void> {}

export type RecoilValue<T> = RecoilValueReadOnly<T> | RecoilState<T>;

export type UnwrapRecoilValue<T> = T extends { readonly __tag?: [infer R] } ? R : never;
export type UnwrapRecoilValues<T extends Array<RecoilValue<any>> | { [key: string]: RecoilValue<any> }> = {
  [P in keyof T]: UnwrapRecoilValue<T[P]>;
};
export type UnwrapRecoilValueLoadables<
  T extends Array<RecoilValue<any>> | { [key: string]: RecoilValue<any> },
> = {
  [P in keyof T]: Loadable<UnwrapRecoilValue<T[P]>>;
};

export type UnwrapLoadable<T> = T extends Loadable<infer R> ? R : T extends Promise<infer P> ? P : T;
export type UnwrapLoadables<T extends any[] | { [key: string]: any }> = {
  [P in keyof T]: UnwrapLoadable<T[P]>;
};

/** Type of the component returned by `useRecoilBridgeAcrossReactRoots_UNSTABLE`. */
export type RecoilBridge = (props: { children?: ReactNode }) => ReactNode;

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

export type AtomEffect<T> = (param: {
  node: RecoilState<T>;
  storeID: StoreID;
  parentStoreID_UNSTABLE?: StoreID;
  trigger: 'set' | 'get';
  setSelf: (
    param:
      | T
      | DefaultValue
      | Promise<T | DefaultValue>
      | WrappedValue<T>
      | ((param: T | DefaultValue) => T | DefaultValue | WrappedValue<T>),
  ) => void;
  resetSelf: () => void;
  onSet: (param: (newValue: T, oldValue: T | DefaultValue, isReset: boolean) => void) => void;
  getPromise: <S>(recoilValue: RecoilValue<S>) => Promise<S>;
  getLoadable: <S>(recoilValue: RecoilValue<S>) => Loadable<S>;
  getInfo_UNSTABLE: <S>(recoilValue: RecoilValue<S>) => RecoilStateInfo<S>;
}) => void | (() => void);

export interface AtomOptionsWithoutDefault<T> {
  key: NodeKey;
  effects?: ReadonlyArray<AtomEffect<T>>;
  /** @deprecated use `effects` */
  effects_UNSTABLE?: ReadonlyArray<AtomEffect<T>>;
  /** Accepted for compatibility. Values are never frozen by jotai-recoil-compat. */
  dangerouslyAllowMutability?: boolean;
}

export interface AtomOptionsWithDefault<T> extends AtomOptionsWithoutDefault<T> {
  default: RecoilValue<T> | Promise<T> | Loadable<T> | WrappedValue<T> | T;
}

export type AtomOptions<T> = AtomOptionsWithoutDefault<T> | AtomOptionsWithDefault<T>;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export interface GetRecoilValue {
  <T>(recoilVal: RecoilValue<T>): T;
  /** Jotai interop: read a plain Jotai atom inside a selector. */
  <T>(jotaiAtom: Atom<T>): Awaited<T>;
}

export type SetterOrUpdater<T> = (valOrUpdater: ((currVal: T) => T) | T) => void;
export type Resetter = () => void;

export type SetRecoilState = <T>(
  recoilVal: RecoilState<T>,
  newVal: T | DefaultValue | ((prevValue: T) => T | DefaultValue),
) => void;

export type ResetRecoilState = (recoilVal: RecoilState<any>) => void;

export type GetCallback = <Args extends ReadonlyArray<unknown>, Return>(
  fn: (callbackInterface: SelectorCallbackInterface) => (...args: Args) => Return,
) => (...args: Args) => Return;

export type EvictionPolicy = 'lru' | 'keep-all' | 'most-recent';

export type CachePolicyWithoutEquality =
  | { eviction: 'lru'; maxSize: number }
  | { eviction: 'keep-all' }
  | { eviction: 'most-recent' };

export type CachePolicy =
  | CachePolicyWithoutEquality
  | { eviction: 'lru'; maxSize: number; equality?: 'reference' | 'value' }
  | { eviction: 'keep-all'; equality?: 'reference' | 'value' }
  | { eviction: 'most-recent'; equality?: 'reference' | 'value' }
  | { equality: 'reference' | 'value' };

export interface ReadOnlySelectorOptions<T> {
  key: string;
  get: (opts: {
    get: GetRecoilValue;
    getCallback: GetCallback;
  }) => Promise<T> | RecoilValue<T> | Loadable<T> | WrappedValue<T> | T;
  cachePolicy_UNSTABLE?: CachePolicyWithoutEquality;
  /** Accepted for compatibility. Values are never frozen by jotai-recoil-compat. */
  dangerouslyAllowMutability?: boolean;
}

export interface ReadWriteSelectorOptions<T> extends ReadOnlySelectorOptions<T> {
  set: (
    opts: {
      set: SetRecoilState;
      get: GetRecoilValue;
      reset: ResetRecoilState;
    },
    newValue: T | DefaultValue,
  ) => void;
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

export type Primitive = undefined | null | boolean | number | symbol | string;

export interface HasToJSON {
  toJSON(): SerializableParam;
}

export type SerializableParam =
  | Primitive
  | HasToJSON
  | ReadonlyArray<SerializableParam>
  | ReadonlySet<SerializableParam>
  | ReadonlyMap<SerializableParam, SerializableParam>
  | Readonly<{ [key: string]: SerializableParam }>;

export interface AtomFamilyOptionsWithoutDefault<T, P extends SerializableParam> {
  key: NodeKey;
  dangerouslyAllowMutability?: boolean;
  effects?: ReadonlyArray<AtomEffect<T>> | ((param: P) => ReadonlyArray<AtomEffect<T>>);
  /** @deprecated use `effects` */
  effects_UNSTABLE?: ReadonlyArray<AtomEffect<T>> | ((param: P) => ReadonlyArray<AtomEffect<T>>);
  cachePolicyForParams_UNSTABLE?: CachePolicyWithoutEquality;
}

export interface AtomFamilyOptionsWithDefault<T, P extends SerializableParam>
  extends AtomFamilyOptionsWithoutDefault<T, P> {
  default:
    | RecoilValue<T>
    | Promise<T>
    | Loadable<T>
    | WrappedValue<T>
    | T
    | ((param: P) => T | RecoilValue<T> | Promise<T> | Loadable<T> | WrappedValue<T>);
}

export type AtomFamilyOptions<T, P extends SerializableParam> =
  | AtomFamilyOptionsWithDefault<T, P>
  | AtomFamilyOptionsWithoutDefault<T, P>;

export interface ReadOnlySelectorFamilyOptions<T, P extends SerializableParam> {
  key: string;
  get: (param: P) => (opts: {
    get: GetRecoilValue;
    getCallback: GetCallback;
  }) => Promise<T> | Loadable<T> | WrappedValue<T> | RecoilValue<T> | T;
  cachePolicy_UNSTABLE?: CachePolicyWithoutEquality;
  cachePolicyForParams_UNSTABLE?: CachePolicyWithoutEquality;
  dangerouslyAllowMutability?: boolean;
}

export interface ReadWriteSelectorFamilyOptions<T, P extends SerializableParam>
  extends ReadOnlySelectorFamilyOptions<T, P> {
  set: (param: P) => (
    opts: { set: SetRecoilState; get: GetRecoilValue; reset: ResetRecoilState },
    newValue: T | DefaultValue,
  ) => void;
}

// ---------------------------------------------------------------------------
// Callbacks, transactions, snapshots
// ---------------------------------------------------------------------------

export interface TransactionInterface_UNSTABLE {
  get<T>(a: RecoilValue<T>): T;
  set<T>(s: RecoilState<T>, u: ((currVal: T) => T) | T): void;
  reset(s: RecoilState<any>): void;
}

export interface SelectorCallbackInterface {
  set: <T>(recoilVal: RecoilState<T>, newVal: T | ((prevValue: T) => T)) => void;
  reset: (recoilVal: RecoilState<any>) => void;
  refresh: (recoilValue: RecoilValue<any>) => void;
  snapshot: Snapshot;
  gotoSnapshot: (snapshot: Snapshot) => void;
  transact_UNSTABLE: (cb: (i: TransactionInterface_UNSTABLE) => void) => void;
}

export interface CallbackInterface extends SelectorCallbackInterface {}

export interface RecoilStateInfo<T> {
  loadable?: Loadable<T>;
  isActive: boolean;
  isSet: boolean;
  isModified: boolean;
  type: 'atom' | 'selector';
  deps: Iterable<RecoilValue<T>>;
  subscribers: {
    nodes: Iterable<RecoilValue<T>>;
    components: Iterable<{ name: string }>;
  };
}
