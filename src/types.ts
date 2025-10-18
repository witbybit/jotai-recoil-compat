import type { Atom, WritableAtom } from 'jotai';

export interface RecoilState<T> extends WritableAtom<T, [T], void> {
  key: string;
}

export interface RecoilValueReadOnly<T> extends Atom<T> {
  key: string;
}

export interface AtomOptions<T> {
  key: string;
  default: T;
  effects?: Array<AtomEffect<T>>;
}

export interface SelectorOptions<T> {
  key: string;
  get: (opts: { get: <V>(atom: RecoilValueReadOnly<V>) => V }) => T | Promise<T>;
  set?: (
    opts: {
      get: <V>(atom: RecoilValueReadOnly<V>) => V;
      set: <V>(atom: RecoilState<V>, value: V) => void;
      reset: <V>(atom: RecoilState<V>) => void;
    },
    newValue: T
  ) => void;
}

export interface AtomEffect<T> {
  (opts: {
    node: RecoilState<T>;
    trigger: 'get' | 'set';
    setSelf: (value: T | ((prev: T) => T)) => void;
    onSet: (
      callback: (newValue: T, oldValue: T, isReset: boolean) => void
    ) => void;
    resetSelf: () => void;
  }): void | (() => void);
}

export type SetterOrUpdater<T> = (valOrUpdater: T | ((currVal: T) => T)) => void;
export type Resetter = () => void;
