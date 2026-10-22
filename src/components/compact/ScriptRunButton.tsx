import { Icon } from "../Icon";

interface ScriptRunButtonProps {
  running: boolean;
  onRun: () => void;
}

export function ScriptRunButton({ running, onRun }: ScriptRunButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn${running ? " active" : ""}`}
      title={running ? "脚本执行中…" : "运行脚本（⚡）"}
      disabled={running}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onRun()}
    >
      <Icon name="run_script" size={16} />
    </button>
  );
}
