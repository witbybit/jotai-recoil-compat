import { isPromiseLike, trackPromise } from './core';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOADABLE: unique symbol = Symbol.for('jotai-recoil-compat/loadable');

abstract class BaseLoadable<T> {
  readonly [LOADABLE] = true;
  abstract readonly state: 'hasValue' | 'hasError' | 'loading';
  abstract readonly contents: any;
  /** @internal raw value this loadable was computed from (hook memoisation) */
  _raw?: unknown;

  getValue(): T {
    throw new Error('not implemented');
  }
  toPromise(): Promise<T> {
    throw new Error('not implemented');
  }
  valueMaybe(): T | undefined {
    return undefined;
  }
  valueOrThrow(): T {
    throw new Error(`Loadable expected value, but in "${this.state}" state`);
  }
  errorMaybe(): any {
    return undefined;
  }
  errorOrThrow(): any {
    throw new Error(`Loadable expected error, but in "${this.state}" state`);
  }
  promiseMaybe(): Promise<T> | undefined {
    return undefined;
  }
  promiseOrThrow(): Promise<T> {
    throw new Error(`Loadable expected promise, but in "${this.state}" state`);
  }
  is(other: Loadable<any>): boolean {
    return other.state === this.state && other.contents === this.contents;
  }
  abstract map<S>(map: (from: T) => Loadable<S> | Promise<S> | S): Loadable<S>;
}

export class ValueLoadable<T> extends BaseLoadable<T> {
  readonly state = 'hasValue' as const;
  readonly contents: T;
  constructor(value: T) {
    super();
    this.contents = value;
  }
  getValue(): T {
    return this.contents;
  }
  toPromise(): Promise<T> {
    return Promise.resolve(this.contents);
  }
  valueMaybe(): T {
    return this.contents;
  }
  valueOrThrow(): T {
    return this.contents;
  }
  map<S>(map: (from: T) => Loadable<S> | Promise<S> | S): Loadable<S> {
    try {
      return loadableOf(map(this.contents));
    } catch (e) {
      return isPromiseLike(e) ? (loadableWithPromise(e as Promise<any>) as any) : loadableWithError(e);
    }
  }
}

export class ErrorLoadable<T> extends BaseLoadable<T> {
  readonly state = 'hasError' as const;
  readonly contents: any;
  constructor(error: any) {
    super();
    this.contents = error;
  }
  getValue(): T {
    throw this.contents;
  }
  toPromise(): Promise<T> {
    return Promise.reject(this.contents);
  }
  errorMaybe(): any {
    return this.contents;
  }
  errorOrThrow(): any {
    return this.contents;
  }
  map<S>(): Loadable<S> {
    return this as unknown as Loadable<S>;
  }
}

export class LoadingLoadable<T> extends BaseLoadable<T> {
  readonly state = 'loading' as const;
  readonly contents: Promise<T>;
  constructor(promise: Promise<T>) {
    super();
    this.contents = promise;
  }
  getValue(): T {
    throw this.contents;
  }
  toPromise(): Promise<T> {
    return this.contents;
  }
  promiseMaybe(): Promise<T> {
    return this.contents;
  }
  promiseOrThrow(): Promise<T> {
    return this.contents;
  }
  map<S>(map: (from: T) => Loadable<S> | Promise<S> | S): Loadable<S> {
    return loadableWithPromise(
      this.contents.then((value) => {
        const next = map(value);
        if (isLoadable(next)) {
          const l = next as Loadable<S>;
          return l.state === 'hasValue' ? l.contents : l.toPromise();
        }
        return next as S | Promise<S>;
      }),
    );
  }
}

export type Loadable<T> = ValueLoadable<T> | ErrorLoadable<T> | LoadingLoadable<T>;

export function isLoadable(x: unknown): x is Loadable<any> {
  return x != null && typeof x === 'object' && (x as any)[LOADABLE] === true;
}

export function loadableWithValue<T>(value: T): Loadable<T> {
  return new ValueLoadable(value);
}

export function loadableWithError<T>(error: any): Loadable<T> {
  return new ErrorLoadable<T>(error);
}

export function loadableWithPromise<T>(promise: PromiseLike<T>): Loadable<T> {
  return new LoadingLoadable<T>(Promise.resolve(promise));
}

export function loadableLoading<T>(): Loadable<T> {
  return new LoadingLoadable<T>(new Promise(() => {}));
}

/** Converts a raw Jotai value (possibly a promise) into a Loadable, using tracked promise state. */
export function loadableFromRaw<T>(raw: unknown): Loadable<T> {
  if (isPromiseLike(raw)) {
    const st = trackPromise(raw);
    if (st.status === 'fulfilled') return new ValueLoadable(st.value as T);
    if (st.status === 'rejected') return new ErrorLoadable<T>(st.reason);
    return new LoadingLoadable<T>(Promise.resolve(raw as PromiseLike<T>));
  }
  return new ValueLoadable(raw as T);
}

function loadableOf<T>(value: Loadable<T> | Promise<T> | T): Loadable<T> {
  if (isLoadable(value)) return value as Loadable<T>;
  if (isPromiseLike(value)) return loadableWithPromise(value as Promise<T>);
  return new ValueLoadable(value as T);
}

type UnwrapLoadables<T extends any[] | { [key: string]: any }> = {
  [P in keyof T]: T[P] extends Loadable<infer V> ? V : T[P] extends Promise<infer V> ? V : T[P];
};

function loadableAll<Inputs extends any[] | { [key: string]: any }>(
  inputs: Inputs,
): Loadable<UnwrapLoadables<Inputs>> {
  const isArray = Array.isArray(inputs);
  const keys = isArray ? null : Object.keys(inputs);
  const values: any[] = isArray ? (inputs as any[]) : keys!.map((k) => (inputs as any)[k]);
  const loadables = values.map((v) => loadableOf(v));
  const build = (vals: any[]): any => {
    if (isArray) return vals;
    const out: any = {};
    keys!.forEach((k, i) => (out[k] = vals[i]));
    return out;
  };
  const error = loadables.find((l) => l.state === 'hasError');
  if (error) return loadableWithError(error.contents);
  if (loadables.every((l) => l.state === 'hasValue')) {
    return loadableWithValue(build(loadables.map((l) => l.contents)));
  }
  return loadableWithPromise(Promise.all(loadables.map((l) => l.toPromise())).then(build));
}

/** Factory helpers for Loadables (mirrors Recoil's `RecoilLoadable`). */
export const RecoilLoadable = {
  of: loadableOf,
  error: loadableWithError,
  loading: loadableLoading,
  all: loadableAll,
  isLoadable,
};

