/**
 * jotai-recoil-compat: a drop-in replacement for Recoil, implemented on Jotai.
 *
 * Every export mirrors the `recoil` package's API. Recoil atoms/selectors
 * created here are real Jotai atoms, so you can migrate to native Jotai APIs
 * one component at a time.
 */
import * as Recoil from './namespace';

export * from './namespace';

export type { Loadable, ValueLoadable, ErrorLoadable, LoadingLoadable } from './Loadable';
export type { RecoilRootProps } from './RecoilRoot';
export type { AtomFamily, SelectorFamily, ReadOnlySelectorFamily } from './family';
export type * from './types';

/** Default export, for code written as `import Recoil from 'recoil'; Recoil.atom(...)`. */
export default Recoil;
