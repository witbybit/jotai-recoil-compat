# Contributing to jotai-recoil-compat

Thank you for your interest in contributing to jotai-recoil-compat! This document provides guidelines and instructions for contributing.

## Development Setup

```bash
git clone https://github.com/witbybit/jotai-recoil-compat.git
cd jotai-recoil-compat
npm install
npm test
```

## Project Structure

```
jotai-recoil-compat/
├── src/
│   ├── core.ts            # Sentinels, node metadata, per-store bookkeeping, promise tracking
│   ├── atom.ts            # atom() and atom effects
│   ├── selector.ts        # selector(): evaluation, async handling, setters
│   ├── selectorCache.ts   # Dependency-value cache (Recoil's selector caching)
│   ├── family.ts          # atomFamily, selectorFamily, constSelector, errorSelector
│   ├── waitFor.ts         # noWait, waitForAll/Any/None/AllSettled
│   ├── Loadable.ts        # Loadable classes and RecoilLoadable
│   ├── Snapshot.ts        # Copy-on-write snapshots, callbacks, transactions
│   ├── hooks.ts           # React hooks
│   ├── RecoilRoot.tsx     # <RecoilRoot>
│   ├── types.ts           # Public types (mirror Recoil's)
│   └── __tests__/         # Unit tests
├── parity/                # Tests run against BOTH this library and real Recoil
├── bin/                   # `check` / `migrate` CLI
└── examples/
```

## How it works

Each Recoil node is a Jotai atom. An atom keeps its explicit value in a private
"value atom" (holding a sentinel while at its default); a selector is a derived
Jotai atom that adds Recoil's semantics on top (unwrapping async dependencies,
dependency-value caching, Loadable/RecoilValue return values). Store-specific
work (atom effects, snapshots, `getCallback`) uses Jotai's per-store init hook
(`INTERNAL_onInit` / `unstable_onInit`).

## Development Workflow

### Making Changes

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and ensure they follow the existing code style

3. Add tests for new functionality

4. Run the checks:
   ```bash
   npm run typecheck   # also type-checks the parity files against recoil's own types
   npm test            # unit tests + parity suite against both implementations
   npm run build
   ```

### Testing

- Write tests for all new features and bug fixes.
- **Behavior that Recoil defines belongs in `parity/`.** Those tests import from
  `recoil-under-test` and run twice: against this library and against the real
  `recoil` package. A parity test must pass on both.
- Implementation details go in `src/__tests__/`.

```bash
npm test                                   # everything
npm run test:parity                        # parity suite only
npx vitest run --project parity:recoil     # check a new parity test against real Recoil
npm run test:watch
```

### Code Style

- Use TypeScript for all code
- Follow existing code formatting
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Commit Messages

Use clear and descriptive commit messages:
- `feat: Add support for atom families`
- `fix: Correct selector dependency tracking`
- `docs: Update README with new examples`
- `test: Add tests for useResetRecoilState`

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update the CHANGELOG.md if the project has one
3. Ensure all tests pass
4. Update documentation for any API changes
5. Submit your pull request with a clear description of the changes

## Reporting Bugs

When reporting bugs, please include:
- A clear description of the issue
- Steps to reproduce (ideally a failing test in `parity/` that passes with `--project parity:recoil`)
- Expected behavior
- Actual behavior
- Environment details (Node version, React version, etc.)

## Feature Requests

Feature requests are welcome! Please:
- Check if the feature already exists or is planned
- Provide a clear use case
- Explain how it would benefit users
- Consider if it fits the library's scope

## Questions?

Feel free to open an issue for questions or discussions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
