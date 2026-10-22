import { useState } from 'react';
import { quickWorkGroups } from '../utils/quickWorkGroups';
import type { QuickTodoItem } from '../utils/quickTodoModel';
import { appBridge } from '../services/appBridge';
import { AnimatedCheckbox } from './AnimatedCheckbox';
import './QuickTodoWorkGroups.css';

export function QuickTodoWorkGroups({ items, todoId }: { items: QuickTodoItem[]; todoId: string }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const open = async (item: QuickTodoItem, project: boolean) => {
    try { await appBridge.invoke('quick_todo_open_work_source', { todoId, id: item.id, project }); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <div className="quick-work-groups" aria-label="Allnote 项目待办">
    <p className="quick-work-hint">来自 Allnote，任务只读；请打开来源完成或编辑。</p>
    {error && <p className="quick-todo-error" role="alert">{error}</p>}
    {quickWorkGroups(items).map(group => <details key={group.id} data-work-project={group.id} open={!closed[group.id]}
      onToggle={event => { const next = !event.currentTarget.open; setClosed(previous => previous[group.id] === next ? previous : { ...previous, [group.id]: next }); }}>
      <summary><span>{group.name}</span><span className="quick-work-count">{group.pending} 项</span>
        <button type="button" className="quick-work-source" disabled={!group.items[0]?.allnoteWork?.projectUri} aria-label={`打开项目 ${group.name}`} title="打开 Allnote 项目主页"
          onClick={event => { event.preventDefault(); event.stopPropagation(); void open(group.items[0]!, true); }}>打开项目</button></summary>
      {group.rows.map(({ item, depth }) => <div key={item.id} data-todo-id={item.id} data-work-depth={depth}
        className={`quick-work-task${item.allnoteWork?.context ? ' quick-work-context' : ''}`} style={{ paddingLeft: 12 + depth * 16 }}>
        <AnimatedCheckbox checked={item.completed} disabled label="Allnote 同步任务只读" onChange={() => {}} size={16} />
        <div className="quick-work-content"><span className="quick-work-text">{item.text}</span>
          <div className="quick-work-meta">{item.allnoteWork?.context && <span>父任务上下文</span>}
            {item.allnoteWork?.dates.map(date => <span className="quick-work-date" key={date}>{date}</span>)}</div>
        </div>
        <button type="button" className="quick-work-source" disabled={!item.allnoteWork?.sourceUri} aria-label={`打开来源 ${item.text}`} title="打开 Allnote 来源笔记" onClick={() => { void open(item, false); }}>来源</button>
      </div>)}
    </details>)}
  </div>;
}
