import { forwardRef, type InputHTMLAttributes } from "react";
import "../styles/accent-selection-ui.css";
import "../App.css";

interface TitleInputProps extends InputHTMLAttributes<HTMLInputElement> {
  wrapperClassName?: string;
}

export const TitleInput = forwardRef<HTMLInputElement, TitleInputProps>(function TitleInput(
  { wrapperClassName = "compact-title-input-wrap", className = "compact-title", ...inputProps },
  ref,
) {
  return (
    <span className={wrapperClassName}>
      <input ref={ref} className={className} {...inputProps} />
    </span>
  );
});
