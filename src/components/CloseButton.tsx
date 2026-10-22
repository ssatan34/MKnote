import type { MouseEventHandler, PointerEventHandler } from "react";
import "./CloseButton.css";

type CloseButtonSize = "compact" | "standard";

interface CloseButtonProps {
  "aria-label": string;
  className?: string;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  size?: CloseButtonSize;
  title?: string;
}

export function CloseButton({
  "aria-label": ariaLabel,
  className = "",
  disabled = false,
  onClick,
  onPointerDown,
  size = "compact",
  title,
}: CloseButtonProps) {
  return (
    <button
      type="button"
      className={`mk-close-button mk-close-button--${size}${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
      disabled={disabled}
      title={title}
      data-no-drag
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <span className="mk-close-button__label" aria-hidden="true">×</span>
      <span className="mk-close-button__bar mk-close-button__bar--top" aria-hidden="true" />
      <span className="mk-close-button__bar mk-close-button__bar--left" aria-hidden="true" />
      <span className="mk-close-button__bar mk-close-button__bar--right" aria-hidden="true" />
      <span className="mk-close-button__bar mk-close-button__bar--bottom" aria-hidden="true" />
    </button>
  );
}
