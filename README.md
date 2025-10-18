# jotai-recoil

A Recoil-compatible API wrapper over [Jotai](https://jotai.org/) for seamless migration from Recoil to Jotai.

## Why jotai-recoil?

[Recoil](https://recoiljs.org/) is no longer actively maintained, but many projects rely on it for state management. This library provides a drop-in replacement that uses Jotai under the hood while maintaining Recoil's familiar API, making migration straightforward and less risky.

## Features

- **Recoil-compatible API**: Minimal code changes required
- **Powered by Jotai**: Leverages Jotai's modern, lightweight state management
- **TypeScript support**: Full type safety out of the box
- **Tree-shakeable**: Only bundle what you use
- **Easy migration**: Gradually migrate your codebase

## Installation

```bash
npm install jotai-recoil jotai
# or
yarn add jotai-recoil jotai
# or
pnpm add jotai-recoil jotai
```

## Quick Start

### Before (Recoil)

```tsx
import { RecoilRoot, atom, selector, useRecoilState, useRecoilValue } from 'recoil';

const countState = atom({
  key: 'countState',
  default: 0,
});

const doubleCountState = selector({
  key: 'doubleCountState',
  get: ({ get }) => get(countState) * 2,
});

function App() {
  return (
    <RecoilRoot>
      <Counter />
    </RecoilRoot>
  );
}

function Counter() {
  const [count, setCount] = useRecoilState(countState);
  const doubleCount = useRecoilValue(doubleCountState);

  return (
    <div>
      <p>Count: {count}</p>
      <p>Double: {doubleCount}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
```

### After (jotai-recoil)

Simply change the import statement:

```tsx
// Change this:
// import { RecoilRoot, atom, selector, useRecoilState, useRecoilValue } from 'recoil';

// To this:
import { RecoilRoot, atom, selector, useRecoilState, useRecoilValue } from 'jotai-recoil';

// Everything else stays the same!
```

## API Reference

### Core Functions

#### `atom(options)`

Creates an atom with Recoil's API.

```tsx
import { atom } from 'jotai-recoil';

const textState = atom({
  key: 'textState',
  default: 'Hello',
});
```

#### `selector(options)`

Creates a derived state (selector) with Recoil's API.

```tsx
import { atom, selector } from 'jotai-recoil';

const countState = atom({
  key: 'countState',
  default: 0,
});

const doubleCountState = selector({
  key: 'doubleCountState',
  get: ({ get }) => get(countState) * 2,
});

// Writable selector
const incrementState = selector({
  key: 'incrementState',
  get: ({ get }) => get(countState),
  set: ({ get, set }, newValue) => {
    set(countState, newValue);
  },
});
```

### Hooks

#### `useRecoilState(state)`

Returns a tuple with the current value and a setter function.

```tsx
import { useRecoilState } from 'jotai-recoil';

function Component() {
  const [count, setCount] = useRecoilState(countState);

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
```

#### `useRecoilValue(state)`

Returns the current value of an atom or selector (read-only).

```tsx
import { useRecoilValue } from 'jotai-recoil';

function Component() {
  const count = useRecoilValue(countState);

  return <div>Count: {count}</div>;
}
```

#### `useSetRecoilState(state)`

Returns a setter function without subscribing to value changes.

```tsx
import { useSetRecoilState } from 'jotai-recoil';

function Component() {
  const setCount = useSetRecoilState(countState);

  return (
    <button onClick={() => setCount((prev) => prev + 1)}>
      Increment
    </button>
  );
}
```

#### `useResetRecoilState(state)`

Returns a function to reset the atom to its default value.

```tsx
import { useResetRecoilState } from 'jotai-recoil';

function Component() {
  const resetCount = useResetRecoilState(countState);

  return <button onClick={resetCount}>Reset</button>;
}
```

### Components

#### `<RecoilRoot>`

Provides the state context for your application.

```tsx
import { RecoilRoot } from 'jotai-recoil';

function App() {
  return (
    <RecoilRoot>
      <YourApp />
    </RecoilRoot>
  );
}
```

## Migration Guide

### Step 1: Install jotai-recoil

```bash
npm install jotai-recoil jotai
```

### Step 2: Update imports

Find and replace all Recoil imports:

```tsx
// Before
import { ... } from 'recoil';

// After
import { ... } from 'jotai-recoil';
```

### Step 3: Test your application

Run your tests and verify everything works as expected.

### Step 4: (Optional) Gradually migrate to native Jotai

Once stable, you can gradually refactor to use Jotai's native API for new features while keeping existing code unchanged.

## Known Limitations

- **Atom Effects**: Not fully implemented yet. Consider using Jotai's built-in features or creating custom hooks.
- **initializeState**: The `RecoilRoot` `initializeState` prop shows a warning. Use atom default values instead.
- **Loadable API**: Simplified implementation. Async atoms are supported but with Jotai's behavior.
- **Snapshots**: Not implemented. Use Jotai's store API if needed.

## Comparison with Recoil

| Feature | Recoil | jotai-recoil |
|---------|--------|--------------|
| Basic atoms | ✅ | ✅ |
| Selectors | ✅ | ✅ |
| Async selectors | ✅ | ✅ (Jotai behavior) |
| Atom effects | ✅ | ⚠️ Planned |
| Snapshots | ✅ | ❌ Use Jotai store |
| DevTools | ✅ | ✅ (Jotai DevTools) |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- [Jotai](https://jotai.org/) - The amazing state management library powering this wrapper
- [Recoil](https://recoiljs.org/) - The inspiration for this API design

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/yourusername/jotai-recoil/issues).
