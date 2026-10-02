# Migrating a large Recoil codebase

This is a playbook for moving production apps off Recoil with `jotai-recoil-compat`. It has two phases:

1. **Swap the engine** (hours): replace `recoil` with `jotai-recoil-compat`. Your code doesn't change.
2. **Move to native Jotai** (optional, gradual): rewrite modules to Jotai's own API whenever you touch them.

Phase 1 alone gets you off an unmaintained dependency and onto React 19.

---

## Phase 1: swap the engine

### 1. Inventory

```bash
npx jotai-recoil-compat check src
```

The output lists every Recoil API you import, how many files use it, and its status:

```
Scanned for imports from 'recoil': 214 file(s), 23 distinct API(s).

  ✓              useRecoilValue (161 files)
  ✓              atom (88 files)
  ✓              selectorFamily (31 files)
  ~ note         useRecoilSnapshot (2 files) – re-renders after a microtask (batched), not synchronously with the change.
  ...
✓ Everything you use is supported.
```

`✗` entries need attention: usually a typo, an internal Recoil path, or an add-on like `recoil-sync`. Its exit code is non-zero in that case, so you can run it in CI.

### 2. Switch the dependency

**Package alias (no code changes).** In each `package.json` that depends on Recoil:

```json
{
  "dependencies": {
    "recoil": "npm:jotai-recoil-compat@^0.2.0",
    "jotai": "^2.12.0"
  }
}
```

In a monorepo, or when other libraries depend on `recoil`, add an override at the root so there is exactly one copy:

| Package manager | Root `package.json` |
| --- | --- |
| npm | `"overrides": { "recoil": "npm:jotai-recoil-compat@^0.2.0" }` |
| yarn | `"resolutions": { "recoil": "npm:jotai-recoil-compat@^0.2.0" }` |
| pnpm | `"pnpm": { "overrides": { "recoil": "npm:jotai-recoil-compat@^0.2.0" } }` |

Confirm with `npm ls recoil` (or `yarn why recoil`) that every copy resolves to `jotai-recoil-compat`.

**Or rewrite imports** with `npx jotai-recoil-compat migrate src` (add `--dry-run` first). Run it on every source root, including test and storybook directories.

> Only one copy of Jotai should be installed. If `npm ls jotai` shows several, dedupe them. Two copies of Jotai behave like two separate state containers.

### 3. Verify

1. `tsc --noEmit`. Types mirror Recoil's, so this should pass unchanged.
2. Run your unit and integration tests. `jest.mock('recoil')`, `snapshot_UNSTABLE()` and test wrappers built on `<RecoilRoot initializeState>` keep working.
3. Run your end-to-end tests, and click through the flows that use async selectors, atom effects (persistence, URL sync, websockets) and `useRecoilCallback`.

### 4. Things to review

These are the only places where behavior can differ from Recoil. Search for them first:

