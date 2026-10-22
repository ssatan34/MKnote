import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveLocalAssetUrl } from "../utils/localImages";
import { assetService } from "../services/assetService";
import "./ImageDoodleModal.css";

const PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ffffff", "#000000"];
const PRESET_WIDTHS = [
  { label: "细", value: 2 },
  { label: "中", value: 5 },
  { label: "粗", value: 12 },
];

type DrawTool = "pen" | "rect" | "ellipse" | "text" | "eraser";

function mimeFromPath(path: string): string {
  const ext = path.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "bmp": return "image/bmp";
    default: return "image/png";
  }
}

function filenameFromPath(path: string, mime: string): string {
  const candidate = path.split("?")[0]?.split("/").pop()?.trim() ?? "";
  if (candidate && /\.[a-z0-9]{2,5}$/i.test(candidate)) return candidate;
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  return `edited-image.${ext}`;
}

interface ImageDoodleModalProps {
  open: boolean;
  relPath: string | null;
  hostedUrl?: string | null;
  onClose: () => void;
  /** 保存成功后回调，传出本地路径供上层降级水印 */
  onSaved: (localRel: string) => void;
  onReupload?: (localRel: string) => void;
  /** 云图图片直接上传画布结果，不产生或覆盖本地资源 */
  onHostedSaved?: (
    hostedUrl: string,
    localRel: string | null,
    imageData: Uint8Array,
    filename: string,
  ) => Promise<void>;
  onError?: (message: string) => void;
}

