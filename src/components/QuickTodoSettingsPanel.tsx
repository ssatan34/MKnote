import { useEffect, useRef, useState } from "react";
import { quickTodoService } from "../services/quickTodoService";
import { isLatestQuickTodoRequest } from "../utils/quickTodoModel";
import { DEFAULT_QUICK_TODO_ID, isValidQuickTodoName, MAX_QUICK_TODO_NAME_LENGTH, type QuickTodoDefinition } from "../utils/quickTodoRegistry";
import { CopyFeedbackIcon } from "./CopyFeedbackIcon";
import { DeleteButton } from "./DeleteButton";
import { QuickDataDirectorySetting } from "./QuickDataDirectorySetting";
import "./QuickTodoSettingsPanel.css";

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function QuickTodoSettingsPanel() {
  const [todos, setTodos] = useState<QuickTodoDefinition[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedTodoId, setCopiedTodoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  const reload = async () => {
    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    try {
      const next = await quickTodoService.listTodos();
      if (!isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) return;
      setTodos(next); setError(null);
    } catch (loadError) {
      if (isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) setError(errorMessage(loadError));
    } finally {
      if (isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const createTodo = async () => {
    if (!isValidQuickTodoName(newName)) { setError(`Todo 名称不能为空且不能超过 ${MAX_QUICK_TODO_NAME_LENGTH} 个字符`); return; }
    const requestVersion = ++requestVersionRef.current;
    try {
      const todo = await quickTodoService.createTodo(newName.trim());
      if (!isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) return;
      setTodos((current) => [...current, todo]); setNewName(""); setError(null);
    } catch (createError) {
      if (isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) setError(errorMessage(createError));
    }
  };

  const saveRename = async (todo: QuickTodoDefinition) => {
    if (!isValidQuickTodoName(editingName)) { setError(`Todo 名称不能为空且不能超过 ${MAX_QUICK_TODO_NAME_LENGTH} 个字符`); return; }
    const requestVersion = ++requestVersionRef.current;
    try {
      const updated = await quickTodoService.renameTodo(todo.id, editingName.trim());
      if (!isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) return;
      setTodos((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingId(null); setError(null);
    } catch (renameError) {
      if (isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) setError(errorMessage(renameError));
    }
  };

  const deleteTodo = async (todoId: string) => {
    const requestVersion = ++requestVersionRef.current;
    try {
      const next = await quickTodoService.deleteTodo(todoId);
      if (!isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) return;
      setTodos(next); setDeleteId(null); setError(null);
    } catch (deleteError) {
      if (isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) setError(errorMessage(deleteError));
    }
  };

  const copyTodoId = async (todoId: string) => {
    try {
      await navigator.clipboard.writeText(todoId);
      setCopiedTodoId(todoId);
      window.setTimeout(() => setCopiedTodoId((current) => current === todoId ? null : current), 1500);
    } catch { setCopiedTodoId(null); }
  };

  return <div className="settings-section-stack quick-todo-manager">
    <QuickDataDirectorySetting kind="todo" />
    <section className="settings-card">
      <div className="settings-card-head"><div><strong>Quick Todo</strong><span>管理独立的 Todo 及其 Markdown 数据</span></div></div>
      <div className="quick-todo-manager-create">
        <div className="quick-todo-manager-input-wrap">
          <input value={newName} maxLength={6} placeholder="新 Todo 名称" aria-label="新 Todo 名称" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createTodo(); } }} />
          <span className="quick-todo-manager-count" aria-hidden="true">{Array.from(newName).length}/{MAX_QUICK_TODO_NAME_LENGTH}</span>
        </div>
        <button type="button" className="mk-save-button" onClick={() => void createTodo()}><span>Save</span></button>
      </div>
      {error && <p className="quick-todo-manager-error">{error}</p>}
      {loading ? <p className="quick-todo-manager-muted">加载中…</p> : <div className="quick-todo-manager-list">
        {todos.map((todo) => {
          const isDefault = todo.id === DEFAULT_QUICK_TODO_ID;
          const editing = editingId === todo.id;
          return <div className={`quick-todo-manager-row${isDefault ? " is-default" : ""}`} key={todo.id}>
            {editing ? <input autoFocus value={editingName} maxLength={6} aria-label={`${todo.name} 新名称`} onChange={(event) => setEditingName(event.target.value)} onBlur={() => setEditingId(null)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveRename(todo); } if (event.key === "Escape") setEditingId(null); }} /> : <div className="quick-todo-manager-name" onDoubleClick={() => { if (!isDefault) { setEditingId(todo.id); setEditingName(todo.name); setDeleteId(null); } }} title={isDefault ? todo.name : `${todo.name}（双击重命名）`}><strong>{todo.name}</strong><span>{todo.id}</span></div>}
            {isDefault ? <span className="quick-todo-manager-badge">默认</span> : editing ? <div className="quick-todo-manager-actions"><button type="button" className="mk-save-button" onMouseDown={(event) => event.preventDefault()} onClick={() => void saveRename(todo)}><span>Save</span></button></div> : <div className="quick-todo-manager-actions"><button type="button" className="quick-todo-manager-copy" title={copiedTodoId === todo.id ? "已复制 Todo ID" : "复制 Todo ID"} aria-label={copiedTodoId === todo.id ? "已复制 Todo ID" : "复制 Todo ID"} onClick={() => void copyTodoId(todo.id)}><CopyFeedbackIcon copied={copiedTodoId === todo.id} size={16} /></button>{deleteId === todo.id ? <><DeleteButton iconSize={12} title="确认删除 Todo" aria-label="确认删除 Todo" onClick={() => void deleteTodo(todo.id)} /><button type="button" onClick={() => setDeleteId(null)}>取消</button></> : <DeleteButton iconSize={12} title="删除 Todo" aria-label="删除 Todo" onClick={() => { setEditingId(null); setDeleteId(todo.id); }} />}</div>}
          </div>;
        })}
      </div>}
      <p className="quick-todo-manager-note">默认 Todo 使用现有 Quick Todo.md，不能重命名或删除。新 Todo 名称最多 6 个字符。</p>
    </section>
  </div>;
}
