import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Info } from "lucide-react";
import { t } from "../../lib/i18n";
import { Tooltip } from "./Tooltip";

export interface SelectOption {
  value: string;
  label: string;
  /** Disabled entries are shown but not selectable (e.g. hardware-gated STT
   * tiers, cloud STT pending ADR-005 sign-off). */
  disabled?: boolean;
  /** Shown via the `Tooltip` primitive next to a disabled option
   * (design-system.md: no raw `title=`). Required reading for WHY an entry
   * cannot be picked (e.g. "requires a CUDA GPU"). */
  disabledReason?: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the trigger and listbox (i18n'd by the caller). */
  label: string;
}

function isEnabled(options: SelectOption[], index: number): boolean {
  return index >= 0 && index < options.length && !options[index].disabled;
}

/** Nearest enabled index at/after `start` in `dir` direction; falls back to
 * `start` unchanged if every option in that direction is disabled. */
function nearestEnabled(
  options: SelectOption[],
  start: number,
  dir: 1 | -1,
): number {
  let i = start;
  while (i >= 0 && i < options.length && !isEnabled(options, i)) {
    i += dir;
  }
  return i >= 0 && i < options.length ? i : start;
}

/**
 * Custom Select primitive (native <select> is banned by design-system.md).
 * Keyboard: Enter/Space/ArrowDown opens, arrows + Home/End navigate,
 * Enter selects, Esc closes and returns focus to the trigger. Options may be
 * individually disabled (with a reason surfaced via Tooltip) - disabled
 * entries are shown but skipped by keyboard navigation and ignored on click.
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
    const start = index >= 0 ? index : 0;
    setActiveIndex(
      isEnabled(options, start) ? start : nearestEnabled(options, start, 1),
    );
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
    if (option && !option.disabled) {
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
        setActiveIndex((i) =>
          nearestEnabled(options, Math.min(i + 1, options.length - 1), 1),
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => nearestEnabled(options, Math.max(i - 1, 0), -1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(nearestEnabled(options, 0, 1));
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(nearestEnabled(options, options.length - 1, -1));
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
              aria-disabled={option.disabled || undefined}
              // Pins the accessible name to the label alone - without this,
              // the disabled-reason Tooltip's text (a sibling node) would
              // otherwise be folded into the computed option name.
              aria-label={option.label}
              className={`ost-select-option${
                index === activeIndex ? " ost-select-option--active" : ""
              }${option.disabled ? " ost-select-option--disabled" : ""}`}
              onMouseEnter={() => {
                if (!option.disabled) {
                  setActiveIndex(index);
                }
              }}
              onClick={() => {
                if (!option.disabled) {
                  commit(index);
                }
              }}
            >
              <span>{option.label}</span>
              {option.disabled && option.disabledReason ? (
                <Tooltip text={option.disabledReason}>
                  <span
                    className="ost-select-option-hint"
                    tabIndex={0}
                    role="img"
                    aria-label={option.disabledReason}
                  >
                    <Info size={12} aria-hidden="true" />
                  </span>
                </Tooltip>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
