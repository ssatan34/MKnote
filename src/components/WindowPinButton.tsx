import type { MouseEventHandler, PointerEventHandler } from "react";
import { Icon } from "./Icon";
import "./WindowPinButton.css";

interface WindowPinButtonProps {
  className?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  pinned: boolean;
}

export function WindowPinButton({ className = "", onClick, onPointerDown, pinned }: WindowPinButtonProps) {
  const label = pinned ? "取消置顶" : "置顶窗口";
  return (
    <button
      type="button"
      className={`window-pin-button${pinned ? " pinned" : ""}${className ? ` ${className}` : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={pinned}
      data-no-drag
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <span className="window-pin-button__icon window-pin-button__icon--open" aria-hidden="true">
        <Icon name="window_pin_open" size={16} />
      </span>
      <span className="window-pin-button__icon window-pin-button__icon--closed" aria-hidden="true">
        <Icon name="window_pin_closed" size={16} />
      </span>
    </button>
  );
}
