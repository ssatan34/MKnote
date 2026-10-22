import copyCodeSvg from "../assets/icons/copy-code.svg?raw";
import confirmSvg from "../assets/icons/confirm.svg?raw";
import "./CopyFeedbackIcon.css";

function themeSvg(svg: string) {
  return svg.replace(/(fill|stroke)="#333333"/g, '$1="currentColor"');
}

export interface CopyFeedbackIconProps {
  copied?: boolean;
  size?: number;
}

export function CopyFeedbackIcon({ copied = false, size = 14 }: CopyFeedbackIconProps) {
  return (
    <span
      className={`copy-feedback-icon${copied ? " is-copied" : ""}`}
      data-copy-feedback-size={size}
      aria-hidden="true"
    >
      <span className="copy-feedback-icon__glyph copy-feedback-icon__glyph--copy" dangerouslySetInnerHTML={{ __html: themeSvg(copyCodeSvg) }} />
      <span className="copy-feedback-icon__glyph copy-feedback-icon__glyph--confirm" dangerouslySetInnerHTML={{ __html: themeSvg(confirmSvg) }} />
    </span>
  );
}

export function copyFeedbackIconSvg(size = 14): string {
  return `<span class="copy-feedback-icon" data-copy-feedback-size="${size}" aria-hidden="true"><span class="copy-feedback-icon__glyph copy-feedback-icon__glyph--copy">${themeSvg(copyCodeSvg)}</span><span class="copy-feedback-icon__glyph copy-feedback-icon__glyph--confirm">${themeSvg(confirmSvg)}</span></span>`;
}
