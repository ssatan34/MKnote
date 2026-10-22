import { useState, useRef } from "react";

export default function App() {
  const [label, setLabel] = useState("devspace");
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => setEditing(false);

  return (
    <div
      className="size-full flex items-center justify-center"
      style={{ background: "#edeef4", fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div style={{ width: "min(1800px, 96vw)", display: "flex", flexDirection: "column", gap: 24, alignItems: "center" }}>
        {/* Capsule toolbar */}
        <Capsule>
          {/* === LEFT: Status area === */}
          <div style={{ display: "flex", alignItems: "center", gap: "clamp(10px, 1.8vw, 32px)", flexShrink: 0 }}>
            <CircleIcon />

            {editing ? (
              <input
                ref={inputRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#FF4A4A",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "clamp(16px, 2.6vw, 48px)",
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  caretColor: "#FF4A4A",
                  width: `${Math.max(label.length + 1, 4)}ch`,
                }}
                autoFocus
              />
            ) : (
              <span
                onDoubleClick={handleDoubleClick}
                title="Double-click to edit"
                style={{
                  color: "#FF4A4A",
                  fontSize: "clamp(16px, 2.6vw, 48px)",
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  cursor: "text",
                  userSelect: "none",
                  textShadow: "0 0 32px rgba(255,74,74,0.22)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Divider before icons */}
          <VDivider />

          {/* === RIGHT: Action icons === */}
          <div style={{ display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 16px)", paddingLeft: "clamp(12px, 2vw, 40px)" }}>
            <IconBtn label="Unlock">
              <UnlockIcon />
            </IconBtn>

            <IconBtn label="Close">
              <CloseIcon />
            </IconBtn>
          </div>
        </Capsule>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        .icon-btn svg { transition: color 0.16s ease; }
        .icon-btn:hover svg { color: #e0dff5 !important; }
        .icon-btn:active svg { color: #ffffff !important; }
        .icon-btn:hover { background: rgba(150,155,220,0.10) !important; }
      `}</style>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function Capsule({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "clamp(64px, 10vw, 180px)",
        borderRadius: "9999px",
        background: "linear-gradient(180deg, #14152b 0%, #0e0f20 50%, #0a0b18 100%)",
        boxShadow: [
          "0 24px 80px 0 rgba(0,0,24,0.62)",
          "0 8px 32px 0 rgba(0,0,40,0.42)",
          "0 2px 8px 0 rgba(0,0,20,0.38)",
          "0 0 0 1.5px rgba(120,130,180,0.28)",
        ].join(", "),
        position: "relative",
        display: "flex",
        alignItems: "center",
        padding: "0 clamp(24px, 4.2vw, 80px)",
        overflow: "hidden",
      }}
    >
      {/* Top rim highlight */}
      <div style={{
        position: "absolute", top: 0, left: "4%", right: "4%", height: "1px",
        background: "linear-gradient(90deg, transparent 0%, rgba(170,180,240,0.0) 10%, rgba(170,180,240,0.36) 40%, rgba(200,210,255,0.44) 50%, rgba(170,180,240,0.36) 60%, rgba(170,180,240,0.0) 90%, transparent 100%)",
        pointerEvents: "none",
      }} />

      {/* Inner bottom accent line */}
      <div style={{
        position: "absolute",
        bottom: "clamp(7px, 1.1vw, 18px)",
        left: "7%", right: "7%", height: "1px",
        background: "linear-gradient(90deg, transparent 0%, rgba(70,80,150,0.28) 20%, rgba(100,112,190,0.42) 50%, rgba(70,80,150,0.28) 80%, transparent 100%)",
        pointerEvents: "none",
      }} />

      {children}
    </div>
  );
}

function VDivider({ short }: { short?: boolean }) {
  return (
    <div style={{
      width: "1.5px",
      height: short ? "clamp(22px, 3.5vw, 64px)" : "clamp(28px, 4.8vw, 90px)",
      background: "rgba(120,120,160,0.26)",
      borderRadius: "9999px",
      flexShrink: 0,
    }} />
  );
}

function IconBtn({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="icon-btn"
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "50%",
        width: "clamp(32px, 4.8vw, 88px)",
        height: "clamp(32px, 4.8vw, 88px)",
        flexShrink: 0,
        transition: "background 0.16s ease",
      }}
    >
      {children}
    </button>
  );
}

function CircleIcon() {
  const size = "clamp(20px, 3vw, 52px)";
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="26" cy="26" r="20" stroke="#B9B8CF" strokeWidth="2.2" fill="none" />
    </svg>
  );
}


function UnlockIcon() {
  const size = "clamp(16px, 2.4vw, 44px)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#B9B8CF" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 7.94-.8" />
    </svg>
  );
}

function CloseIcon() {
  const size = "clamp(16px, 2.4vw, 44px)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#B9B8CF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
