import { PendingSignal, WrappedValue, atomId, type AnyAtom } from './core';
import type { Loadable } from './Loadable';
import { GET_LOADABLE, createSelector, type InternalGetOptions } from './selector';
import type { RecoilValue, RecoilValueReadOnly, UnwrapRecoilValueLoadables, UnwrapRecoilValues } from './types';

type Deps = ReadonlyArray<RecoilValue<any>> | Readonly<{ [key: string]: RecoilValue<any> }>;

const helperCache = new Map<string, RecoilValueReadOnly<any>>();

function depsKey(deps: Deps): { key: string; isArray: boolean; keys: string[]; list: AnyAtom[] } {
  const isArray = Array.isArray(deps);
  const keys = isArray ? [] : Object.keys(deps);
  const list = (isArray ? (deps as AnyAtom[]) : keys.map((k) => (deps as any)[k])) as AnyAtom[];
  const ids = list.map((d) => atomId(d)).join(',');
  return { key: isArray ? `[${ids}]` : `{${keys.map((k, i) => `${JSON.stringify(k)}:${list[i] && atomId(list[i])}`).join(',')}}`, isArray, keys, list };
}

function rebuild(isArray: boolean, keys: string[], values: unknown[]): any {
  if (isArray) return values;
  const out: Record<string, unknown> = {};
  keys.forEach((k, i) => (out[k] = values[i]));
  return out;
}

function helper(
  name: string,
  deps: Deps,
  compute: (loadables: Array<Loadable<unknown>>, build: (values: unknown[]) => any) => unknown,
): RecoilValueReadOnly<any> {
  const { key, isArray, keys, list } = depsKey(deps);
  const cacheKey = `${name}${key}`;
  let node = helperCache.get(cacheKey);
  if (!node) {
    node = createSelector(
      {
        key: `__${cacheKey}`,
        get: (opts) => {
          const getLoadable = (opts as unknown as InternalGetOptions)[GET_LOADABLE];
          return compute(
            list.map((d) => getLoadable(d)),
            (values) => rebuild(isArray, keys, values),
          );
        },
      },
      true,
    ) as RecoilValueReadOnly<any>;
    helperCache.set(cacheKey, node);
  }
  return node;
}

const pendingOf = (loadables: Array<Loadable<unknown>>) =>
  loadables.filter((l) => l.state === 'loading').map((l) => l.contents as Promise<unknown>);

/** Reads a value without suspending: returns a Loadable (Recoil's `noWait`). */
export function noWait<T>(dep: RecoilValue<T>): RecoilValueReadOnly<Loadable<T>> {
  // Wrapped so the Loadable is the selector's value rather than being unwrapped.
  const node = helper('noWait', [dep], (loadables) => new WrappedValue(loadables[0]));
  return node as RecoilValueReadOnly<Loadable<T>>;
}

type ArrayDeps = Array<RecoilValue<any>> | [RecoilValue<any>];
type ObjectDeps = { [key: string]: RecoilValue<any> };

/** Returns Loadables for all dependencies immediately (Recoil's `waitForNone`). */
export function waitForNone<RecoilValues extends ArrayDeps>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;
export function waitForNone<RecoilValues extends ObjectDeps>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;
export function waitForNone(deps: Deps): RecoilValueReadOnly<any> {
  return helper('waitForNone', deps, (loadables, build) => build(loadables));
}

/** Waits until at least one dependency is available; returns Loadables (Recoil's `waitForAny`). */
export function waitForAny<RecoilValues extends ArrayDeps>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;
export function waitForAny<RecoilValues extends ObjectDeps>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;
export function waitForAny(deps: Deps): RecoilValueReadOnly<any> {
  return helper('waitForAny', deps, (loadables, build) => {
    if (loadables.length > 0 && loadables.every((l) => l.state === 'loading')) {
      throw new PendingSignal(Promise.race(pendingOf(loadables)));
    }
    return build(loadables);
  });
}

/** Waits for all dependencies in parallel and returns their values (Recoil's `waitForAll`). */
export function waitForAll<RecoilValues extends ArrayDeps>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValues<RecoilValues>>;
export function waitForAll<RecoilValues extends ObjectDeps>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValues<RecoilValues>>;
export function waitForAll(deps: Deps): RecoilValueReadOnly<any> {
  return helper('waitForAll', deps, (loadables, build) => {
    const error = loadables.find((l) => l.state === 'hasError');
    if (error) throw error.contents;
    const pending = pendingOf(loadables);
    if (pending.length) throw new PendingSignal(Promise.all(pending));
    return build(loadables.map((l) => l.contents));
  });
}

/** Waits for all dependencies to settle; returns Loadables (Recoil's `waitForAllSettled`). */
export function waitForAllSettled<RecoilValues extends ArrayDeps>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;
export function waitForAllSettled<RecoilValues extends ObjectDeps>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;
export function waitForAllSettled(deps: Deps): RecoilValueReadOnly<any> {
  return helper('waitForAllSettled', deps, (loadables, build) => {
    const pending = pendingOf(loadables);
    if (pending.length) throw new PendingSignal(Promise.allSettled(pending));
    return build(loadables);
  });
}
