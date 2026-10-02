import { atom as jotaiAtom } from 'jotai/vanilla';
import type { Atom, WritableAtom } from 'jotai/vanilla';
import {
  DefaultValue,
  EffectSet,
  NODE,
  REFRESH,
  UNSET,
  WrappedValue,
  getStoreData,
  isDefaultValue,
  isJotaiAtom,
  isPromiseLike,
  notifyStoreChange,
  recordBeforeWrite,
  registerNode,
  setOnInit,
  storeAtom,
  type AnyAtom,
  type AtomMeta,
  type RecoilNodeBase,
  type Store,
} from './core';
import { isLoadable, loadableFromRaw, type Loadable } from './Loadable';
import { loadableFromGetter, loadableFromStore, promiseFromStore, syncValueFromGetter } from './storeOps';
import { getInfoFromStore } from './info';
import type { AtomEffect, AtomOptions, RecoilState } from './types';

type Getter = <V>(a: Atom<V>) => V;

const NONE: unique symbol = Symbol('none');

/**
 * Value an atom's internal value-atom should take on its first read in a
 * store. Set by the atom's init hook (atom effects, snapshots,
 * `setUnvalidatedAtomValues`) right before that first read happens, so we
 * never have to mutate the store while Jotai is reading it.
 */
const pendingInit = new Map<AnyAtom, unknown>();
/** Value atoms currently being initialised; records whether they were read meanwhile. */
const initInProgress = new Map<AnyAtom, { read: boolean }>();

function makeValueAtom(key: string): WritableAtom<unknown, [unknown], void> {
  const valueAtom = jotaiAtom<unknown>(UNSET);
  const baseRead = valueAtom.read;
  valueAtom.read = function (this: AnyAtom, get, opts) {
    if (pendingInit.has(this)) {
      const v = pendingInit.get(this);
      pendingInit.delete(this);
      return v;
    }
    const marker = initInProgress.get(this);
    if (marker) marker.read = true;
    return baseRead.call(this, get, opts as any);
  } as typeof valueAtom.read;
  valueAtom.debugLabel = `${key}/value`;
  valueAtom.debugPrivate = true;
  return valueAtom as unknown as WritableAtom<unknown, [unknown], void>;
}

/** Resolves an atom `default` option to a raw Jotai value (possibly a promise). */
function readDefault(get: Getter, d: unknown): unknown {
  if (d instanceof WrappedValue) return d.value;
  if (isJotaiAtom(d)) return get(d);
  if (isLoadable(d)) {
    const l = d as Loadable<unknown>;
    if (l.state === 'hasValue') return l.contents;
    if (l.state === 'hasError') throw l.contents;
    return l.contents;
  }
  return d;
}

/**
 * Makes a promise the atom's (pending) value. When it resolves, and the atom
 * hasn't been changed in the meantime, the atom is set to the resolved value.
 */
function adoptPromise(
  store: Store,
  node: RecoilNodeBase,
  meta: AtomMeta,
  promise: PromiseLike<unknown>,
  effectId: object,
): Promise<unknown> {
  const p: Promise<unknown> = Promise.resolve(promise).then((resolved) => {
    if (store.get(meta.valueAtom) === p) {
      store.set(node, new EffectSet(effectId, resolved instanceof WrappedValue ? resolved : new WrappedValue(resolved)));
    }
    return isDefaultValue(resolved) ? store.get(node) : resolved;
  });
  return p;
}

const NO_EFFECT = {};

