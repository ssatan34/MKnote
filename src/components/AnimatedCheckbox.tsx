import type { CSSProperties, ChangeEvent } from "react";
import "./AnimatedCheckbox.css";

interface AnimatedCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  size?: number;
}

const CHECKBOX_PATH = "M 0 16 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 16 L 32 48 L 64 16 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 16";

export function AnimatedCheckbox({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
  size = 24,
}: AnimatedCheckboxProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  const style = { "--mk-checkbox-size": `${size}px` } as CSSProperties;

  return (
    <label className={`mk-animated-checkbox ${className}`.trim()} style={style}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        title={label}
        onChange={handleChange}
      />
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d={CHECKBOX_PATH} pathLength="575.0541381835938" className="mk-animated-checkbox-path" />
      </svg>
    </label>
  );
}
