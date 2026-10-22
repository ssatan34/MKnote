import type { TrashEntry } from "../../types";
import { DeleteButton } from "../DeleteButton";
import { Icon } from "../Icon";

interface TrashPopoverProps {
  items: TrashEntry[];
  clearConfirm: boolean;
  onCancelClear: () => void;
  onRequestClear: () => void;
  onConfirmClear: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TrashPopover({
  items,
  clearConfirm,
  onCancelClear,
  onRequestClear,
  onConfirmClear,
  onRestore,
  onDelete,
}: TrashPopoverProps) {
  return (
    <div
      className="mk-floating-popover trash-popover"
      role="dialog"
      aria-label="回收站"
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="trash-popover-head">
        <div className="mk-floating-popover-head">
          <strong>回收站</strong>
          <span>误删可在此恢复</span>
        </div>
        {items.length > 0 &&
          (clearConfirm ? (
            <div className="trash-clear-confirm">
              <button type="button" onClick={onCancelClear}>
                取消
              </button>
              <button type="button" className="trash-clear-confirm-danger" onClick={onConfirmClear}>
                确认清空
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="popover-clear-btn trash-clear-btn"
              title="永久删除回收站内全部便签文件"
              aria-label="清空回收站"
              onClick={onRequestClear}
            >
              <Icon name="clear4" size={15} className="popover-clear-icon" />
            </button>
          ))}
      </div>
      {items.length === 0 ? (
        <p className="trash-empty">暂无已删除便签</p>
      ) : (
        <ul className="trash-list">
          {items.map((item) => (
            <li key={item.id}>
              <span title={item.title}>{item.title}</span>
              <div className="trash-item-actions">
                <button
                  type="button"
                  className="trash-restore-btn"
                  title="恢复"
                  aria-label="恢复"
                  onClick={() => onRestore(item.id)}
                >
                  <Icon name="undo" size={18} className="trash-restore-icon" />
                </button>
                <DeleteButton title="永久删除" aria-label="永久删除" onClick={() => onDelete(item.id)} iconSize={11} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
