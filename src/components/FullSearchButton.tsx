import type { MouseEventHandler } from "react";
import { Icon } from "./Icon";
import "./FullSearchButton.css";

interface FullSearchButtonProps {
  open: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export function FullSearchButton({ open, onClick }: FullSearchButtonProps) {
  return (
    <button
      type="button"
      className={`full-search-toggle${open ? " active" : ""}`}
      title="全文搜索 (Ctrl+P)"
      aria-label="全文搜索"
      aria-expanded={open}
      onClick={onClick}
    >
      <Icon name="search_all" size={16} />
      <svg className="full-search-toggle__target" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path className="full-search-toggle__document" d="M20 13.5V3C20 2.44771 19.5523 2 19 2H5C4.44772 2 4 2.44771 4 3V21C4 21.5523 4.44772 22 5 22H10.5" />
        <path className="full-search-toggle__heading" d="M8.5 6H15.5" />
        <g className="full-search-toggle__lens">
          <path d="M19.5 22L16.0355 18.5355M16.0355 18.5355C16.9404 17.6307 17.5 16.3807 17.5 15C17.5 12.2386 15.2614 10 12.5 10C9.73858 10 7.5 12.2386 7.5 15C7.5 17.7614 9.73858 20 12.5 20C13.8807 20 15.1307 19.4404 16.0355 18.5355Z" />
        </g>
      </svg>
    </button>
  );
}
