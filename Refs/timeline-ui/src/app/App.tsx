import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Search } from "lucide-react";

interface Note {
  id: number;
  title: string;
  savedAt: string;
  date: string;
  dateKey: string;
  tagColor: string;
}

const NOTES: Note[] = [
  { id: 1,  title: "产品设计周会纪要",    savedAt: "09:14", date: "7月2日", dateKey: "2026-07-02", tagColor: "#f87171" },
  { id: 2,  title: "竞品分析报告草稿",     savedAt: "10:33", date: "7月2日", dateKey: "2026-07-02", tagColor: "#f87171" },
  { id: 3,  title: "用户访谈整理",         savedAt: "14:05", date: "7月2日", dateKey: "2026-07-02", tagColor: "#60a5fa" },
  { id: 4,  title: "Q3 OKR 拆解",         savedAt: "16:48", date: "7月2日", dateKey: "2026-07-02", tagColor: "#34d399" },
  { id: 5,  title: "前端架构讨论",         savedAt: "09:02", date: "7月3日", dateKey: "2026-07-03", tagColor: "#60a5fa" },
  { id: 6,  title: "API 接口设计文档",     savedAt: "11:20", date: "7月3日", dateKey: "2026-07-03", tagColor: "#60a5fa" },
  { id: 7,  title: "随手记 · 灵感碎片",   savedAt: "13:37", date: "7月3日", dateKey: "2026-07-03", tagColor: "#f59e0b" },
  { id: 8,  title: "Sprint 回顾会",       savedAt: "15:55", date: "7月3日", dateKey: "2026-07-03", tagColor: "#f87171" },
  { id: 9,  title: "设计系统色板更新",     savedAt: "08:30", date: "7月4日", dateKey: "2026-07-04", tagColor: "#a78bfa" },
  { id: 10, title: "今日工作计划",         savedAt: "09:00", date: "7月4日", dateKey: "2026-07-04", tagColor: "#34d399" },
  { id: 11, title: "新功能需求文档 v2",    savedAt: "10:17", date: "7月4日", dateKey: "2026-07-04", tagColor: "#f59e0b" },
  { id: 12, title: "代码 Review 备注",     savedAt: "14:22", date: "7月4日", dateKey: "2026-07-04", tagColor: "#60a5fa" },
  { id: 13, title: "上线 checklist",      savedAt: "16:03", date: "7月4日", dateKey: "2026-07-04", tagColor: "#f87171" },
];

const NOTE_H = 36;   // height of each note row (px)
const SEP_H  = 28;   // height of each date separator (px)
const VISIBLE_H = 300; // visible list area height (px)
const CENTER = VISIBLE_H / 2;

// Build flat item list with pre-computed y positions
type FlatItem =
  | { kind: "sep";  dateKey: string; label: string; y: number }
  | { kind: "note"; note: Note; index: number; y: number };

function buildFlatItems(): FlatItem[] {
  const items: FlatItem[] = [];
  let y = 0;
  const groupedDates = Array.from(new Set(NOTES.map(n => n.dateKey)));
  let noteIndex = 0;
  for (const dateKey of groupedDates) {
    const dayNotes = NOTES.filter(n => n.dateKey === dateKey);
    items.push({ kind: "sep", dateKey, label: dayNotes[0].date, y });
    y += SEP_H;
    for (const note of dayNotes) {
      items.push({ kind: "note", note, index: noteIndex, y });
      y += NOTE_H;
      noteIndex++;
    }
  }
  return items;
}

const FLAT = buildFlatItems();
// Map note index → y center of that note row
const NOTE_CENTERS = FLAT
  .filter((f): f is Extract<FlatItem, { kind: "note" }> => f.kind === "note")
  .map(f => f.y + NOTE_H / 2);

