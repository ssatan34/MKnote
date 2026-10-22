import { memo, useState } from "react";
import { Icon } from "../Icon";

interface TemplateItem {
  id: string;
  icon: string;
}

const TEMPLATE_COLUMNS: TemplateItem[][] = [
  [
    { id: "会议记录", icon: "template_meeting" },
    { id: "今日工作", icon: "template_today" },
    { id: "沟通记录", icon: "template_comms" },
  ],
  [
    { id: "购物清单", icon: "template_shopping" },
    { id: "旅行准备", icon: "template_travel" },
  ],
  [
    { id: "阅读摘录", icon: "template_reading" },
    { id: "资料暂存", icon: "template_stash" },
    { id: "概念卡片", icon: "template_concept" },
  ],
];

interface TemplatePickerProps {
  open: boolean;
  onToggle: () => void;
  onSelect: (templateId: string) => void | Promise<void>;
}

function TemplatePickerComponent({ open, onToggle, onSelect }: TemplatePickerProps) {
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

  return (
    <div className="mk-anchor-popover-wrap template-picker-anchor" data-popover-anchor>
      <button
        type="button"
        className={`icon-btn hamburger-label${open ? " active" : ""}`}
        title="从模板新建"
        aria-label="从模板新建"
        aria-expanded={open}
        data-popover-trigger
        onPointerDown={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span className="line1" aria-hidden="true" />
        <span className="line2" aria-hidden="true" />
        <span className="line3" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="mk-floating-popover template-picker-popover"
          role="menu"
          aria-label="选择模板"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerLeave={() => setHoveredTemplate(null)}
        >
          <div className="template-picker-grid">
            {TEMPLATE_COLUMNS.map((col, colIndex) => (
              <div key={colIndex} className="template-picker-col">
                {col.map((item) => (
                  <button
                    className={`template-card${hoveredTemplate === item.id ? " is-hovered" : ""}`}
                    key={item.id}
                    type="button"
                    onPointerEnter={() => setHoveredTemplate(item.id)}
                    onFocus={() => setHoveredTemplate(item.id)}
                    onClick={() => {
                      void onSelect(item.id);
                    }}
                  >
                    <span className="template-card-overlay" aria-hidden="true" />
                    <span className="template-card-circle">
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span className="template-item-label">{item.id}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const TemplatePicker = memo(TemplatePickerComponent);
