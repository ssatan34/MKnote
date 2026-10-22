import type { ScriptToastState } from "../../hooks/useScriptRunner";

interface ScriptToastProps {
  toast: ScriptToastState | null;
}

export function ScriptToast({ toast }: ScriptToastProps) {
  if (!toast) return null;
  return (
    <div className={`capture-toast script-toast${toast.ok ? " script-toast--ok" : " script-toast--err"}`}>
      {toast.msg}
    </div>
  );
}
