import { useEffect, useRef, type CSSProperties } from "react";
import { Select } from "../components/ui";
import { useRegionSelection } from "../hooks/useRegionSelection";
import { t } from "../lib/i18n";
import { SOURCE_LANGUAGE_OPTIONS } from "../lib/languages";
import "./RegionSelectView.css";

/**
 * SCR-02: fullscreen dimmed selection overlay (AC-02.1).
 * Mouse: drag draws the rectangle, release confirms. Keyboard-only path:
 * arrows move the cursor, Space anchors, Enter confirms, Esc cancels.
 * Geometry (left/top/width/height) is runtime-computed and set via style;
 * all visual constants come from tokens.
 */
export function RegionSelectView() {
  const selection = useRegionSelection();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const { rect, physicalRect, cursor, selecting, sourceLanguage } = selection;

  const rectStyle: CSSProperties | undefined = rect
    ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
    : undefined;

  // Offset below the rect comes from the CSS margin token, not a literal.
  const dimensionsStyle: CSSProperties | undefined = rect
    ? { left: rect.x, top: rect.y + rect.height }
    : undefined;

  return (
    <div
      ref={rootRef}
      role="application"
      aria-label={t("select.overlayLabel")}
      tabIndex={0}
      className="region-select"
      onMouseDown={(e) => selection.onMouseDown({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => selection.onMouseMove({ x: e.clientX, y: e.clientY })}
      onMouseUp={() => selection.onMouseUp()}
      onKeyDown={(e) => {
        selection.onKeyDown(e.key, e.shiftKey);
        if (e.key === " " || e.key.startsWith("Arrow")) {
          e.preventDefault();
        }
      }}
    >
      <div className="region-select-hint">
        <span>{t("select.hintMouse")}</span>
        <span className="region-select-hint-secondary">
          {t("select.hintKeyboard")}
        </span>
        {/*
         * BR-07 source-language pin. It sits on the drag surface, so pointer
         * and keyboard events are stopped here to keep them from anchoring or
         * moving the selection while the Select is in use.
         */}
        <div
          className="region-select-language"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="region-select-language-label">
            {t("select.sourceLanguage")}
          </span>
          <Select
            label={t("select.sourceLanguage")}
            options={SOURCE_LANGUAGE_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            value={sourceLanguage}
            onChange={selection.setSourceLanguage}
          />
        </div>
      </div>

      {!selecting ? (
        <div
          className="region-select-cursor"
          data-testid="selection-cursor"
          style={{ left: cursor.x, top: cursor.y }}
        />
      ) : null}

      {rect ? (
        <div
          className="region-select-rect"
          data-testid="selection-rect"
          style={rectStyle}
        />
      ) : null}

      {physicalRect ? (
        <output
          className="region-select-dimensions"
          aria-label={t("select.dimensionsLabel")}
          style={dimensionsStyle}
        >
          {`${physicalRect.width} x ${physicalRect.height}`}
        </output>
      ) : null}
    </div>
  );
}
