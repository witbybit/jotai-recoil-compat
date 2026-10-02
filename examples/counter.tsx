import { RecoilRoot, atom, selector, useRecoilState, useRecoilValue } from 'jotai-recoil-compat';

// Define atoms
const countState = atom({
  key: 'countState',
  default: 0,
});

const stepState = atom({
  key: 'stepState',
  default: 1,
});

// Define selectors
const doubleCountState = selector({
  key: 'doubleCountState',
  get: ({ get }) => {
    const count = get(countState);
    return count * 2;
  },
});

const incrementByStepState = selector({
  key: 'incrementByStepState',
  get: ({ get }) => get(countState),
  set: ({ get, set }) => {
    const step = get(stepState);
    const currentCount = get(countState);
    set(countState, currentCount + step);
  },
});

// Components
function Counter() {
  const [count, setCount] = useRecoilState(countState);
  const doubleCount = useRecoilValue(doubleCountState);

  return (
    <div>
      <h2>Counter Example</h2>
      <p>Count: {count}</p>
      <p>Double Count: {doubleCount}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={() => setCount(count - 1)}>Decrement</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}

function StepControl() {
  const [step, setStep] = useRecoilState(stepState);

  return (
    <div>
      <h3>Step Control</h3>
      <p>Step value: {step}</p>
      <button onClick={() => setStep(step + 1)}>Increase Step</button>
      <button onClick={() => setStep(Math.max(1, step - 1))}>Decrease Step</button>
    </div>
  );
}

// App
export default function App() {
  return (
    <RecoilRoot>
      <div style={{ padding: '20px' }}>
        <h1>jotai-recoil Counter Example</h1>
        <Counter />
        <StepControl />
      </div>
    </RecoilRoot>
  );
}
