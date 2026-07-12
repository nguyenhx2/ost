import { useRef, type ReactNode, type KeyboardEvent } from "react";

export interface TabItem {
  id: string;
  /** Tab label (i18n'd by the caller). */
  label: string;
  /** Tab panel content, rendered only while this tab is active (unmounted
   * otherwise - keeps inactive sections' effects/timers from running). */
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist (i18n'd by the caller). */
  label: string;
}

/**
 * Keyboard-accessible Tabs primitive (design-system.md): `role="tablist"` /
 * `role="tab"` / `role="tabpanel"`, roving tabindex, Left/Right/Home/End move
 * focus AND selection (manual-activation tabs would need a second Enter/Space,
 * which is unnecessary friction for a settings grouping - automatic
 * activation is the WAI-ARIA APG's recommended default here). Built from
 * tokens only (`primitives.css`).
 */
export function Tabs({ items, activeId, onChange, label }: TabsProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.id === activeId),
  );

  const focusAndSelect = (index: number) => {
    const target = items[(index + items.length) % items.length];
    onChange(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusAndSelect(activeIndex + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusAndSelect(activeIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        e.preventDefault();
        focusAndSelect(items.length - 1);
        break;
      default:
        break;
    }
  };

  const active = items[activeIndex];

  return (
    <div className="ost-tabs">
      <div role="tablist" aria-label={label} className="ost-tablist">
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) {
                  tabRefs.current.set(item.id, el);
                } else {
                  tabRefs.current.delete(item.id);
                }
              }}
              type="button"
              role="tab"
              id={`ost-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`ost-tabpanel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={`ost-tab${selected ? " ost-tab--active" : ""}`}
              onClick={() => onChange(item.id)}
              onKeyDown={onKeyDown}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <div
          role="tabpanel"
          id={`ost-tabpanel-${active.id}`}
          aria-labelledby={`ost-tab-${active.id}`}
          tabIndex={0}
          className="ost-tabpanel"
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
