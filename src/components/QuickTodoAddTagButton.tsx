import type { ButtonHTMLAttributes } from "react";
import "./QuickTodoAddTagButton.css";

type QuickTodoAddTagButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children">;

export function QuickTodoAddTagButton({ className = "", ...buttonProps }: QuickTodoAddTagButtonProps) {
  return (
    <button type="button" className={`quick-todo-add-tag-button ${className}`.trim()} {...buttonProps}>
      <svg className="quick-todo-add-tag-button__icon" viewBox="0 0 384 512" aria-hidden="true" focusable="false">
        <path d="M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z" />
      </svg>
    </button>
  );
}
