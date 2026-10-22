import { useEffect, useRef, useState, type ChangeEventHandler } from "react";
import { Icon } from "./Icon";

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  autoComplete?: string;
  placeholder?: string;
}

const PASSWORD_REVEAL_MS = 5000;

export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const toggleVisibility = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (visible) {
      setVisible(false);
      return;
    }

    setVisible(true);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, PASSWORD_REVEAL_MS);
  };

  return (
    <label className="siyuan-settings-field">
      <span>{label}</span>
      <span className="siyuan-settings-password-input-wrap">
        <input
          className="siyuan-settings-password-input"
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          spellCheck={false}
          onChange={onChange}
        />
        <button
          type="button"
          className={"siyuan-settings-password-toggle" + (visible ? " is-visible" : "")}
          title={visible ? "隐藏密码" : "显示密码（5秒）"}
          aria-label={visible ? "隐藏密码" : "显示密码（5秒）"}
          onClick={toggleVisibility}
        >
          <span className="siyuan-settings-password-icon">
            <Icon name="eye" size={16} />
            <span className="siyuan-settings-password-slash" aria-hidden />
          </span>
        </button>
      </span>
    </label>
  );
}
