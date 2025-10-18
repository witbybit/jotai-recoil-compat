import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import type {
  RecoilState,
  RecoilValueReadOnly,
  SetterOrUpdater,
  Resetter,
} from "./types";

export function useRecoilState<T>(
  recoilState: RecoilState<T>,
): [T, SetterOrUpdater<T>] {
  const [value, setValue] = useAtom(recoilState);
  return [value, setValue as SetterOrUpdater<T>];
}

export function useRecoilValue<T>(
  recoilValue: RecoilState<T> | RecoilValueReadOnly<T>,
): T {
  return useAtomValue(recoilValue);
}

export function useSetRecoilState<T>(
  recoilState: RecoilState<T>,
): SetterOrUpdater<T> {
  const setter = useSetAtom(recoilState);
  return setter as SetterOrUpdater<T>;
}

export function useResetRecoilState<T>(recoilState: RecoilState<T>): Resetter {
  const setAtom = useSetAtom(recoilState);

  return useCallback(() => {
    // Get the default/initial value from the atom
    const atomWithDefault = recoilState as any;
    if (atomWithDefault.init !== undefined) {
      setAtom(atomWithDefault.init);
    } else {
      // If no init value, try to infer from the atom's read function
      // This is a limitation - in a real scenario, we'd need to track default values
      console.warn(
        `Reset called on atom "${recoilState.key}" but no default value found. ` +
          `Consider storing default values separately.`,
      );
    }
  }, [recoilState, setAtom]);
}

// Additional Recoil hooks that can be implemented

export function useRecoilStateLoadable<T>(
  recoilState: RecoilState<T>,
): [T, SetterOrUpdater<T>] {
  // Jotai handles async atoms differently
  // This is a simplified implementation
  const [value, setValue] = useAtom(recoilState);
  return [value, setValue as SetterOrUpdater<T>];
}

export function useRecoilValueLoadable<T>(
  recoilValue: RecoilState<T> | RecoilValueReadOnly<T>,
): T {
  return useAtomValue(recoilValue);
}
