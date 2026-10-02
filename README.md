# jotai-recoil-compat

**A drop-in replacement for [Recoil](https://recoiljs.org/), powered by [Jotai](https://jotai.org/).**
Keep your Recoil code exactly as it is, swap the engine underneath, and move to native Jotai later, one component at a time (or never).

```diff
  "dependencies": {
-   "recoil": "^0.7.7",
+   "recoil": "npm:jotai-recoil-compat@^0.2.0",
+   "jotai": "^3.0.0",
  }
```

That's the whole migration for most apps. No code changes.

---

## Why

Recoil has been archived and is no longer maintained. It does not work with React 19, and it won't get fixes. Rewriting a large Recoil codebase by hand is slow and risky: hundreds of atoms, selectors, families, effects and `useRecoilCallback`s, all with subtle semantics.

`jotai-recoil-compat` implements **the entire public API of `recoil@0.7`** on top of Jotai, a small, actively maintained library built on the same atomic model:

- **Same API, same behavior.** Atoms, selectors (sync and async), families, atom effects, snapshots, loadables, `waitFor*`, `useRecoilCallback`, transactions, refreshers, `initializeState`, and more.
- **Verified against Recoil itself.** A parity test suite runs the same tests against this library *and* against the real `recoil` package. Typed Recoil code is type-checked against both.
- **Built for Jotai 3 and React 19**, and still works with Jotai 2.12+ and React 17/18 if you can't upgrade those yet.
- **Smaller.** About 12 KB min+gzip *including Jotai*, versus about 25 KB for Recoil.
- **Every atom and selector is a real Jotai atom**, so you can start using Jotai APIs right away and migrate gradually.

## Migrating

Start by checking what your code uses. This scans your source and lists every Recoil API it imports, with its support status:

```bash
npx jotai-recoil-compat check src
```

Then pick one of the three options below.

### Option A: package alias, no code changes (recommended)

Point the `recoil` package name at this library and add `jotai`:

```bash
npm install recoil@npm:jotai-recoil-compat@^0.2.0 jotai
# yarn add recoil@npm:jotai-recoil-compat@^0.2.0 jotai
# pnpm add recoil@npm:jotai-recoil-compat@^0.2.0 jotai
```

Every `import ... from 'recoil'` in your app, your tests and your `jest.mock('recoil')` calls now resolves to `jotai-recoil-compat`. TypeScript types come along too.

If other packages in your tree depend on `recoil` (for example in a monorepo, or libraries like `recoil-persist`), force them onto the same copy with an override:

```jsonc
// package.json
{
  "overrides": { "recoil": "npm:jotai-recoil-compat@^0.2.0" },          // npm
  "resolutions": { "recoil": "npm:jotai-recoil-compat@^0.2.0" },         // yarn
  "pnpm": { "overrides": { "recoil": "npm:jotai-recoil-compat@^0.2.0" } } // pnpm
}
```

### Option B: rewrite the imports (codemod)

If you'd rather have the new package name in your source:

```bash
npm install jotai-recoil-compat jotai
npx jotai-recoil-compat migrate src --dry-run   # preview
npx jotai-recoil-compat migrate src             # rewrite
npm uninstall recoil
```

The codemod rewrites `import`/`export ... from 'recoil'`, `require('recoil')`, dynamic `import('recoil')` and `jest.mock`/`vi.mock`/`requireActual('recoil')`. It touches nothing else and skips `node_modules`, `dist` and `build`.

### Option C: bundler alias

<details>
<summary>Vite, webpack, Jest, TypeScript</summary>

```ts
// vite.config.ts
export default defineConfig({ resolve: { alias: { recoil: 'jotai-recoil-compat' } } });

// webpack.config.js
module.exports = { resolve: { alias: { recoil: 'jotai-recoil-compat' } } };

// jest.config.js
module.exports = { moduleNameMapper: { '^recoil$': 'jotai-recoil-compat' } };

// tsconfig.json
{ "compilerOptions": { "paths": { "recoil": ["./node_modules/jotai-recoil-compat"] } } }
```

</details>

For a step-by-step plan for large codebases (rollout, testing, known differences, moving to native Jotai), see **[MIGRATION.md](./MIGRATION.md)**.

## API coverage

Everything exported by `recoil@0.7.7` is exported here, with the same signatures and types.

| Area | APIs | Status |
| --- | --- | --- |
| Core | `atom`, `selector` (sync, async, writable), `atom.value`, `selector.value`, `DefaultValue`, `isRecoilValue` | ✅ |
| Atom defaults | values, Promises, selectors / other atoms, Loadables, `WrappedValue`; atoms without a default | ✅ |
| Atom effects | `setSelf` (sync, async, updater), `resetSelf`, `onSet`, `trigger`, `storeID`, `getPromise`, `getLoadable`, `getInfo_UNSTABLE`, cleanup on `<RecoilRoot>` unmount | ✅ |
| Selectors | async `get`, async dependencies, returning Recoil values / Loadables, `getCallback`, dependency-value caching, `cachePolicy_UNSTABLE` | ✅ |
| Families | `atomFamily`, `selectorFamily` (Recoil's exact key format: `key__{"id":1}`), `constSelector`, `errorSelector`, `readOnlySelector` | ✅ |
| Concurrency | `noWait`, `waitForAll`, `waitForAny`, `waitForNone`, `waitForAllSettled` (arrays and objects) | ✅ |
| Hooks | `useRecoilState`, `useRecoilValue`, `useSetRecoilState`, `useResetRecoilState`, `useRecoilStateLoadable`, `useRecoilValueLoadable`, `*_TRANSITION_SUPPORT_UNSTABLE` | ✅ |
| Callbacks | `useRecoilCallback` (`snapshot`, `set`, `reset`, `refresh`, `gotoSnapshot`, `transact_UNSTABLE`), `useRecoilTransaction_UNSTABLE`, `useRecoilRefresher_UNSTABLE` | ✅ |
| Snapshots | `Snapshot` (`getLoadable`, `getPromise`, `getInfo_UNSTABLE`, `map`, `asyncMap`, `getNodes_UNSTABLE`, `getID`), `MutableSnapshot`, `snapshot_UNSTABLE`, `useRecoilSnapshot`, `useGotoRecoilSnapshot`, `useRecoilTransactionObserver_UNSTABLE` | ✅ |
| Root | `<RecoilRoot initializeState override>`, `setUnvalidatedAtomValues`, `useRecoilStoreID`, `useRecoilBridgeAcrossReactRoots_UNSTABLE` | ✅ |
| Loadables | `RecoilLoadable.of/error/loading/all/isLoadable`, every Loadable method (`getValue`, `toPromise`, `valueMaybe`, `map`, ...) | ✅ |
| Misc | `RecoilEnv`, `useGetRecoilValueInfo_UNSTABLE`, `useRetain`, `retentionZone`, default export (`import Recoil from 'recoil'`) | ✅ |
| Add-ons | `recoil-sync`, `recoil-relay` | ❌ not included |

## How compatibility is verified

- **Parity suite** (`parity/`): behavioral tests written against the public Recoil API, run twice, once against this library and once against the real `recoil` package. They cover atoms, selector caching, async selectors and Suspense, loadables, families and key formats, the exact order and arguments of atom effect `onSet` calls, `initializeState` vs. effect precedence, callback snapshots, setter semantics, `waitFor*`, refreshers, transactions and snapshots.
- **Type parity**: a file of typical typed Recoil code, plus a list of every name exported from Recoil's `index.d.ts`, is type-checked against both packages.
- **Export parity**: a test asserts that every runtime export of `recoil` exists here with the same kind.
- **Matrix**: CI runs on Jotai 2.12, latest 2.x and 3.x, with React 18 and 19.

```bash
npm test             # unit tests + parity suite (both implementations)
npm run test:parity  # parity suite only
npm run typecheck    # includes type parity against recoil's own .d.ts
```

## Differences from Recoil

The goal is that code that works with Recoil works unchanged. A few internals differ by design:

- **Hooks outside a `<RecoilRoot>`** use Jotai's default store instead of throwing.
- **Values are never frozen.** Recoil deep-freezes values in development. Code that works with Recoil never mutates state, so it is unaffected; `dangerouslyAllowMutability` is accepted and ignored.
- **No retention bookkeeping.** Snapshots and atoms are garbage collected normally; `retain()`, `useRetain` and `retentionZone` are no-ops.
- **`useRecoilSnapshot` and `useRecoilTransactionObserver_UNSTABLE`** are notified after a microtask, batched, rather than synchronously.
- **Atom effects don't run inside Snapshots.** A snapshot reads the values of the store it was taken from.
- **Async selectors that are still pending** in one `<RecoilRoot>` are evaluated again if read from another root or a snapshot before they resolve (Recoil shares the in-flight request). Resolved results are shared through the selector cache, as in Recoil.
- **`getInfo_UNSTABLE`** is best effort (`subscribers` is empty). `StoreID` and `SnapshotID` are plain numbers.

`npx jotai-recoil-compat check` flags the APIs where these notes apply.

## Gradual migration to native Jotai

Recoil atoms and selectors created by this library **are Jotai atoms**, and `<RecoilRoot>` renders a Jotai `<Provider>`. So both APIs work on the same state, in the same tree:

```tsx
import { useAtom, useAtomValue } from 'jotai';
import { atom as jotaiAtom } from 'jotai';
import { atom, selector, useRecoilValue } from 'recoil'; // aliased to jotai-recoil-compat

const todosState = atom<Todo[]>({ key: 'todos', default: [] }); // existing Recoil atom
const filterAtom = jotaiAtom<'all' | 'done'>('all');           // new native Jotai atom

// A Recoil selector can read native Jotai atoms...
const visibleTodos = selector({
  key: 'visibleTodos',
  get: ({ get }) => get(todosState).filter((t) => get(filterAtom) === 'all' || t.done),
});

function TodoList() {
  const [todos, setTodos] = useAtom(todosState);  // ...and Jotai hooks accept Recoil atoms.
  const visible = useAtomValue(visibleTodos);
  // ...
}
```

To share state with existing Jotai code, pass your store: `<RecoilRoot store={myJotaiStore}>`.

A Recoil-to-Jotai cheat sheet is in [MIGRATION.md](./MIGRATION.md#moving-to-native-jotai).

## Requirements

- Jotai 3 (recommended) or Jotai 2.12+
- React 18 or 19 (React 17 works with Jotai 2)
- TypeScript 5.5+ with Jotai 3 (TypeScript 4.7+ works with Jotai 2)
- Node 22.12+ for tooling with Jotai 3 (Jotai's own requirement)

## FAQ

**DevTools?** Use [jotai-devtools](https://github.com/jotaijs/jotai-devtools). Atoms and selectors are labeled with their Recoil keys.

**SSR / Next.js?** Same as with Recoil: render `<RecoilRoot>` inside a client component. Each root gets its own store, so requests don't share state.

**Persisted state?** Family keys are built exactly like Recoil's (`${key}__${stableStringify(param)}`), so effects that persist by `node.key` keep reading and writing the same entries.

**Tests?** They keep working: `jest.mock('recoil')` and `snapshot_UNSTABLE()` are supported, and Option B's codemod rewrites mock paths too.

**Can I use it without Recoil code?** Yes, but for new code we recommend native Jotai.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports with a failing parity test (one that passes against `recoil`) are especially welcome.

## License

MIT
