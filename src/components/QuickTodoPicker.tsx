import type { QuickTodoDefinition } from "../utils/quickTodoRegistry";
import "./QuickTodoPicker.css";

interface QuickTodoPickerProps {
  todos: QuickTodoDefinition[];
  loading: boolean;
  error: string | null;
  onOpen: (todo: QuickTodoDefinition) => void;
}

export function QuickTodoPicker({ todos, loading, error, onOpen }: QuickTodoPickerProps) {
  return <div className="quick-todo-picker" role="menu" aria-label="选择 Quick Todo">
    <div className="quick-todo-picker-header"><span>选择 Todo</span></div>
    {error && <p className="quick-todo-picker-error">{error}</p>}
    {loading ? <p className="quick-todo-picker-empty">加载中…</p> : <div className="quick-todo-picker-list">
      {todos.map((todo) => <button type="button" role="menuitem" className="quick-todo-picker-item" key={todo.id} onClick={() => onOpen(todo)}>
        <span className="quick-todo-picker-item-name">{todo.name}</span>
      </button>)}
    </div>}
  </div>;
}
