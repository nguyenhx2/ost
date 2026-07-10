/*
 * Keyboard-event -> global-shortcut accelerator string (AC-04.1 hotkey capture).
 *
 * Pure, testable mapping used by the Settings hotkey-recorder. The output format
 * matches what the Rust side parses (tauri-plugin-global-shortcut / global-hotkey
 * `HotKey::from_str`): modifiers joined by `+` in a canonical order, then a
 * single main key. A binding with no non-Shift modifier is rejected (returns
 * `null`) so a bare letter can never hijack that key system-wide.
 */

/** `event.code` values that are themselves modifier keys (never a main key). */
const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

/** Minimal shape consumed here (a real KeyboardEvent satisfies it). */
export interface AcceleratorKeyEvent {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/**
 * Map a browser `KeyboardEvent.code` to the accelerator token the Rust parser
 * accepts. Returns `null` for a code with no stable mapping (e.g. a dead key).
 */
export function codeToKeyToken(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  // These `code` values are already the token the parser matches
  // (case-insensitively): F1-F24, ArrowUp/Down/Left/Right, Space, Enter, Tab,
  // Escape, Home, End, PageUp, PageDown, Insert, Delete, Backspace.
  const PASSTHROUGH =
    /^(F([1-9]|1[0-9]|2[0-4])|Arrow(Up|Down|Left|Right)|Space|Enter|Tab|Escape|Home|End|Page(Up|Down)|Insert|Delete|Backspace)$/;
  if (PASSTHROUGH.test(code)) {
    return code;
  }
  return null;
}

/**
 * Build the accelerator string from a keyboard event, or `null` when the combo
 * is incomplete: a modifier-only press, an unmappable key, or a combo without at
 * least one of Ctrl/Alt/Super (Shift alone is not enough to claim a global key).
 */
export function eventToAccelerator(e: AcceleratorKeyEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) {
    return null;
  }
  const key = codeToKeyToken(e.code);
  if (key === null) {
    return null;
  }
  const hasStrongModifier = e.ctrlKey || e.altKey || e.metaKey;
  if (!hasStrongModifier) {
    return null;
  }
  const parts: string[] = [];
  if (e.ctrlKey) {
    parts.push("Ctrl");
  }
  if (e.altKey) {
    parts.push("Alt");
  }
  if (e.shiftKey) {
    parts.push("Shift");
  }
  if (e.metaKey) {
    parts.push("Super");
  }
  parts.push(key);
  return parts.join("+");
}
