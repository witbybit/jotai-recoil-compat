# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-02

A rewrite that implements the complete public API of `recoil@0.7`, so the
package can be used as a drop-in replacement (including via
`"recoil": "npm:jotai-recoil-compat@^0.2.0"`).

### Added
- Atom defaults: Promises, selectors/atoms, Loadables, `atom.value()`, atoms without a default.
- Atom effects: `setSelf` (sync, async, updater), `resetSelf`, `onSet` (Recoil's exact call semantics), `trigger`, `storeID`, `getPromise`, `getLoadable`, `getInfo_UNSTABLE`; cleanup when a `<RecoilRoot>` unmounts.
- Selectors: async dependencies resolved like Recoil, returning Recoil values / Loadables / `selector.value()`, `getCallback`, dependency-value caching and `cachePolicy_UNSTABLE`, setter `get` reading pre-set state.
- `atomFamily`, `selectorFamily` (Recoil's key format), `constSelector`, `errorSelector`, `readOnlySelector`.
- `noWait`, `waitForAll`, `waitForAny`, `waitForNone`, `waitForAllSettled`.
- Full Loadable API and `RecoilLoadable`.
- Copy-on-write `Snapshot` / `MutableSnapshot`, `snapshot_UNSTABLE`, `useRecoilSnapshot`, `useGotoRecoilSnapshot`, `useRecoilTransactionObserver_UNSTABLE`.
- `useRecoilCallback`, `useRecoilTransaction_UNSTABLE`, `useRecoilRefresher_UNSTABLE`, `useRecoilStoreID`, `useRecoilBridgeAcrossReactRoots_UNSTABLE`, `useGetRecoilValueInfo_UNSTABLE`, `useRetain`, `retentionZone`, transition-support hook variants.
- `<RecoilRoot initializeState override>` and a `store` prop to share a Jotai store.
- `RecoilEnv`, `isRecoilValue`, `DefaultValue`, default export.
- Jotai interop: Recoil nodes are Jotai atoms; selectors and Recoil hooks accept plain Jotai atoms.
- `npx jotai-recoil-compat check` and `migrate` CLI.
- Parity test suite that runs against both this library and Recoil, plus type parity checks.
- Support for Jotai 3 and React 19.

### Changed
- Requires Jotai 2.12 or later and React 17 or later.
- Creating two nodes with the same key now creates two nodes (with Recoil's duplicate-key warning) instead of returning the first one, so hot module replacement picks up new selector code.

## [0.1.0] - 2025-10-19

### Added
- Initial release
- `atom()` function with Recoil-compatible API
- `selector()` function for derived state
- `useRecoilState()` hook
- `useRecoilValue()` hook
- `useSetRecoilState()` hook
- `useResetRecoilState()` hook
- `RecoilRoot` component
- TypeScript type definitions
- Unit tests for core functionality
- Example implementations (counter and todo list)
- Comprehensive documentation

### Known Limitations
- Atom effects not fully implemented
- `initializeState` in RecoilRoot shows warning
- Snapshots API not implemented
- Loadable API simplified

[Unreleased]: https://github.com/witbybit/jotai-recoil-compat/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/witbybit/jotai-recoil-compat/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/witbybit/jotai-recoil-compat/releases/tag/v0.1.0
