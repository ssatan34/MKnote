import type { PointerEventHandler } from "react";
import "./SearchTitleButton.css";

interface SearchTitleButtonProps {
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  open: boolean;
}

export function SearchTitleButton({ onPointerDown, open }: SearchTitleButtonProps) {
  return (
    <button
      type="button"
      className={`search-title-toggle${open ? " active" : ""}`}
      title="Search"
      aria-label="Search"
      aria-expanded={open}
      data-popover-trigger
      data-no-drag
      onPointerDown={onPointerDown}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path className="search-title-toggle__lens" d="M10.5 19C15.1944 19 19 15.1944 19 10.5C19 5.8056 15.1944 2 10.5 2C5.8056 2 2 5.8056 2 10.5C2 15.1944 5.8056 19 10.5 19Z" />
        <path className="search-title-toggle__scan" d="M13.3285 7.17155C12.6046 6.4477 11.6046 6 10.5 6C9.3955 6 8.3955 6.4477 7.67165 7.17155" />
        <path className="search-title-toggle__handle" d="M16.6108 16.6108L20.8534 20.8535" />
      </svg>
    </button>
  );
}
