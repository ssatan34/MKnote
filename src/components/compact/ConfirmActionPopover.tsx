interface ConfirmActionPopoverProps {
  className: string;
  ariaLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionPopover({
  className,
  ariaLabel,
  title,
  description,
  confirmLabel,
  confirmDanger = true,
  onConfirm,
  onCancel,
}: ConfirmActionPopoverProps) {
  return (
    <div
      className={className}
      role="dialog"
      aria-label={ariaLabel}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mk-floating-popover-head">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="delete-note-confirm-actions">
        <button
          type="button"
          className={confirmDanger ? "delete-note-confirm-danger" : undefined}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
