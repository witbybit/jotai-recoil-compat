import { RecoilRoot, atom, selector, useRecoilState, useRecoilValue } from 'jotai-recoil-compat';

// Types
interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

type FilterType = 'all' | 'completed' | 'uncompleted';

// Atoms
const todoListState = atom<Todo[]>({
  key: 'todoListState',
  default: [],
});

const todoFilterState = atom<FilterType>({
  key: 'todoFilterState',
  default: 'all',
});

const todoIdCounterState = atom({
  key: 'todoIdCounterState',
  default: 0,
});

// Selectors
const filteredTodoListState = selector({
  key: 'filteredTodoListState',
  get: ({ get }) => {
    const filter = get(todoFilterState);
    const list = get(todoListState);

    switch (filter) {
      case 'completed':
        return list.filter((todo) => todo.completed);
      case 'uncompleted':
        return list.filter((todo) => !todo.completed);
      default:
        return list;
    }
  },
});

const todoStatsState = selector({
  key: 'todoStatsState',
  get: ({ get }) => {
    const list = get(todoListState);
    const totalNum = list.length;
    const completedNum = list.filter((todo) => todo.completed).length;
    const uncompletedNum = totalNum - completedNum;
    const percentCompleted = totalNum === 0 ? 0 : (completedNum / totalNum) * 100;

    return {
      totalNum,
      completedNum,
      uncompletedNum,
      percentCompleted,
    };
  },
});

// Components
function TodoItemCreator() {
  const [inputValue, setInputValue] = useRecoilState(atom({ key: 'todoInput', default: '' }));
  const [todoList, setTodoList] = useRecoilState(todoListState);
  const [idCounter, setIdCounter] = useRecoilState(todoIdCounterState);

  const addItem = () => {
    if (!inputValue.trim()) return;

    setTodoList([
      ...todoList,
      {
        id: idCounter,
        text: inputValue,
        completed: false,
      },
    ]);
    setIdCounter(idCounter + 1);
    setInputValue('');
  };

  return (
    <div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && addItem()}
        placeholder="Add a new todo..."
      />
      <button onClick={addItem}>Add</button>
    </div>
  );
}

function TodoItem({ todo }: { todo: Todo }) {
  const [todoList, setTodoList] = useRecoilState(todoListState);

  const toggleComplete = () => {
    setTodoList(
      todoList.map((item) =>
        item.id === todo.id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const deleteItem = () => {
    setTodoList(todoList.filter((item) => item.id !== todo.id));
  };

  return (
    <div style={{ marginBottom: '8px' }}>
      <input type="checkbox" checked={todo.completed} onChange={toggleComplete} />
      <span
        style={{
          textDecoration: todo.completed ? 'line-through' : 'none',
          marginLeft: '8px',
        }}
      >
        {todo.text}
      </span>
      <button onClick={deleteItem} style={{ marginLeft: '8px' }}>
        Delete
      </button>
    </div>
  );
}

function TodoListFilters() {
  const [filter, setFilter] = useRecoilState(todoFilterState);

  return (
    <div style={{ marginBottom: '16px' }}>
      Filter:
      <button
        onClick={() => setFilter('all')}
        style={{ fontWeight: filter === 'all' ? 'bold' : 'normal', marginLeft: '8px' }}
      >
        All
      </button>
      <button
        onClick={() => setFilter('uncompleted')}
        style={{ fontWeight: filter === 'uncompleted' ? 'bold' : 'normal', marginLeft: '8px' }}
      >
        Uncompleted
      </button>
      <button
        onClick={() => setFilter('completed')}
        style={{ fontWeight: filter === 'completed' ? 'bold' : 'normal', marginLeft: '8px' }}
      >
        Completed
      </button>
    </div>
  );
}

function TodoListStats() {
  const stats = useRecoilValue(todoStatsState);

  return (
    <div style={{ marginBottom: '16px', padding: '8px', backgroundColor: '#f0f0f0' }}>
      <h3>Stats</h3>
      <p>Total: {stats.totalNum}</p>
      <p>Completed: {stats.completedNum}</p>
      <p>Uncompleted: {stats.uncompletedNum}</p>
      <p>Percent Completed: {stats.percentCompleted.toFixed(0)}%</p>
    </div>
  );
}

function TodoList() {
  const filteredTodos = useRecoilValue(filteredTodoListState);

  return (
    <div>
      {filteredTodos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </div>
  );
}

// App
export default function App() {
  return (
    <RecoilRoot>
      <div style={{ padding: '20px', maxWidth: '600px' }}>
        <h1>jotai-recoil-compat Todo List Example</h1>
        <TodoListStats />
        <TodoListFilters />
        <TodoItemCreator />
        <TodoList />
      </div>
    </RecoilRoot>
  );
}
