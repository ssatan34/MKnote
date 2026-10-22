import type { QuickPocketDefinition } from "../utils/quickPocketRegistry";
import "./QuickPocketPicker.css";

interface QuickPocketPickerProps {
  pockets: QuickPocketDefinition[];
  loading: boolean;
  error: string | null;
  onOpen: (pocket: QuickPocketDefinition) => void;
}

export function QuickPocketPicker({ pockets, loading, error, onOpen }: QuickPocketPickerProps) {
  return <div className="quick-pocket-picker" role="menu" aria-label="选择 Quick Pocket">
    <div className="quick-pocket-picker-header"><span>选择 Pocket</span></div>
    {error && <p className="quick-pocket-picker-error">{error}</p>}
    {loading ? <p className="quick-pocket-picker-empty">加载中…</p> : <div className="quick-pocket-picker-list">
      {pockets.map((pocket) => <button type="button" role="menuitem" className="quick-pocket-picker-item" key={pocket.id} onClick={() => onOpen(pocket)}>
        <span className="quick-pocket-picker-item-name">{pocket.name}</span>
      </button>)}
    </div>}
  </div>;
}
