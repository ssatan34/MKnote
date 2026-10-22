import type { QuickTodoItem, QuickTodoLink, QuickTodoTag } from "./quickTodoModel.ts";
import type { QuickTodoDefinition } from "./quickTodoRegistry.ts";
import { DEFAULT_QUICK_TODO_ID } from "./quickTodoRegistry.ts";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = (event: string, handler: () => void) => Promise<() => void>;

export function createQuickTodoService(invoke: Invoke, listen: Listen) {
  return {
    listTodos: () => invoke<QuickTodoDefinition[]>("quick_todo_registry_list"),
    createTodo: (name: string) => invoke<QuickTodoDefinition>("quick_todo_create", { name }),
    renameTodo: (todoId: string, name: string) => invoke<QuickTodoDefinition>("quick_todo_rename", { todoId, name }),
    deleteTodo: (todoId: string) => invoke<QuickTodoDefinition[]>("quick_todo_delete_todo", { todoId }),
    list: (todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_list", { todoId }),
    add: (text: string, tag: QuickTodoTag | null = null, parentId: string | null = null, todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_add", { text, tag, parentId, todoId }),
    edit: (id: string, text: string, todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_edit", { id, text, todoId }),
    setTag: (id: string, tag: QuickTodoTag | null, todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_set_tag", { id, tag, todoId }),
    setReminder: (id: string, remindAt: string | null, todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_set_reminder", { id, remindAt, todoId }),
    setLink: (id: string, link: QuickTodoLink | null, todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_set_link", { id, link, todoId }),
    toggle: (id: string, todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_toggle", { id, todoId }),
    delete: (id: string, todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_delete", { id, todoId }),
    reorder: (ids: string[], todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_reorder", { ids, todoId }),
    clearCompleted: (todoId = DEFAULT_QUICK_TODO_ID) => invoke<QuickTodoItem[]>("quick_todo_clear_completed", { todoId }),
    onChanged: (handler: () => void, todoId = DEFAULT_QUICK_TODO_ID) => listen(`mknote:quick-todo-changed:${todoId}`, handler),
    onRegistryChanged: (handler: () => void) => listen("mknote:quick-todo-registry-changed", handler),
  };
}
