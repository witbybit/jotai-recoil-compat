import { createAtom } from './atom';
import { WrappedValue, isJotaiAtom } from './core';
import { createSelector } from './selector';
import { stableStringify } from './stableStringify';
import type {
  AtomFamilyOptions,
  ReadOnlySelectorFamilyOptions,
  ReadWriteSelectorFamilyOptions,
  RecoilState,
  RecoilValueReadOnly,
  SerializableParam,
} from './types';

export type AtomFamily<T, P extends SerializableParam> = (param: P) => RecoilState<T>;
export type SelectorFamily<T, P extends SerializableParam> = (param: P) => RecoilState<T>;
export type ReadOnlySelectorFamily<T, P extends SerializableParam> = (param: P) => RecoilValueReadOnly<T>;

/**
 * Recoil-compatible `atomFamily`. Members are keyed exactly like Recoil
 * (`${key}__${stableStringify(param)}`) so persisted state keeps working.
 */
export function atomFamily<T, P extends SerializableParam>(options: AtomFamilyOptions<T, P>): AtomFamily<T, P> {
  const members = new Map<string, RecoilState<T>>();
  const { key } = options;
  const effectsOption = options.effects ?? options.effects_UNSTABLE;
  return (param: P) => {
    const paramKey = stableStringify(param);
    let member = members.get(paramKey);
    if (!member) {
      const atomOptions: Record<string, unknown> = {
        key: `${key}__${paramKey}`,
        dangerouslyAllowMutability: options.dangerouslyAllowMutability,
        effects: typeof effectsOption === 'function' ? effectsOption(param) : effectsOption,
      };
      if ('default' in options) {
        const d = options.default;
        // A function default is a per-parameter factory (Recoil semantics).
        atomOptions.default = typeof d === 'function' && !isJotaiAtom(d) ? (d as (p: P) => unknown)(param) : d;
      }
      member = createAtom<T>(atomOptions as any, true);
      members.set(paramKey, member);
    }
    return member;
  };
}

/** Recoil-compatible `selectorFamily`. */
export function selectorFamily<T, P extends SerializableParam>(
  options: ReadWriteSelectorFamilyOptions<T, P>,
): SelectorFamily<T, P>;
export function selectorFamily<T, P extends SerializableParam>(
  options: ReadOnlySelectorFamilyOptions<T, P>,
): ReadOnlySelectorFamily<T, P>;
export function selectorFamily<T, P extends SerializableParam>(
  options: ReadOnlySelectorFamilyOptions<T, P> | ReadWriteSelectorFamilyOptions<T, P>,
): (param: P) => RecoilState<T> | RecoilValueReadOnly<T> {
  const members = new Map<string, RecoilState<T> | RecoilValueReadOnly<T>>();
  const { key } = options;
  const setOption = 'set' in options ? options.set : undefined;
  return (param: P) => {
    const paramKey = stableStringify(param, { allowFunctions: true });
    let member = members.get(paramKey);
    if (!member) {
      member = createSelector<T>(
        {
          key: `${key}__${paramKey}`,
          get: options.get(param),
          ...(setOption ? { set: setOption(param) } : {}),
          cachePolicy_UNSTABLE: options.cachePolicy_UNSTABLE,
          dangerouslyAllowMutability: options.dangerouslyAllowMutability,
        } as any,
        true,
      );
      members.set(paramKey, member);
    }
    return member;
  };
}

const constants = new Map<unknown, RecoilValueReadOnly<any>>();
let constantId = 0;

/** A selector that always returns the given value (Recoil's `constSelector`). */
export function constSelector<T extends SerializableParam>(constant: T): RecoilValueReadOnly<T> {
  let node = constants.get(constant);
  if (!node) {
    node = createSelector<T>({ key: `__constant__${constantId++}`, get: () => new WrappedValue(constant) }, true);
    constants.set(constant, node);
  }
  return node;
}

const errors = new Map<string, RecoilValueReadOnly<any>>();

/** A selector that always throws an Error with the given message (Recoil's `errorSelector`). */
export function errorSelector<T>(message: string): RecoilValueReadOnly<T> {
  let node = errors.get(message);
  if (!node) {
    node = createSelector<T>(
      {
        key: `__error__${stableStringify(message)}`,
        get: () => {
          throw new Error(message);
        },
      },
      true,
    );
    errors.set(message, node);
  }
  return node;
}

/** Returns a read-only view of a Recoil value (Recoil's `readOnlySelector`). */
export function readOnlySelector<T>(atom: RecoilState<T> | RecoilValueReadOnly<T>): RecoilValueReadOnly<T> {
  return atom as RecoilValueReadOnly<T>;
}
