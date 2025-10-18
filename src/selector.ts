import { atom as jotaiAtom } from 'jotai';
import type { SelectorOptions, RecoilState, RecoilValueReadOnly } from './types';

const selectorRegistry = new Map<string, RecoilState<any> | RecoilValueReadOnly<any>>();

export function selector<T>(
  options: SelectorOptions<T>
): RecoilState<T> | RecoilValueReadOnly<T> {
  const { key, get: getFunc, set: setFunc } = options;

  // Check if selector with this key already exists
  if (selectorRegistry.has(key)) {
    return selectorRegistry.get(key)!;
  }

  if (setFunc) {
    // Create a writable derived atom (read-write selector)
    const derivedAtom = jotaiAtom(
      (get) => {
        // Wrap jotai's get to match Recoil's API
        return getFunc({ get: (atom) => get(atom) });
      },
      (get, set, newValue: T) => {
        // Wrap jotai's get and set to match Recoil's API
        setFunc(
          {
            get: (atom) => get(atom),
            set: (atom, value) => set(atom, value),
            reset: (atom) => {
              // For reset, we need to get the default value
              // This is a simplified implementation
              const atomWithDefault = atom as any;
              if (atomWithDefault.init !== undefined) {
                set(atom, atomWithDefault.init);
              }
            },
          },
          newValue
        );
      }
    );

    const recoilSelector = Object.assign(derivedAtom, { key }) as RecoilState<T>;
    selectorRegistry.set(key, recoilSelector);
    return recoilSelector;
  } else {
    // Create a read-only derived atom (read-only selector)
    const derivedAtom = jotaiAtom((get) => {
      return getFunc({ get: (atom) => get(atom) });
    });

    const recoilSelector = Object.assign(derivedAtom, {
      key,
    }) as RecoilValueReadOnly<T>;
    selectorRegistry.set(key, recoilSelector);
    return recoilSelector;
  }
}

export function getSelectorByKey(
  key: string
): RecoilState<any> | RecoilValueReadOnly<any> | undefined {
  return selectorRegistry.get(key);
}

export function clearSelectorRegistry(): void {
  selectorRegistry.clear();
}
