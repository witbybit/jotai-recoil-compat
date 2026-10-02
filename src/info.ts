import { UNSET, getMeta, getStoreData, type AnyAtom, type RecoilNodeBase, type Store } from './core';
import { loadableFromStore } from './storeOps';
import type { RecoilStateInfo } from './types';

/** Best-effort implementation of Recoil's `getInfo_UNSTABLE`. */
export function getInfoFromStore<T>(store: Store, rv: AnyAtom): RecoilStateInfo<T> {
  const meta = getMeta(rv);
  const loadable = loadableFromStore<T>(store, rv);
  const data = getStoreData(store);
  let isSet = false;
  if (meta?.type === 'atom' && data.atoms.has(rv as RecoilNodeBase)) {
    isSet = store.get(meta.valueAtom) !== UNSET;
  }
  return {
    loadable,
    isActive: meta?.type === 'atom' ? data.atoms.has(rv as RecoilNodeBase) : true,
    isSet,
    isModified: isSet,
    type: meta?.type === 'atom' ? 'atom' : 'selector',
    deps: (meta?.type === 'selector' ? Array.from(meta.deps) : []) as any,
    subscribers: { nodes: [], components: [] },
  };
}
