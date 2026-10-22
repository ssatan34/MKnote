import type { SearchHit, NoteSummary, NoteZone } from "../../types";
import { TitleSearchField } from "../TitleSearchField";

interface TitleSearchPopoverProps {
  query: string;
  results: NoteSummary[];
  onQueryChange: (value: string) => void;
  onOpenNote: (zone: NoteZone, name: string) => void;
  onClose: () => void;
}

export function TitleSearchPopover({
  query,
  results,
  onQueryChange,
  onOpenNote,
  onClose,
}: TitleSearchPopoverProps) {
  return (
    <div
      className="search-popover search-popover--title"
      data-no-drag
      data-popover-anchor
      onMouseDown={(e) => e.stopPropagation()}
    >
      <TitleSearchField query={query} onQueryChange={onQueryChange} />
      <div className="search-results">
        {query.trim() ? (
          results.length ? (
            results.map((note) => (
              <button
                key={`${note.zone}:${note.name}`}
                type="button"
                onClick={() => {
                  onOpenNote(note.zone, note.name);
                  onClose();
                }}
              >
                {note.title}
              </button>
            ))
          ) : (
            <p>No matching titles</p>
          )
        ) : null}
      </div>
    </div>
  );
}

interface FullSearchPopoverProps {
  query: string;
  loading: boolean;
  results: SearchHit[];
  onQueryChange: (value: string) => void;
  onOpenNote: (zone: NoteZone, name: string) => void;
  onClose: () => void;
}

export function FullSearchPopover({
  query,
  loading,
  results,
  onQueryChange,
  onOpenNote,
  onClose,
}: FullSearchPopoverProps) {
  return (
    <div className="search-command-backdrop" data-no-drag onMouseDown={onClose}>
      <div
        className="search-popover search-popover--command"
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            onClose();
          }
        }}
      >
        <TitleSearchField
          query={query}
          onQueryChange={onQueryChange}
          inputId="mknote-command-search-input"
          testId="mknote-command-search-input"
          slowMotion
        />
        <div className="search-results">
          {query.trim() ? (
            loading ? (
              <p>搜索中…</p>
            ) : results.length ? (
              results.map((hit) => (
                <button
                  key={`${hit.zone}:${hit.name}`}
                  type="button"
                  onClick={() => {
                    onOpenNote(hit.zone as NoteZone, hit.name);
                    onClose();
                  }}
                >
                  {hit.title}
                </button>
              ))
            ) : (
              <p>没有匹配结果</p>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
