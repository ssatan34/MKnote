import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppConfig } from "../types";
import { fetchAiCompletion } from "../utils/aiApi";
import type { AiAction, AiSelectionContext } from "../utils/aiContent";
import "./AiAssistPanel.css";

interface AiAssistPanelProps {
  open: boolean;
  selection: AiSelectionContext | null;
  config: AppConfig;
  onClose: () => void;
  onApply: (text: string, action: AiAction) => void;
}

const PROMPTS: Record<AiAction, string> = {
  polish: "请润色以下文本，保持原意，直接输出结果：",
  summarize: "请用一两句话总结以下文本，直接输出结果：",
  translate: "请将以下文本翻译为中文（若已是中文则译为英文），直接输出结果：",
  continue: "请续写以下文本，直接输出续写内容：",
};

const ACTIONS: Array<{ action: AiAction; label: string }> = [
  { action: "polish", label: "润色" },
  { action: "summarize", label: "摘要" },
  { action: "translate", label: "翻译" },
  { action: "continue", label: "续写" },
];

export function AiAssistPanel({
  open,
  selection,
  config,
  onClose,
  onApply,
}: AiAssistPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAbove, setOpenAbove] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchor = selection?.anchor;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useLayoutEffect(() => {
    if (!open || !anchor || !panelRef.current) return;
    const panelHeight = panelRef.current.getBoundingClientRect().height;
    setOpenAbove(anchor.bottom + panelHeight + 10 > window.innerHeight && anchor.top > panelHeight + 10);
  }, [anchor, error, open]);

  if (!open || !selection?.text.trim()) return null;

  const run = async (action: AiAction) => {
    const ai = config.ai_config;
    if (!ai?.api_url || !ai.api_token) {
      setError("请先在设置中配置 AI API");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const text = await fetchAiCompletion({
        apiUrl: ai.api_url,
        apiToken: ai.api_token,
        model: ai.model,
        prompt: `${PROMPTS[action]}\n\n${selection.text}`,
      });
      onApply(text, action);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  const left = Math.min(Math.max(anchor?.left ?? 16, 8), window.innerWidth - 360);
  const top = openAbove ? (anchor?.top ?? 16) : (anchor?.bottom ?? 16);

  return (
    <div
      ref={panelRef}
      className={`ai-assist-menu${openAbove ? " ai-assist-menu--above" : ""}`}
      role="dialog"
      aria-label="AI 文本操作"
      style={{ left, top }}
    >
      {ACTIONS.map(({ action, label }) => (
        <div key={action} className="ai-assist-action">
          <button type="button" disabled={loading} onClick={() => void run(action)}>
            <svg className="ai-assist-action-sparkle" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.187 8.096L15 5.25L15.813 8.096C16.0231 8.83114 16.4171 9.50062 16.9577 10.0413C17.4984 10.5819 18.1679 10.9759 18.903 11.186L21.75 12L18.904 12.813C18.1689 13.0231 17.4994 13.4171 16.9587 13.9577C16.4181 14.4984 16.0241 15.1679 15.814 15.903L15 18.75L14.187 15.904C13.9769 15.1689 13.5829 14.4994 13.0423 13.9587C12.5016 13.4181 11.8321 13.0241 11.097 12.814L8.25 12L11.096 11.187C11.8311 10.9769 12.5006 10.5829 13.0413 10.0423C13.5819 9.50162 13.9759 8.83214 14.186 8.097L14.187 8.096Z" />
              <path d="M6 14.25L5.741 15.285C5.59267 15.8785 5.28579 16.4206 4.85319 16.8532C4.42059 17.2858 3.87853 17.5927 3.285 17.741L2.25 18L3.285 18.259C3.87853 18.4073 4.42059 18.7142 4.85319 19.1468C5.28579 19.5794 5.59267 20.1215 5.741 20.715L6 21.75L6.259 20.715C6.40725 20.1216 6.71398 19.5796 7.14639 19.147C7.5788 18.7144 8.12065 18.4075 8.714 18.259L9.75 18L8.714 17.741C8.12065 17.5925 7.5788 17.2856 7.14639 16.853C6.71398 16.4204 6.40725 15.8784 6.259 15.285L6 14.25Z" />
              <path d="M6.5 4L6.303 4.5915C6.24777 4.75718 6.15472 4.90774 6.03123 5.03123C5.90774 5.15472 5.75718 5.24777 5.5915 5.303L5 5.5L5.5915 5.697C5.75718 5.75223 5.90774 5.84528 6.03123 5.96877C6.15472 6.09226 6.24777 6.24282 6.303 6.4085L6.5 7L6.697 6.4085C6.75223 6.24282 6.84528 6.09226 6.96877 5.96877C7.09226 5.84528 7.24282 5.75223 7.4085 5.697L8 5.5L7.4085 5.303C7.24282 5.24777 7.09226 5.15472 6.96877 5.03123C6.84528 4.90774 6.75223 4.75718 6.697 4.5915L6.5 4Z" />
            </svg>
            <span>{loading ? "处理中…" : label}</span>
          </button>
        </div>
      ))}
      {error && <p className="ai-assist-menu-error">{error}</p>}
    </div>
  );
}