function writeAtom(
  node: RecoilNodeBase,
  meta: AtomMeta,
  get: Getter,
  set: (a: any, v: unknown) => void,
  update: unknown,
): void {
  if (update === REFRESH) return;
  let effectId: object = NO_EFFECT;
  if (update instanceof EffectSet) {
    effectId = update.effectId;
    update = update.value;
  }
  const store = get(storeAtom);
  // Jotai only runs init hooks for atoms that are read; make sure a
  // write-only atom is initialised too (effects, snapshot values...).
  if (!getStoreData(store).atoms.has(node)) initAtomInStore(node, meta, store, 'set');
  let next = update;
  if (typeof next === 'function') {
    next = (next as (prev: unknown) => unknown)(syncValueFromGetter(get, node));
  }
  let raw: unknown;
  if (next instanceof WrappedValue) {
    raw = isDefaultValue(next.value) ? UNSET : next.value;
  } else if (isDefaultValue(next)) {
    raw = UNSET;
  } else if (isPromiseLike(next)) {
    raw = adoptPromise(store, node, meta, next, effectId);
  } else {
    raw = next;
  }

  const prevRaw = get(meta.valueAtom);
  if (Object.is(prevRaw, raw)) return;

  const data = getStoreData(store);
  const handlers = data.onSet.get(node);
  const oldLoadable = handlers?.size ? loadableFromGetter(get, node) : undefined;
  recordBeforeWrite(store, node, prevRaw);
  set(meta.valueAtom, raw);
  notifyStoreChange(store);

  if (handlers?.size) {
    const newLoadable = loadableFromGetter(get, node);
    if (newLoadable.state !== 'hasValue') return;
    const oldValue = oldLoadable!.state === 'hasValue' ? oldLoadable!.contents : new DefaultValue();
    for (const h of Array.from(handlers)) {
      if (h.effectId === effectId) continue;
      try {
        h.handler(newLoadable.contents, oldValue, raw === UNSET);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

function initAtomInStore(
  node: RecoilNodeBase,
  meta: AtomMeta,
  store: Store,
  trigger: 'get' | 'set' = 'get',
): void {
  const data = getStoreData(store);
  if (data.atoms.has(node)) return;
  data.atoms.add(node);
  const { valueAtom } = meta;

  if (data.snapshotOf) {
    // Snapshot stores start from the snapshot's values and never run effects.
    pendingInit.set(valueAtom, data.snapshotOf._readInitial(node));
    return;
  }

  let initRaw: unknown = NONE;
  if (data.initValues.has(node)) {
    initRaw = data.initValues.get(node);
    data.initValues.delete(node);
  } else if (data.unvalidated.has(meta.key)) {
    initRaw = data.unvalidated.get(meta.key);
    data.unvalidated.delete(meta.key);
  }

  const effects = meta.effects as ReadonlyArray<AtomEffect<unknown>> | undefined;
  if (effects?.length && !data.released) {
    pendingInit.delete(valueAtom);
    const marker = { read: false };
    initInProgress.set(valueAtom, marker);
    let initializing = true;

    const currentForUpdater = (): unknown => {
      if (initRaw !== NONE && initRaw !== UNSET && !isPromiseLike(initRaw)) return initRaw;
      let l: Loadable<unknown>;
      try {
        l = loadableFromRaw(readDefault(store.get, meta.getDefault()));
      } catch {
        return new DefaultValue();
      }
      return l.state === 'hasValue' ? l.contents : new DefaultValue();
    };

    for (const effect of effects) {
      const effectId = {};
      const setSelf = (valOrUpdater: unknown) => {
        if (!initializing) {
          store.set(node, new EffectSet(effectId, valOrUpdater));
          return;
        }
        let v = valOrUpdater;
        if (typeof v === 'function') v = (v as (p: unknown) => unknown)(currentForUpdater());
        if (v instanceof WrappedValue) initRaw = v.value;
        else if (isDefaultValue(v)) initRaw = UNSET;
        else if (isPromiseLike(v)) initRaw = adoptPromise(store, node, meta, v, effectId);
        else initRaw = v;
      };
      try {
        const cleanup = effect({
          node: node as unknown as RecoilState<unknown>,
          storeID: data.id,
          parentStoreID_UNSTABLE: data.parentId,
          trigger,
          setSelf: setSelf as any,
          resetSelf: () => setSelf(new DefaultValue()),
          onSet: (handler) => {
            let handlers = data.onSet.get(node);
            if (!handlers) data.onSet.set(node, (handlers = new Set()));
            handlers.add({ effectId, handler: handler as any });
          },
          getPromise: (rv) => promiseFromStore(store, rv as AnyAtom),
          getLoadable: (rv) => loadableFromStore(store, rv as AnyAtom),
          getInfo_UNSTABLE: (rv) => getInfoFromStore(store, rv as AnyAtom),
        });
        if (typeof cleanup === 'function') data.cleanups.push(cleanup);
      } catch (e) {
        console.error(`[jotai-recoil-compat] Error in atom effect for "${meta.key}":`, e);
      }
    }
    initializing = false;
    initInProgress.delete(valueAtom);
    if (marker.read && initRaw !== NONE) {
      // The effect read its own atom while initialising: fall back to a set.
      store.set(valueAtom, initRaw);
      return;
    }
  }

  if (initRaw === NONE) pendingInit.delete(valueAtom);
  else pendingInit.set(valueAtom, initRaw);
}

const NEVER = new Promise<never>(() => {});

/** @internal */
export function createAtom<T>(options: AtomOptions<T>, isFamilyMember: boolean): RecoilState<T> {
  const { key } = options;
  if (typeof key !== 'string') {
    throw new Error('[jotai-recoil-compat] atom() requires a string `key`.');
  }
  const effects = options.effects ?? options.effects_UNSTABLE;
  const defaultValue: unknown = 'default' in options ? options.default : NEVER;
  const valueAtom = makeValueAtom(key);
  const meta: AtomMeta = {
    type: 'atom',
    key,
    valueAtom,
    getDefault: () => defaultValue,
    effects: effects as AtomMeta['effects'],
  };
  const node = jotaiAtom(
    (get) => {
      const raw = get(valueAtom);
      return raw === UNSET ? readDefault(get, defaultValue) : raw;
    },
    (get, set, update: unknown) => writeAtom(node as unknown as RecoilNodeBase, meta, get, set, update),
  ) as unknown as RecoilNodeBase;
  Object.assign(node, {
    key,
    [NODE]: meta,
    toJSON: () => ({ key }),
  });
  node.debugLabel = key;
  setOnInit(node, (store) => initAtomInStore(node, meta, store));
  registerNode(node, { isFamilyMember });
  return node as unknown as RecoilState<T>;
}

/**
 * Creates a Recoil-compatible atom. The returned object is a real Jotai atom,
 * so it also works with `useAtom`, `useAtomValue`, etc.
 */
export function atom<T>(options: AtomOptions<T>): RecoilState<T> {
  return createAtom(options, false);
}

/** Wrap a value so it is stored as-is (Recoil's `atom.value()`). */
atom.value = <T>(value: T): WrappedValue<T> => new WrappedValue(value);
