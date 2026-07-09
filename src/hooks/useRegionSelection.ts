import { useCallback, useRef, useState } from "react";
import { regionIpc, type RegionRect } from "../lib/ipc";

export interface Point {
  x: number;
  y: number;
}

/** Selection rectangle in CSS pixels (viewport coordinates). */
export interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Arrow-key cursor step in CSS px (Shift = fine step of 1). */
export const KEYBOARD_STEP = 16;
export const KEYBOARD_STEP_FINE = 1;
/** Selections smaller than this (CSS px) are treated as an accidental click. */
export const MIN_SELECTION_CSS_PX = 4;

type AnchorSource = "mouse" | "keyboard" | null;

function normalizeRect(a: Point, b: Point): CssRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Convert a CSS-px rect to PHYSICAL screen pixels (what IPC carries down). */
export function toPhysicalRect(
  rect: CssRect,
  devicePixelRatio: number,
): RegionRect {
  return {
    x: Math.round(rect.x * devicePixelRatio),
    y: Math.round(rect.y * devicePixelRatio),
    width: Math.round(rect.width * devicePixelRatio),
    height: Math.round(rect.height * devicePixelRatio),
  };
}

export interface UseRegionSelectionResult {
  /** True while a rectangle is being drawn (mouse drag or keyboard anchor). */
  selecting: boolean;
  /** Current keyboard/mouse cursor position (CSS px). */
  cursor: Point;
  /** The in-progress rectangle, or null when nothing is anchored. */
  rect: CssRect | null;
  /** Physical-pixel version of `rect` (shown as the SCR-02 size label). */
  physicalRect: RegionRect | null;
  onMouseDown: (point: Point) => void;
  onMouseMove: (point: Point) => void;
  onMouseUp: () => void;
  /** Keyboard-only path: arrows move, Space anchors, Enter confirms, Esc cancels. */
  onKeyDown: (key: string, shiftKey: boolean) => void;
}

/**
 * Selection state machine for the SCR-02 fullscreen overlay (AC-02.1).
 * Confirm sends physical pixel coords through the typed IPC wrapper; Esc
 * cancels without any capture event. Pure logic - the view wires DOM events.
 */
export function useRegionSelection(): UseRegionSelectionResult {
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const anchorSourceRef = useRef<AnchorSource>(null);
  const doneRef = useRef(false);

  const dpr = window.devicePixelRatio || 1;
  const rect = anchor ? normalizeRect(anchor, cursor) : null;
  const physicalRect = rect ? toPhysicalRect(rect, dpr) : null;

  const reset = useCallback(() => {
    setAnchor(null);
    anchorSourceRef.current = null;
  }, []);

  const confirm = useCallback(
    (candidate: CssRect | null) => {
      if (doneRef.current) {
        return;
      }
      if (
        !candidate ||
        candidate.width < MIN_SELECTION_CSS_PX ||
        candidate.height < MIN_SELECTION_CSS_PX
      ) {
        reset();
        return;
      }
      doneRef.current = true;
      void regionIpc.confirmSelection(toPhysicalRect(candidate, dpr));
    },
    [dpr, reset],
  );

  const cancel = useCallback(() => {
    if (doneRef.current) {
      return;
    }
    doneRef.current = true;
    // AC-02.1: Esc cancels with NO capture event emitted.
    void regionIpc.cancelSelection();
  }, []);

  const clampToViewport = (point: Point): Point => ({
    x: Math.min(Math.max(point.x, 0), window.innerWidth),
    y: Math.min(Math.max(point.y, 0), window.innerHeight),
  });

  const onMouseDown = useCallback((point: Point) => {
    setAnchor(point);
    setCursor(point);
    anchorSourceRef.current = "mouse";
  }, []);

  const onMouseMove = useCallback((point: Point) => {
    setCursor(point);
  }, []);

  const onMouseUp = useCallback(() => {
    if (anchorSourceRef.current !== "mouse") {
      return;
    }
    confirm(anchor ? normalizeRect(anchor, cursor) : null);
  }, [anchor, cursor, confirm]);

  const onKeyDown = useCallback(
    (key: string, shiftKey: boolean) => {
      const step = shiftKey ? KEYBOARD_STEP_FINE : KEYBOARD_STEP;
      switch (key) {
        case "Escape":
          cancel();
          break;
        case "Enter":
          confirm(rect);
          break;
        case " ": {
          setAnchor(cursor);
          anchorSourceRef.current = "keyboard";
          break;
        }
        case "ArrowLeft":
          setCursor((c) => clampToViewport({ x: c.x - step, y: c.y }));
          break;
        case "ArrowRight":
          setCursor((c) => clampToViewport({ x: c.x + step, y: c.y }));
          break;
        case "ArrowUp":
          setCursor((c) => clampToViewport({ x: c.x, y: c.y - step }));
          break;
        case "ArrowDown":
          setCursor((c) => clampToViewport({ x: c.x, y: c.y + step }));
          break;
        default:
          break;
      }
    },
    [cancel, confirm, cursor, rect],
  );

  return {
    selecting: anchor !== null,
    cursor,
    rect,
    physicalRect,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onKeyDown,
  };
}
