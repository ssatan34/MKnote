import { useEffect, useRef, useCallback, useState } from "react";
import { CloseButton } from "./CloseButton";
import type { NoteSummary, NoteZone } from "../types";
import { libraryService } from "../services/libraryService";
import { notesService } from "../services/notesService";
import "./TimelineView.css";

const NOTE_H         = 32;
const SEP_H          = 26;
const SCROLL_STEP_PX = 120;
const DEFAULT_NAME_RE = /^\d{17}(\.md)?$/;

const COLOR_HEX: Record<string, string> = {
  重要:"#b8860b", 紧急:"#c0392b", 存档:"#475569", 待办:"#0ea5e9", 隐私:"#8839ef",
};
const resolveTagColor = (c: string|null) => !c ? "var(--mk-hairline)" : (COLOR_HEX[c] ?? c);

function fmtDate(ms: number) {
  const d = new Date(ms), M = d.getMonth()+1, D = d.getDate();
  return {
    dateKey:   `${d.getFullYear()}-${String(M).padStart(2,"0")}-${String(D).padStart(2,"0")}`,
    dateLabel: `${M}月${D}日`,
    timeLabel: `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`,
  };
}

type EN = NoteSummary & { dateKey:string; dateLabel:string; timeLabel:string };
type FlatItem =
  | { kind:"sep";  dateKey:string; dateLabel:string; y:number }
  | { kind:"note"; note:EN; noteIndex:number; y:number };

function buildFlat(notes: EN[]): FlatItem[] {
  const items: FlatItem[] = [];
  let y=0, ni=0;
  const seen = new Set<string>();
  for (const n of notes) {
    if (!seen.has(n.dateKey)) {
      seen.add(n.dateKey);
      items.push({ kind:"sep", dateKey:n.dateKey, dateLabel:n.dateLabel, y });
      y += SEP_H;
    }
    items.push({ kind:"note", note:n, noteIndex:ni, y });
    y += NOTE_H;
    ni++;
  }
  return items;
}

function noteTop(flat: FlatItem[], idx: number): number {
  const f = flat.find((x): x is Extract<FlatItem,{kind:"note"}> =>
    x.kind==="note" && x.noteIndex===idx);
  return f ? f.y : 0;
}

interface Props {
  activeNote: string|null;
  activeZone: NoteZone;
  onClose: () => void;
  onOpenNote: (zone:NoteZone, name:string) => void;
}

