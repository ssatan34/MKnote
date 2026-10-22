import { useId } from "react";
import type { ThemeMode } from "../types";
import { Icon } from "./Icon";
import "./ThemeToggle.css";

interface ThemeToggleProps {
  mode: ThemeMode;
  onCycle(): void;
}

const MODE_LABELS: Record<ThemeMode, string> = {
  light: "浅色主题",
  dark: "深色主题",
  system: "跟随系统",
};

export function ThemeToggle({ mode, onCycle }: ThemeToggleProps) {
  const maskId = `mk-theme-toggle-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const label = MODE_LABELS[mode];

  return (
    <button
      type="button"
      className={`mk-theme-toggle mk-theme-toggle--${mode}`}
      aria-label={`${label}，点击切换主题`}
      title={`${label}（点击切换）`}
      data-no-drag
      onClick={onCycle}
    >
      <span className="mk-theme-toggle__solar" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 20 20">
          <mask id={maskId}>
            <rect x="0" y="0" width="20" height="20" fill="white" />
            <circle className="mk-theme-toggle__mask-circle" cx="11" cy="3" r="8" fill="black" />
          </mask>
          <circle className="mk-theme-toggle__sun-moon" cx="10" cy="10" r="8" mask={`url(#${maskId})`} />
          <g className="mk-theme-toggle__rays">
            <circle cx="18" cy="10" r="1.5" />
            <circle cx="14" cy="16.928" r="1.5" />
            <circle cx="6" cy="16.928" r="1.5" />
            <circle cx="2" cy="10" r="1.5" />
            <circle cx="6" cy="3.1718" r="1.5" />
            <circle cx="14" cy="3.1718" r="1.5" />
          </g>
        </svg>
      </span>
      <span className="mk-theme-toggle__system" aria-hidden="true">
        <Icon name="theme_system" size={18} />
      </span>
    </button>
  );
}