export default function App() {
  const [activeIndex, setActiveIndex] = useState(9);
  const [isOpen, setIsOpen] = useState(true);
  const accRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    accRef.current += e.deltaY;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const steps = Math.round(accRef.current / 55);
      if (steps !== 0) {
        setActiveIndex(prev => Math.max(0, Math.min(NOTES.length - 1, prev + steps)));
        accRef.current = 0;
      }
    });
  }, []);

  // translateY so active note's center aligns with CENTER
  const translateY = CENTER - NOTE_CENTERS[activeIndex];

  return (
    <div className="size-full flex items-center justify-center bg-[#1a1a2e]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: 480,
              background: "rgba(20, 20, 32, 0.97)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
              backdropFilter: "blur(20px)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-2 px-4"
              style={{ height: 44, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Search size={13} className="text-white/30 shrink-0" />
              <span className="text-xs text-white/25 flex-1 select-none">按时间浏览笔记</span>
              <button
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center rounded-md transition-colors hover:bg-white/8"
                style={{ width: 22, height: 22 }}
              >
                <X size={12} className="text-white/30" />
              </button>
            </div>

            {/* List viewport — fixed height, overflow hidden, no scroll */}
            <div
              style={{ height: VISIBLE_H, position: "relative", overflow: "hidden" }}
              onWheel={handleWheel}
            >
              {/* Top + bottom fade masks */}
              <div
                style={{
                  position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
                  background: "linear-gradient(to bottom, rgba(20,20,32,0.92) 0%, transparent 18%, transparent 82%, rgba(20,20,32,0.92) 100%)",
                }}
              />

              {/* Center highlight bar */}
              <div
                style={{
                  position: "absolute",
                  left: 0, right: 0,
                  top: CENTER - NOTE_H / 2 - 2,
                  height: NOTE_H + 4,
                  background: "rgba(255,255,255,0.04)",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  zIndex: 1,
                  pointerEvents: "none",
                }}
              />

              {/* Vertical timeline track */}
              <div
                style={{
                  position: "absolute",
                  left: 56, top: 0, bottom: 0, width: 1,
                  background: "rgba(255,255,255,0.07)",
                  zIndex: 0, pointerEvents: "none",
                }}
              />

              {/* Animated list */}
              <motion.div
                animate={{ y: translateY }}
                transition={{ type: "spring", stiffness: 320, damping: 36, mass: 0.8 }}
                style={{ position: "absolute", left: 0, right: 0, top: 0 }}
              >
                {FLAT.map(item => {
                  if (item.kind === "sep") {
                    return (
                      <div
                        key={item.dateKey}
                        style={{ height: SEP_H, display: "flex", alignItems: "center", position: "relative", paddingLeft: 16 }}
                      >
                        {/* Diamond on timeline */}
                        <div style={{
                          position: "absolute", left: 52,
                          width: 9, height: 9,
                          borderRadius: 2,
                          transform: "rotate(45deg)",
                          background: "rgba(255,255,255,0.15)",
                          border: "1.5px solid rgba(255,255,255,0.28)",
                          zIndex: 2,
                        }} />
                        <div style={{ width: 48 }} />
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          letterSpacing: "0.12em",
                          color: "rgba(255,255,255,0.32)",
                          paddingLeft: 16, userSelect: "none",
                          textTransform: "uppercase",
                        }}>
                          {item.label}
                        </span>
                      </div>
                    );
                  }

                  const { note, index } = item;
                  const isActive = index === activeIndex;
                  const dist = Math.abs(index - activeIndex);
                  const opacity = isActive ? 1 : dist === 1 ? 0.65 : dist === 2 ? 0.38 : 0.18;

                  return (
                    <motion.div
                      key={note.id}
                      onClick={() => setActiveIndex(index)}
                      animate={{ opacity, scale: isActive ? 1 : dist === 1 ? 0.975 : 0.95 }}
                      transition={{ type: "spring", stiffness: 380, damping: 34 }}
                      style={{
                        height: NOTE_H,
                        display: "flex", alignItems: "center",
                        paddingLeft: 16, paddingRight: 16,
                        position: "relative",
                        cursor: "pointer",
                        transformOrigin: "left center",
                        userSelect: "none",
                      }}
                    >
                      {/* Colored dot on timeline */}
                      <motion.div
                        animate={{
                          width: isActive ? 10 : 7,
                          height: isActive ? 10 : 7,
                          boxShadow: isActive ? `0 0 10px ${note.tagColor}99` : "none",
                        }}
                        transition={{ type: "spring", stiffness: 380, damping: 34 }}
                        style={{
                          position: "absolute", left: 51.5,
                          borderRadius: "50%",
                          background: note.tagColor,
                          zIndex: 3,
                        }}
                      />

                      <div style={{ width: 48 }} />

                      {/* Title + time */}
                      <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, paddingLeft: 14 }}>
                        <motion.span
                          animate={{
                            fontSize: isActive ? 13.5 : 12,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.8)",
                          }}
                          transition={{ duration: 0.18 }}
                          style={{
                            flex: 1, minWidth: 0,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            letterSpacing: isActive ? "0.01em" : 0,
                          }}
                        >
                          {note.title}
                        </motion.span>

                        <motion.span
                          animate={{
                            fontSize: isActive ? 12 : 10,
                            color: isActive ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)",
                          }}
                          transition={{ duration: 0.18 }}
                          style={{
                            marginLeft: 10, flexShrink: 0,
                            fontFamily: "'SF Mono', 'Fira Code', monospace",
                            letterSpacing: "0.04em",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {note.savedAt}
                        </motion.span>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between px-4"
              style={{ height: 30, borderTop: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", letterSpacing: "0.04em" }}>
                滚动浏览 · 点击选中
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", fontVariantNumeric: "tabular-nums" }}>
                {activeIndex + 1} / {NOTES.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="text-white/40 text-sm hover:text-white/70 transition-colors"
        >
          打开笔记列表
        </button>
      )}
    </div>
  );
}