export function TimelineView({ activeNote, activeZone, onClose, onOpenNote }: Props) {
  const [notes, setNotes]       = useState<EN[]>([]);
  const [activeIdx, setActive]  = useState(0);
  const [translateY, setTranslateY] = useState(0);

  const vpRef  = useRef<HTMLDivElement>(null);
  const accRef = useRef(0);
  const rafRef = useRef<number|null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const [def, inbox] = await Promise.all([
          notesService.list("default"),
          notesService.list("inbox"),
        ]);
        let extra: NoteSummary[] = [];
        try {
          const folders = await libraryService.listFolders();
          const pp = await Promise.all(
            folders.filter(f=>f.zone!=="default"&&f.zone!=="inbox")
                   .map(f=>notesService.list(f.zone))
          );
          extra = pp.flat();
        } catch { /* ok */ }
        if (gone) return;

        const filtered = [...def,...inbox,...extra].filter(n=>{
          const s = n.name.replace(/\.md$/i,"");
          if (DEFAULT_NAME_RE.test(s)) return false;
        return true;
        });
        filtered.sort((a,b)=>b.modified_ms-a.modified_ms);
        const en = filtered.map(n=>({...n,...fmtDate(n.modified_ms)}));
        setNotes(en);
        setActive(0);
      } catch(e){ console.error(e); }
    })();
    return ()=>{gone=true;};
  },[activeNote,activeZone]);

  // ── Sync translateY so active note sits in the vertical center ────────────
  const flat = buildFlat(notes);

  const sync = useCallback((idx: number) => {
    const vp = vpRef.current;
    if (!vp || notes.length===0) return;
    const vpH = vp.clientHeight;
    const el = vp.querySelector<HTMLElement>(`.timeline-note[data-note-index="${idx}"]`);
    const rowTop = el ? el.offsetTop : noteTop(flat, idx);
    const rowH   = el ? el.offsetHeight : NOTE_H;
    setTranslateY(vpH/2 - (rowTop + rowH/2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  useEffect(() => {
    let id1: number, id2: number;
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => sync(activeIdx));
    });
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
  }, [activeIdx, notes, sync]);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => sync(activeIdx));
    ro.observe(vp);
    return () => ro.disconnect();
  }, [activeIdx, sync]);

  // ── Wheel ─────────────────────────────────────────────────────────────────
  const onWheel = useCallback((e:React.WheelEvent)=>{
    e.preventDefault();
    accRef.current += e.deltaY;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(()=>{
      let s=0;
      while(accRef.current>= SCROLL_STEP_PX){s++;  accRef.current-=SCROLL_STEP_PX;}
      while(accRef.current<=-SCROLL_STEP_PX){s--;  accRef.current+=SCROLL_STEP_PX;}
      if(s!==0) setActive(p=>Math.max(0,Math.min(notes.length-1,p+s)));
    });
  },[notes.length]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){onClose();return;}
      if(e.key==="ArrowUp")  {e.preventDefault();setActive(p=>Math.max(0,p-1));}
      if(e.key==="ArrowDown"){e.preventDefault();setActive(p=>Math.min(notes.length-1,p+1));}
      if(e.key==="Enter"){const n=notes[activeIdx];if(n){onOpenNote(n.zone,n.name);onClose();}}
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[notes,activeIdx,onClose,onOpenNote]);

  const TRACK_X=52, DOT_AREA=48;

  return (
    <div className="timeline-overlay"
         onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="timeline-popup" data-popover-anchor onMouseDown={e=>e.stopPropagation()}>

        <div className="timeline-header">
          <span className="timeline-header-title">时间轴</span>
          <CloseButton className="timeline-header-close" onClick={onClose} title="关闭" aria-label="关闭" />
        </div>

        {notes.length===0 ? (
          <div className="timeline-empty">暂无已命名的笔记</div>
        ):(
          <div ref={vpRef} className="timeline-viewport" onWheel={onWheel}>
            <div className="timeline-fade-top"/>
            <div className="timeline-fade-bottom"/>
            <div className="timeline-track" style={{left:TRACK_X}}/>

            <div className="timeline-list"
                 style={{transform:`translateY(${translateY}px)`}}>
              {flat.map(item=>{
                if(item.kind==="sep") return (
                  <div key={item.dateKey} className="timeline-sep" style={{height:SEP_H}}>
                    <div className="timeline-sep-diamond" style={{left:TRACK_X-4}}/>
                    <div style={{width:DOT_AREA+14}}/>
                    <span className="timeline-sep-label">{item.dateLabel}</span>
                  </div>
                );

                const {note,noteIndex}=item;
                const isActive=noteIndex===activeIdx;
                const dist=Math.abs(noteIndex-activeIdx);
                const opacity=isActive?1:dist===1?0.62:dist===2?0.38:0.18;
                const scale=isActive?1:dist===1?0.978:0.96;
                const dotSize=isActive?9:6;
                const tagColor=resolveTagColor(note.color);

                return (
                  <div key={`${note.zone}:${note.name}`}
                       className="timeline-note"
                       data-note-index={noteIndex}
                       style={{height:NOTE_H,opacity,transform:`scale(${scale})`}}
                       onClick={()=>{
                         if(isActive){onOpenNote(note.zone,note.name);onClose();}
                         else setActive(noteIndex);
                       }}>
                    <div className="timeline-dot" style={{
                      left:TRACK_X-dotSize/2,width:dotSize,height:dotSize,
                      background:tagColor,
                      boxShadow:isActive&&note.color?`0 0 8px ${tagColor}88`:"none",
                    }}/>
                    <div style={{width:DOT_AREA}}/>
                    <div className="timeline-note-content" style={{paddingLeft:14}}>
                      <span className="timeline-note-title" style={{
                        fontSize:isActive?13:12, fontWeight:isActive?600:400,
                        color:isActive?"var(--mk-ink)":"var(--mk-body-muted)",
                        letterSpacing:isActive?"0.01em":"0",
                      }}>{note.title}</span>
                      <span className="timeline-note-time" style={{
                        fontSize:isActive?11.5:10, fontWeight:isActive?500:400,
                        color:isActive?"var(--mk-primary)"
                          :"color-mix(in srgb,var(--mk-body-muted) 50%,transparent)",
                      }}>{note.timeLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="timeline-footer">
          <span className="timeline-footer-hint">滚轮·↑↓浏览，点击选中，再次点击打开</span>
          <span className="timeline-footer-count">
            {notes.length>0?`${activeIdx+1} / ${notes.length}`:"—"}
          </span>
        </div>
      </div>
    </div>
  );
}
