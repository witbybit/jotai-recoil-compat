/**
 * Typical typed Recoil application code. Type-checked against both `recoil`
 * and `jotai-recoil-compat` to make sure existing code compiles unchanged.
 * (Never executed.)
 */
import type { FC } from 'react';
import {
  DefaultValue,
  RecoilRoot,
  atom,
  atomFamily,
  noWait,
  selector,
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
  useSetRecoilState,
  waitForAll,
  type AtomEffect,
  type Loadable,
  type RecoilState,
  type RecoilValue,
  type SerializableParam,
  type SetterOrUpdater,
  type Snapshot,
} from 'recoil-under-test';

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

const persist =
  <T,>(storageKey: string): AtomEffect<T> =>
  ({ setSelf, onSet, trigger }) => {
    if (trigger === 'get') {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) setSelf(JSON.parse(raw) as T);
    }
    onSet((newValue, _oldValue, isReset) => {
      if (isReset) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(newValue));
    });
  };

export const todoListState = atom<Todo[]>({
  key: 'types/todoList',
  default: [],
  effects: [persist<Todo[]>('todos')],
});

export const filterState = atom<'all' | 'done' | 'open'>({ key: 'types/filter', default: 'all' });

export const filteredTodos = selector<Todo[]>({
  key: 'types/filtered',
  get: ({ get }) => {
    const filter = get(filterState);
    const list = get(todoListState);
    return filter === 'all' ? list : list.filter((t) => t.done === (filter === 'done'));
  },
});

export const userQuery = selectorFamily<{ id: string; name: string }, string>({
  key: 'types/user',
  get: (id) => async () => {
    const res = await fetch(`/users/${id}`);
    return (await res.json()) as { id: string; name: string };
  },
});

type Params = { page: number; tags: readonly string[] } & SerializableParam;
export const pageState = atomFamily<number[], Params>({ key: 'types/page', default: () => [] });

export const todoById = selectorFamily<Todo | undefined, string>({
  key: 'types/todoById',
  get:
    (id) =>
    ({ get }) =>
      get(todoListState).find((t) => t.id === id),
  set:
    (id) =>
    ({ set, reset }, newValue) => {
      if (newValue instanceof DefaultValue) {
        reset(todoListState);
        return;
      }
      set(todoListState, (prev) => prev.map((t) => (t.id === id && newValue ? newValue : t)));
    },
});

export const summary = selector({
  key: 'types/summary',
  get: ({ get }) => {
    const [todos, filter] = get(waitForAll([todoListState, filterState]));
    const n: number = todos.length;
    const f: string = filter;
    const maybeUser: Loadable<{ id: string; name: string }> = get(noWait(userQuery('1')));
    return { n, f, user: maybeUser.valueMaybe()?.name };
  },
});

export function useToggle(state: RecoilState<boolean>): [boolean, () => void] {
  const [value, setValue] = useRecoilState(state);
  return [value, () => setValue((v) => !v)];
}

export function readAny<T>(rv: RecoilValue<T>): T {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useRecoilValue(rv);
}

export const TodoItem: FC<{ id: string; onRename: SetterOrUpdater<string> }> = ({ id }) => {
  const todo = useRecoilValue(todoById(id));
  const setTodos = useSetRecoilState(todoListState);
  const user = useRecoilValueLoadable(userQuery(id));
  const label = user.state === 'hasValue' ? user.contents.name : user.state === 'loading' ? '…' : 'error';
  const logSnapshot = useRecoilCallback(
    ({ snapshot, set }) =>
      async (prefix: string): Promise<number> => {
        const list = await snapshot.getPromise(todoListState);
        set(filterState, 'all');
        return prefix.length + list.length;
      },
    [],
  );
  const p: Promise<number> = logSnapshot('x');
  void p;
  return (
    <div onClick={() => setTodos((prev) => prev.filter((t) => t.id !== id))}>
      {todo?.title} {label}
    </div>
  );
};

export const App: FC = () => (
  <RecoilRoot initializeState={({ set }) => set(filterState, 'open')}>
    <TodoItem id="1" onRename={() => {}} />
  </RecoilRoot>
);

export function inspect(snapshot: Snapshot): number {
  return snapshot.getLoadable(todoListState).valueOrThrow().length;
}
