import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import "./TitleSearchField.css";

interface TitleSearchFieldProps {
  query: string;
  onQueryChange: (value: string) => void;
  inputId?: string;
  testId?: string;
  slowMotion?: boolean;
}

export function TitleSearchField({
  query,
  onQueryChange,
  inputId = "mknote-title-search-input",
  testId = "mknote-title-search-input",
  slowMotion = false,
}: TitleSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const hasValue = query.trim().length > 0;

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`title-search-field${focused ? " is-focused" : ""}${hasValue ? " has-value" : ""}${slowMotion ? " slow-motion" : ""}`}
    >
      <input
        ref={inputRef}
        id={inputId}
        data-testid={testId}
        value={query}
        aria-label="Search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <label htmlFor={inputId}>Search</label>
      <button
        type="button"
        className="title-search-field__search"
        aria-label="Search"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.focus()}
      >
        <Icon name="search" size={15} />
      </button>
      <button
        type="button"
        className="title-search-field__clear"
        aria-label="Clear search"
        tabIndex={focused || hasValue ? 0 : -1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          onQueryChange("");
          inputRef.current?.focus();
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
