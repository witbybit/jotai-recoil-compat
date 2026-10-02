/** Helpers that operate on Recoil values within a given Jotai store / getter / setter. */
import type { Atom } from 'jotai/vanilla';
import {
  DefaultValue,
  getMeta,
  isDefaultValue,
  isPromiseLike,
  isRecoilNode,
  JOTAI_RESET,
  REFRESH,
  type AnyAtom,
  type Store,
} from './core';
import { loadableFromRaw, loadableWithError, loadableWithPromise, type Loadable } from './Loadable';

type Getter = <V>(a: Atom<V>) => V;
type Setter = (a: any, ...args: any[]) => any;

export function loadableFromGetter<T>(get: Getter, rv: AnyAtom): Loadable<T> {
  let raw: unknown;
  try {
    raw = get(rv);
  } catch (e) {
    return isPromiseLike(e) ? loadableWithPromise(e as Promise<T>) : loadableWithError(e);
  }
  return loadableFromRaw<T>(raw);
}

export function loadableFromStore<T>(store: Store, rv: AnyAtom): Loadable<T> {
  return loadableFromGetter<T>(store.get, rv);
}

export function promiseFromStore<T>(store: Store, rv: AnyAtom): Promise<T> {
  return loadableFromStore<T>(store, rv).toPromise();
}

/** Synchronously read a value, throwing if it is pending (used by setters/transactions). */
export function syncValueFromGetter<T>(get: Getter, rv: AnyAtom): T {
  const l = loadableFromGetter<T>(get, rv);
  if (l.state === 'hasValue') return l.contents;
  if (l.state === 'hasError') throw l.contents;
  const key = (rv as any).key ?? String(rv);
  throw new Error(`[jotai-recoil-compat] "${key}" is pending and cannot be read synchronously here.`);
}

/** `set` that understands Recoil semantics for both Recoil nodes and plain Jotai atoms. */
export function setVia(set: Setter, rv: AnyAtom, value: unknown): void {
  if (isRecoilNode(rv)) {
    set(rv, value);
  } else if (isDefaultValue(value)) {
    set(rv, JOTAI_RESET);
  } else {
    set(rv, value);
  }
}

export function resetVia(set: Setter, rv: AnyAtom): void {
  if (isRecoilNode(rv)) {
    set(rv, new DefaultValue());
  } else {
    set(rv, JOTAI_RESET);
  }
}

/**
 * Clears the cache of a selector (and of its upstream selectors, like Recoil's
 * refresher) and forces it to re-evaluate in the given store.
 */
export function refreshInStore(store: Store, rv: AnyAtom, seen = new Set<AnyAtom>()): void {
  if (seen.has(rv)) return;
  seen.add(rv);
  const meta = getMeta(rv);
  if (!meta || meta.type !== 'selector') return;
  const upstream = Array.from(meta.deps);
  meta.clearCache();
  for (const dep of upstream) refreshInStore(store, dep, seen);
  store.set(rv as any, REFRESH);
}
