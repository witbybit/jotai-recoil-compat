# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-10-19

### Added
- Initial release of jotai-recoil
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

[Unreleased]: https://github.com/yourusername/jotai-recoil/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/jotai-recoil/releases/tag/v0.1.0
