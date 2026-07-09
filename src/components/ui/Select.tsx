import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { t } from "../../lib/i18n";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the trigger and listbox (i18n'd by the caller). */
  label: string;
}

/**
 * Custom Select primitive (native <select> is banned by design-system.md).
 * Keyboard: Enter/Space/ArrowDown opens, arrows + Home/End navigate,
 * Enter selects, Esc closes and returns focus to the trigger.
 */
export function Select({ options, value, onChange, label }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const idBase = useId();

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (open) {
      listboxRef.current?.focus();
    }
  }, [open]);

  const openList = () => {
    const index = options.findIndex((o) => o.value === value);
    setActiveIndex(index >= 0 ? index : 0);
    setOpen(true);
  };

  const closeList = (refocus: boolean) => {
    setOpen(false);
    if (refocus) {
      triggerRef.current?.focus();
    }
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option) {
      onChange(option.value);
    }
    closeList(true);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        closeList(true);
        break;
      case "Tab":
        closeList(false);
        break;
      default:
        break;
    }
  };

  return (
    <span className="ost-select">
      <button
        type="button"
        ref={triggerRef}
        className="ost-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? closeList(true) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selected ? selected.label : t("ui.select.placeholder")}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          ref={listboxRef}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${idBase}-opt-${activeIndex}`}
          tabIndex={-1}
          className="ost-select-listbox"
          onKeyDown={onListKeyDown}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              closeList(false);
            }
          }}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${idBase}-opt-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`ost-select-option${
                index === activeIndex ? " ost-select-option--active" : ""
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