| Look for | Why | What to do |
| --- | --- | --- |
| Hooks rendered **without** a `<RecoilRoot>` | Recoil throws; here they use Jotai's default (global) store | Usually nothing. If you relied on the error, add a root. |
| Code that **mutates** values read from atoms | Recoil freezes values in development, so this code would already throw there | Nothing, unless you used `dangerouslyAllowMutability` and mutate on purpose: it still works, since values are never frozen. |
| `useRecoilSnapshot`, `useRecoilTransactionObserver_UNSTABLE` | Notified after a microtask (batched) | Usually nothing. Tests should `await` (for example `await act(async () => ...)`) before asserting on them. |
| Snapshots read **long after** a `useRecoilCallback` started, without destructuring `snapshot` first | The snapshot is taken on first access (or before the callback's first write) | Destructure `({ snapshot })` at the top of the callback, as most code already does. |
| Atom effects that expect to run inside Snapshots | Effects don't run for snapshot stores | Rare. Read the value from the snapshot instead. |
| `recoil-sync`, `recoil-relay` | Not included | Keep them on a branch, or replace them with atom effects / `jotai-effect`. |

### 5. Roll out

The swap is a dependency change, so roll it out like a React upgrade: a branch, a QA pass, then canary or staged release if you have one. If something looks off, the parity suite makes it easy to report: write a test in `parity/` that passes with `--project parity:recoil` and fails with `--project parity:compat`.

### Upgrading React

Once you're on `jotai-recoil-compat`, Recoil no longer blocks React 19. Upgrade React as usual.

---

## Phase 2: moving to native Jotai

Every Recoil atom and selector created by `jotai-recoil-compat` is a real Jotai atom, and `<RecoilRoot>` renders a Jotai `<Provider>`. Both APIs read and write the same state, so you can migrate one file at a time, in any order.

### Interop

```tsx
import { atom as jotaiAtom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atom, selector, useRecoilValue, useSetRecoilState } from 'recoil';

const legacy = atom({ key: 'legacy', default: 0 });   // Recoil atom (compat)
const modern = jotaiAtom(0);                           // native Jotai atom

useAtom(legacy);                 // Jotai hooks accept Recoil atoms and selectors
useRecoilValue(modern);          // Recoil hooks accept Jotai atoms
useSetRecoilState(modern);

selector({ key: 'sum', get: ({ get }) => get(legacy) + get(modern) }); // selectors read Jotai atoms
jotaiAtom((get) => get(legacy) + get(modern));                        // Jotai atoms read Recoil atoms
```

Notes:

- In native Jotai, reading an async Recoil selector with `get` returns a Promise (Jotai semantics). `useAtomValue` unwraps it and suspends, like `useRecoilValue`.
- `useResetRecoilState(jotaiAtom)` sends Jotai's `RESET`, so it works with `atomWithReset` and `atomWithStorage`.
- To share a store with existing Jotai code: `<RecoilRoot store={store}>`.

### Cheat sheet

| Recoil | Native Jotai |
| --- | --- |
| `atom({ key, default: 0 })` | `atom(0)` |
| `atom({ key, default: someSelector })` | `atomWithDefault((get) => get(someAtom))` from `jotai/utils` |
| `selector({ key, get: ({ get }) => get(a) * 2 })` | `atom((get) => get(a) * 2)` |
| `selector({ key, get, set })` | `atom(read, (get, set, newValue) => { ... })` |
| async selector | `atom(async (get) => ...)`; downstream atoms `await get(asyncAtom)` |
| `atomFamily` / `selectorFamily` | [`jotai-family`](https://github.com/jotaijs/jotai-family) `atomFamily(param => atom(...), isEqual)` |
| `useRecoilState` / `useRecoilValue` / `useSetRecoilState` | `useAtom` / `useAtomValue` / `useSetAtom` |
| `useResetRecoilState` | `atomWithReset` + `useResetAtom` from `jotai/utils` |
| `useRecoilValueLoadable`, `noWait` | `loadable(atom)` (Jotai 2) or `unwrap(atom, fallback)` from `jotai/utils` |
| `waitForAll([a, b])` | `atom((get) => Promise.all([get(a), get(b)]))` |
| atom effects | `onMount` on the atom, or [`jotai-effect`](https://github.com/jotaijs/jotai-effect) (`atomEffect`, `withAtomEffect`) |
| persistence effect | `atomWithStorage` from `jotai/utils` |
| `useRecoilCallback(({ snapshot, set }) => ...)` | `useAtomCallback(useCallback((get, set) => ..., []))` from `jotai/utils` |
| `useRecoilRefresher_UNSTABLE` | `atomWithRefresh` from `jotai/utils` |
| `<RecoilRoot>` | `<Provider>` (optional) |
| `<RecoilRoot initializeState>` | `useHydrateAtoms` from `jotai/utils`, or `store.set` on a store passed to `<Provider store>` |
| `snapshot_UNSTABLE()` in tests | `createStore()` + `store.get` / `store.set` |

Two semantic differences to keep in mind when rewriting:

1. **Async reads.** In a Recoil selector, `get(asyncSelector)` gives you the resolved value. In a Jotai atom it gives you a Promise. Make the reader `async` and `await` it.
2. **Caching.** Recoil caches selector results by dependency values (and never re-runs a selector for inputs it has seen). Jotai re-runs a derived atom when its dependencies change. If a selector does expensive work or fetches data, memoize explicitly (for example with a family keyed by the input).

### Finishing

When `npx jotai-recoil-compat check src --module=recoil` (or `--module=jotai-recoil-compat` if you used the codemod) reports no imports, remove the compatibility layer from your dependencies.
