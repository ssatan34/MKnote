import { useCallback, useState } from "react";
import { scriptService } from "../services/scriptService";

export interface ScriptToastState {
  msg: string;
  ok: boolean;
}

export function useScriptRunner(content: string) {
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<ScriptToastState | null>(null);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setToast(null);
    try {
      const confirmed = window.confirm(
        `即将执行以下 PowerShell 脚本：\n\n${content}\n\n脚本可能修改或删除本机数据，确认继续吗？`,
      );
      if (!confirmed) return;
      const confirmationToken = await scriptService.issueConfirmation(content);
      const result = await scriptService.run(content, confirmationToken);
      setToast({ msg: result, ok: true });
    } catch (err) {
      setToast({ msg: String(err), ok: false });
    } finally {
      setRunning(false);
      setTimeout(() => setToast(null), 5000);
    }
  }, [content, running]);

  return { running, toast, run };
}