export function ImageDoodleModal({
  open,
  relPath,
  hostedUrl,
  onClose,
  onSaved,
  onReupload,
  onHostedSaved,
  onError,
}: ImageDoodleModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  // 快照用于形状工具实时预览
  const snapshotRef = useRef<ImageData | null>(null);
  const drawingRef = useRef(false);
  const startPtRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const isEraserRef = useRef(false);

  const [tool, setTool] = useState<DrawTool>("pen");
  const [strokeColor, setStrokeColor] = useState(PRESET_COLORS[0]!);
  const [strokeWidth, setStrokeWidth] = useState(PRESET_WIDTHS[1]!.value);
  const [fontSize, setFontSize] = useState(24);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showUploadChip, setShowUploadChip] = useState(false);
  const [savedLocalRel, setSavedLocalRel] = useState<string | null>(null);
  const uploadChipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 文字输入浮层状态
  const [textInput, setTextInput] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { isEraserRef.current = tool === "eraser"; }, [tool]);

  const setupCanvas = useCallback(async () => {
    if (!open) return;
    const loadSrc = relPath ? await resolveLocalAssetUrl(relPath) : (hostedUrl ?? null);
    if (!loadSrc) return;
    setLoading(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("无法加载图片"));
        img.src = loadSrc;
      });
      imageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("画布未就绪，请重试");
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error("图片尺寸无效");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 不可用");
      ctx.drawImage(img, 0, 0);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
      onClose();
    } finally {
      setLoading(false);
    }
  }, [open, relPath, hostedUrl, onClose, onError]);

  useLayoutEffect(() => {
    if (!open) {
      imageRef.current = null;
      snapshotRef.current = null;
      setShowUploadChip(false);
      setSavedLocalRel(null);
      setTextInput(null);
      setTextValue("");
      return;
    }
    void setupCanvas();
  }, [open, setupCanvas]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => () => {
    if (uploadChipTimerRef.current) clearTimeout(uploadChipTimerRef.current);
  }, []);

  // 文字输入框出现后自动 focus
  useEffect(() => {
    if (textInput) textInputRef.current?.focus();
  }, [textInput]);

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
      // CSS 坐标（供文字输入框定位）
      cx: e.clientX - rect.left,
      cy: e.clientY - rect.top,
    };
  };

  const applyStrokeStyle = (ctx: CanvasRenderingContext2D) => {
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = strokeWidth * 3;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const drawShapePreview = (cur: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !snapshotRef.current || !startPtRef.current) return;
    ctx.putImageData(snapshotRef.current, 0, 0);
    const { x: sx, y: sy } = startPtRef.current;
    applyStrokeStyle(ctx);
    ctx.beginPath();
    if (tool === "rect") {
      ctx.strokeRect(sx, sy, cur.x - sx, cur.y - sy);
    } else if (tool === "ellipse") {
      const rx = Math.abs(cur.x - sx) / 2;
      const ry = Math.abs(cur.y - sy) / 2;
      const cx = sx + (cur.x - sx) / 2;
      const cy = sy + (cur.y - sy) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (tool === "rect") {
      // strokeRect already called
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (loading || saving || tool === "text") return;
    e.preventDefault();
    const pt = canvasPoint(e);
    if (!pt) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    drawingRef.current = true;
    startPtRef.current = pt;
    lastPointRef.current = pt;
    e.currentTarget.setPointerCapture(e.pointerId);

    // 形状工具：保存快照用于实时预览
    if (tool === "rect" || tool === "ellipse") {
      snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pt = canvasPoint(e);
    if (!pt) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    if (tool === "pen" || tool === "eraser") {
      if (!lastPointRef.current) return;
      applyStrokeStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      lastPointRef.current = pt;
    } else if (tool === "rect" || tool === "ellipse") {
      drawShapePreview(pt);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pt = canvasPoint(e);
    drawingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (pt && (tool === "rect" || tool === "ellipse")) {
      drawShapePreview(pt);
      snapshotRef.current = null;
    }
    lastPointRef.current = null;
    startPtRef.current = null;
  };

  // 文字工具：点击画布打开输入浮层
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "text" || loading || saving) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setTextInput({
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
      cx: e.clientX - rect.left,
      cy: e.clientY - rect.top,
    });
    setTextValue("");
  };

  const commitText = () => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      setTextValue("");
      return;
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = strokeColor;
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.fillText(textValue, textInput.x, textInput.y);
    }
    setTextInput(null);
    setTextValue("");
  };

  const resetCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !img) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    snapshotRef.current = null;
  };

  const save = async () => {
    // 提交未确认的文字
    if (textInput && textValue.trim()) commitText();
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const mime = relPath ? mimeFromPath(relPath) : mimeFromPath(hostedUrl ?? "");
      const blob = await new Promise<Blob | null>((resolve) => {
        canvasRef.current!.toBlob((b) => resolve(b), mime, mime === "image/jpeg" ? 0.92 : undefined);
      });
      if (!blob) throw new Error("导出图片失败");
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);

      if (hostedUrl && onHostedSaved) {
        await onHostedSaved(
          hostedUrl,
          relPath,
          bytes,
          filenameFromPath(relPath ?? hostedUrl, mime),
        );
        onClose();
        return;
      }
      if (hostedUrl) {
        throw new Error("云图图片编辑上传功能尚未就绪");
      }

      let finalLocalRel: string;
      if (relPath) {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        await assetService.overwriteAsset(relPath, btoa(binary));
        finalLocalRel = relPath;
      } else {
        const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
        finalLocalRel = await assetService.importClipboardImage(ext, Array.from(bytes));
        setSavedLocalRel(finalLocalRel);
      }

      // 通知上层：传出本地路径，触发 Markdown 降级（移除水印）
      onSaved(finalLocalRel);

      if (onReupload && (hostedUrl || !relPath)) {
        setShowUploadChip(true);
        if (uploadChipTimerRef.current) clearTimeout(uploadChipTimerRef.current);
        uploadChipTimerRef.current = setTimeout(() => {
          setShowUploadChip(false);
          onClose();
        }, 4500);
      } else {
        onClose();
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReupload = () => {
    const targetRel = relPath ?? savedLocalRel;
    if (!targetRel || !onReupload) return;
    setShowUploadChip(false);
    onReupload(targetRel);
    onClose();
  };

  if (!open) return null;

  // canvas 光标
  const canvasCursor =
    tool === "text" ? "text"
    : tool === "eraser" ? "cell"
    : "crosshair";

  return (
    <div className="image-doodle-backdrop" role="presentation" onClick={onClose}>
      <div
        className="image-doodle-panel"
        role="dialog"
        aria-modal="true"
        aria-label="涂鸦编辑"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 工具栏 */}
        <div className="image-doodle-toolbar">
          <div className="image-doodle-tools">

            {/* 颜色 */}
            <div className="image-doodle-colors" role="group" aria-label="颜色">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`image-doodle-color-dot${strokeColor === c ? " active" : ""}`}
                  style={{ "--dot-color": c } as React.CSSProperties}
                  title={c}
                  onClick={() => { setStrokeColor(c); }}
                />
              ))}
            </div>

            <div className="image-doodle-sep" aria-hidden="true" />

            {/* 笔宽 */}
            <div className="image-doodle-widths" role="group" aria-label="笔宽">
              {PRESET_WIDTHS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  className={`image-doodle-width-dot${strokeWidth === w.value ? " active" : ""}`}
                  title={w.label}
                  onClick={() => setStrokeWidth(w.value)}
                >
                  <span className="image-doodle-width-preview" style={{
                    width: `${w.value === 2 ? 4 : w.value === 5 ? 8 : 14}px`,
                    height: `${w.value === 2 ? 4 : w.value === 5 ? 8 : 14}px`,
                  }} />
                </button>
              ))}
            </div>

            <div className="image-doodle-sep" aria-hidden="true" />

            {/* 工具选择 */}
            <div className="image-doodle-tool-group" role="group" aria-label="工具">
              {/* 画笔 */}
              <button type="button"
                className={`image-doodle-tool-btn${tool === "pen" ? " active" : ""}`}
                title="画笔"
                onClick={() => setTool("pen")}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <path d="M12 2a1.5 1.5 0 0 1 2 2L5.5 12.5l-3 .5.5-3L12 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* 矩形 */}
              <button type="button"
                className={`image-doodle-tool-btn${tool === "rect" ? " active" : ""}`}
                title="矩形框"
                onClick={() => setTool("rect")}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <rect x="2.5" y="3.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                </svg>
              </button>

              {/* 椭圆 */}
              <button type="button"
                className={`image-doodle-tool-btn${tool === "ellipse" ? " active" : ""}`}
                title="椭圆框"
                onClick={() => setTool("ellipse")}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <ellipse cx="8" cy="8" rx="5.5" ry="4" stroke="currentColor" strokeWidth="1.3"/>
                </svg>
              </button>

              {/* 文字 */}
              <button type="button"
                className={`image-doodle-tool-btn${tool === "text" ? " active" : ""}`}
                title="文字录入"
                onClick={() => setTool("text")}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <path d="M3 4h10M8 4v9M5.5 13h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </button>

              {/* 橡皮 */}
              <button type="button"
                className={`image-doodle-tool-btn${tool === "eraser" ? " active" : ""}`}
                title="橡皮擦"
                onClick={() => setTool("eraser")}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <path d="M10.5 2.5 13.5 5.5 6.5 12.5H3.5V9.5L10.5 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                  <path d="M8 4.5 11 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* 文字工具激活时显示字号 */}
            {tool === "text" && (
              <>
                <div className="image-doodle-sep" aria-hidden="true" />
                <label className="image-doodle-fontsize-label">
                  <span>字号</span>
                  <input
                    type="number"
                    min={8}
                    max={120}
                    value={fontSize}
                    onChange={(e) => setFontSize(Math.max(8, Math.min(120, Number(e.target.value))))}
                    className="image-doodle-fontsize-input"
                  />
                </label>
              </>
            )}
          </div>

          {/* 右侧操作 */}
          <div className="image-doodle-actions">
            <button type="button" className="image-doodle-btn" onClick={onClose} disabled={saving}>取消</button>
            <button type="button" className="image-doodle-btn" onClick={resetCanvas} disabled={loading || saving}>重置</button>
            <button type="button" className="image-doodle-btn primary mk-save-button" disabled={saving || loading} onClick={() => void save()}>
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* 画布 */}
        <div className="image-doodle-canvas-wrap">
          {loading && <p className="image-doodle-loading">加载中…</p>}
          <div className="image-doodle-canvas-container">
            <canvas
              ref={canvasRef}
              className={`image-doodle-canvas${loading ? " is-loading" : ""}`}
              style={{ cursor: canvasCursor }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onClick={onCanvasClick}
            />
            {/* 文字输入浮层 */}
            {textInput && (
              <input
                ref={textInputRef}
                className="image-doodle-text-input"
                style={{
                  left: `${textInput.cx}px`,
                  top: `${textInput.cy}px`,
                  fontSize: `${fontSize * (canvasRef.current
                    ? canvasRef.current.getBoundingClientRect().width / canvasRef.current.width
                    : 1)}px`,
                  color: strokeColor,
                }}
                value={textValue}
                placeholder="输入文字…"
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitText(); }
                  if (e.key === "Escape") { setTextInput(null); setTextValue(""); }
                }}
                onBlur={commitText}
              />
            )}
          </div>
        </div>

        {/* 上传提示 chip */}
        {showUploadChip && (
          <div className="image-doodle-upload-chip" role="status">
            <span>{relPath ? "已保存本地" : "已存为本地文件"}</span>
            <button type="button" className="image-doodle-chip-upload" onClick={handleReupload}>上传图床</button>
            <button type="button" className="image-doodle-chip-dismiss" aria-label="忽略"
              onClick={() => { setShowUploadChip(false); onClose(); }}>×</button>
          </div>
        )}
      </div>
    </div>
  );
}
