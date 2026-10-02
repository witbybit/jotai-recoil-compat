import { isRecoilNode } from './core';
import type { RecoilValue } from './types';

/** Returns true if the value is a Recoil atom or selector. */
export function isRecoilValue(x: unknown): x is RecoilValue<unknown> {
  return isRecoilNode(x);
}
