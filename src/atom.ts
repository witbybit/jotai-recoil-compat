import { atom as jotaiAtom } from "jotai";
import type { AtomOptions, RecoilState } from "./types";

const atomRegistry = new Map<string, RecoilState<any>>();

export function atom<T>(options: AtomOptions<T>): RecoilState<T> {
  const { key, default: defaultValue, effects } = options;

  // Check if atom with this key already exists
  if (atomRegistry.has(key)) {
    return atomRegistry.get(key)!;
  }

  // Create the base jotai atom
  const baseAtom = jotaiAtom<T>(defaultValue);

  // Add the key property to make it compatible with Recoil API
  const recoilAtom = Object.assign(baseAtom, { key }) as RecoilState<T>;

  // Store in registry
  atomRegistry.set(key, recoilAtom);

  // Note: Atom effects are complex and would require more sophisticated handling
  // For now, we provide basic atom functionality
  // Effects can be added in a future enhancement
  if (effects && effects.length > 0) {
    console.warn(
      `jotai-recoil: Atom effects are not yet supported for atom "${key}". ` +
        "Effects will be ignored. Consider using Jotai's atom lifecycle features instead.",
    );
  }

  return recoilAtom;
}

export function getAtomByKey(key: string): RecoilState<any> | undefined {
  return atomRegistry.get(key);
}

export function clearAtomRegistry(): void {
  atomRegistry.clear();
}
